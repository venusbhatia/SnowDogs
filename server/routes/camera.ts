import { Router } from 'express';

type AnalyzeRequestBody = {
  imageUrl?: string;
};

type Checkpoint = {
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

type AdvisoryRequestBody = {
  checkpoint?: Checkpoint;
};

type CameraAnalysis = {
  road_surface: string;
  visibility: string;
  snow_coverage_percent: number;
  active_precipitation: string;
  hazards: string[];
  summary: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type CacheEntry = {
  expiresAt: number;
  payload: CameraAnalysis;
};

const CACHE_TTL_MS = 60_000;
const analyzeCache = new Map<string, CacheEntry>();
const router = Router();

function isValidCheckpoint(value: unknown): value is Checkpoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const checkpoint = value as Partial<Checkpoint>;
  return (
    typeof checkpoint.lat === 'number' &&
    typeof checkpoint.lng === 'number' &&
    typeof checkpoint.eta === 'string' &&
    typeof checkpoint.snowfall === 'number' &&
    typeof checkpoint.visibility === 'number' &&
    typeof checkpoint.windSpeed === 'number' &&
    typeof checkpoint.temperature === 'number' &&
    typeof checkpoint.roadSurface === 'string' &&
    typeof checkpoint.riskScore === 'number'
  );
}

function getGeminiText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text ?? '')
    .join('\n')
    .trim();
}

function parseJsonFromText(text: string): CameraAnalysis {
  const normalized = text.trim();

  try {
    return JSON.parse(normalized) as CameraAnalysis;
  } catch {
    const match = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!match) {
      throw new Error('Model did not return valid JSON');
    }
    return JSON.parse(match[1]) as CameraAnalysis;
  }
}

async function callGemini(model: string, payload: unknown): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error('Gemini request failed');
  }

  return data;
}

router.post('/analyze', async (req, res) => {
  const { imageUrl } = req.body as AnalyzeRequestBody;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'Invalid payload. Expected { imageUrl: string }' });
  }

  const cached = analyzeCache.get(imageUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.payload);
  }

  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return res.status(400).json({ error: 'Unable to fetch image from imageUrl' });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    const prompt = [
      'Analyze this highway camera image and return only valid JSON.',
      'Use this exact schema:',
      '{',
      '  "road_surface": "dry|wet|slushy|snow_covered|icy|unknown",',
      '  "visibility": "good|moderate|poor|very_poor",',
      '  "snow_coverage_percent": number,',
      '  "active_precipitation": "none|rain|snow|mixed|unknown",',
      '  "hazards": string[],',
      '  "summary": string',
      '}',
      'No markdown and no extra keys.'
    ].join('\n');

    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: 'application/json'
      }
    };

    const geminiResponse = await callGemini('gemini-2.5-flash', geminiPayload);
    const modelText = getGeminiText(geminiResponse);
    const parsed = parseJsonFromText(modelText);

    analyzeCache.set(imageUrl, {
      payload: parsed,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return res.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Camera analysis failed';
    return res.status(500).json({ error: message });
  }
});

router.post('/advisory', async (req, res) => {
  const { checkpoint } = req.body as AdvisoryRequestBody;

  if (!isValidCheckpoint(checkpoint)) {
    return res.status(400).json({
      error:
        'Invalid payload. Expected { checkpoint: { lat, lng, eta, snowfall, visibility, windSpeed, temperature, roadSurface, riskScore } }'
    });
  }

  const prompt = [
    'You are a winter driving safety assistant for Canadian highways.',
    'Write exactly 2 concise sentences with actionable driving advice.',
    'Do not include bullet points or disclaimers.',
    'Checkpoint data:',
    JSON.stringify(checkpoint)
  ].join('\n');

  const geminiPayload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.4
    }
  };

  try {
    const geminiResponse = await callGemini('gemini-2.5-flash-lite', geminiPayload);
    const advisory = getGeminiText(geminiResponse);

    if (!advisory) {
      return res.status(502).json({ error: 'No advisory returned by Gemini' });
    }

    return res.json({ advisory });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate advisory';
    return res.status(500).json({ error: message });
  }
});

export default router;
