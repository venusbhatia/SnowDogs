import { Router } from 'express';

type AnalyzeBody = {
  imageUrl?: unknown;
};

type AdvisoryCheckpoint = {
  lat: number;
  lng: number;
  eta: string;
  snowfall: number;
  visibility: number;
  windSpeed: number;
  temperature: number;
  roadSurface: string;
  riskScore: number;
};

type AdvisoryBody = {
  checkpoint?: unknown;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type AnalyzeCacheEntry = {
  expiresAt: number;
  data: unknown;
};

const router = Router();
const ANALYZE_TTL_MS = 120_000;
const analyzeCache = new Map<string, AnalyzeCacheEntry>();

function getGeminiText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('\n').trim();
}

function stripJsonFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return text.trim();
}

function isValidCheckpoint(value: unknown): value is AdvisoryCheckpoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const cp = value as Partial<AdvisoryCheckpoint>;
  return (
    typeof cp.lat === 'number' &&
    typeof cp.lng === 'number' &&
    typeof cp.eta === 'string' &&
    typeof cp.snowfall === 'number' &&
    typeof cp.visibility === 'number' &&
    typeof cp.windSpeed === 'number' &&
    typeof cp.temperature === 'number' &&
    typeof cp.roadSurface === 'string' &&
    typeof cp.riskScore === 'number'
  );
}

async function callGemini(model: string, payload: unknown) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as GeminiResponse & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini request failed (${response.status})`);
  }

  return data;
}

router.post('/analyze', async (req, res) => {
  try {
    const { imageUrl } = req.body as AnalyzeBody;
    if (typeof imageUrl !== 'string' || imageUrl.trim() === '') {
      return res.status(400).json({ error: 'Invalid payload. Expected { imageUrl: string }' });
    }

    const cached = analyzeCache.get(imageUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return res.status(400).json({ error: 'Failed to fetch imageUrl' });
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const imageBase64 = imageBuffer.toString('base64');

    const prompt =
      "Analyze this Ontario highway camera image for winter driving conditions. Return ONLY valid JSON, no markdown fences: {road_surface: 'bare_dry'|'wet'|'partly_snow_covered'|'snow_covered'|'ice_covered', visibility: 'good'|'fair'|'poor', snow_coverage_percent: 0-100, active_precipitation: boolean, hazards: string[], summary: string}";

    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 300
      }
    };

    const geminiData = await callGemini('gemini-2.5-flash', geminiPayload);
    const responseText = getGeminiText(geminiData);
    const normalizedText = stripJsonFences(responseText);

    try {
      const parsed = JSON.parse(normalizedText) as unknown;
      analyzeCache.set(imageUrl, {
        data: parsed,
        expiresAt: Date.now() + ANALYZE_TTL_MS
      });
      return res.json(parsed);
    } catch {
      return res.status(502).json({ error: 'Analysis failed', raw: responseText });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Camera analysis failed';
    return res.status(500).json({ error: message });
  }
});

router.post('/advisory', async (req, res) => {
  try {
    const { checkpoint } = req.body as AdvisoryBody;
    if (!isValidCheckpoint(checkpoint)) {
      return res.status(400).json({
        error:
          'Invalid payload. Expected checkpoint with lat, lng, eta, snowfall, visibility, windSpeed, temperature, roadSurface, riskScore.'
      });
    }

    const prompt = [
      'You are a Canadian winter driving safety advisor.',
      `Given this data: lat=${checkpoint.lat}, lng=${checkpoint.lng}, eta=${checkpoint.eta}, snowfall=${checkpoint.snowfall}, visibility=${checkpoint.visibility}, windSpeed=${checkpoint.windSpeed}, temperature=${checkpoint.temperature}, roadSurface=${checkpoint.roadSurface}, riskScore=${checkpoint.riskScore}.`,
      'Generate exactly 2 sentences: first sentence describes the hazard, second sentence gives specific actionable advice. Be direct and specific about location and timing.'
    ].join(' ');

    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 150
      }
    };

    const geminiData = await callGemini('gemini-2.5-flash-lite', geminiPayload);
    const advisory = getGeminiText(geminiData);

    return res.json({ advisory });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate advisory';
    return res.status(500).json({ error: message });
  }
});

export default router;
