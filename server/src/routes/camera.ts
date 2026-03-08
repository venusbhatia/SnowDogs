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

function hasConfiguredGeminiKey(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/your_gemini_api_key/i.test(value);
}

function shouldUseGeminiFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /gemini_api_key is not configured|api key not valid|permission denied|invalid api key/i.test(message);
}

function formatEta(eta: string): string {
  const timestamp = new Date(eta);
  if (Number.isNaN(timestamp.getTime())) {
    return 'your checkpoint time';
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(timestamp);
}

function visibilityDescriptor(visibility: number): string {
  if (visibility <= 500) {
    return 'very limited';
  }
  if (visibility <= 1000) {
    return 'reduced';
  }
  if (visibility <= 5000) {
    return 'moderate';
  }

  return 'good';
}

function buildFallbackAnalysis() {
  return {
    road_surface: 'wet',
    visibility: 'good',
    snow_coverage_percent: 15,
    active_precipitation: false,
    hazards: ['Demo fallback analysis active'],
    summary:
      'SnowDogs is running in demo AI mode because GEMINI_API_KEY is not configured. Add a real Gemini key to replace this fallback with image-specific camera interpretation.'
  };
}

function buildFallbackAdvisory(checkpoint: AdvisoryCheckpoint) {
  const hazardParts: string[] = [];

  if (checkpoint.roadSurface && checkpoint.roadSurface !== 'unknown') {
    hazardParts.push(`${checkpoint.roadSurface.toLowerCase()} pavement`);
  }
  if (checkpoint.snowfall > 0) {
    hazardParts.push(`${checkpoint.snowfall} cm/h snowfall`);
  }
  if (checkpoint.visibility > 0) {
    hazardParts.push(`${visibilityDescriptor(checkpoint.visibility)} visibility`);
  }
  if (checkpoint.windSpeed >= 40) {
    hazardParts.push(`gusts near ${checkpoint.windSpeed} km/h`);
  }

  const hazardSummary = hazardParts.length > 0 ? hazardParts.join(', ') : 'mixed winter conditions';
  const action =
    checkpoint.riskScore >= 0.75
      ? 'Delay departure if possible, or slow down sharply and expect stopping distances to increase.'
      : checkpoint.riskScore >= 0.5
        ? 'Reduce speed, leave extra following distance, and review the hotspot before committing to the corridor.'
        : 'Drive defensively and keep monitoring the next checkpoints in case the corridor worsens.';

  return {
    advisory: `Around ${formatEta(checkpoint.eta)}, this checkpoint shows ${hazardSummary}. ${action}`,
    fallback: true
  };
}

function toAbsoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractImageUrlFromHtml(html: string, pageUrl: string): string | null {
  const ogImageMatch = html.match(
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  if (ogImageMatch?.[1]) {
    return toAbsoluteUrl(decodeHtmlEntities(ogImageMatch[1]), pageUrl);
  }

  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+\.(?:jpe?g)(?:\?[^"']*)?)["'][^>]*>/gi);
  for (const match of imgMatches) {
    if (match?.[1]) {
      return toAbsoluteUrl(decodeHtmlEntities(match[1]), pageUrl);
    }
  }

  return null;
}

async function fetchCameraImageBuffer(sourceUrl: string): Promise<Buffer> {
  const proxyPathMatch = sourceUrl.match(/^\/api\/road\/camera-proxy\/([^/?#]+)/);
  if (!proxyPathMatch?.[1]) {
    const directResponse = await fetch(sourceUrl);
    if (!directResponse.ok) {
      throw new Error('Failed to fetch imageUrl');
    }
    return Buffer.from(await directResponse.arrayBuffer());
  }

  const viewId = proxyPathMatch[1];
  const viewerUrl = `https://511on.ca/map/Cctv/${encodeURIComponent(viewId)}`;

  const viewerResponse = await fetch(viewerUrl, {
    headers: { Accept: 'image/*,text/html,*/*;q=0.8' }
  });
  if (!viewerResponse.ok) {
    throw new Error('Failed to fetch Ontario 511 camera view');
  }

  const contentType = (viewerResponse.headers.get('content-type') || '').toLowerCase();
  if (contentType.startsWith('image/')) {
    return Buffer.from(await viewerResponse.arrayBuffer());
  }

  const html = await viewerResponse.text();
  const extractedImageUrl = extractImageUrlFromHtml(html, viewerUrl);
  if (!extractedImageUrl) {
    throw new Error('Could not resolve camera image from Ontario 511');
  }

  const imageResponse = await fetch(extractedImageUrl, {
    headers: { Accept: 'image/*,*/*;q=0.8' }
  });
  if (!imageResponse.ok) {
    throw new Error('Failed to fetch resolved camera image');
  }

  return Buffer.from(await imageResponse.arrayBuffer());
}

function getGeminiText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('\n').trim();
}

function stripJsonFences(text: string): string {
  const completeFence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (completeFence?.[1]) {
    return completeFence[1].trim();
  }

  const trimmed = text.trimStart();
  if (trimmed.startsWith('```json') || trimmed.startsWith('```')) {
    const firstNewlineIndex = trimmed.indexOf('\n');
    if (firstNewlineIndex !== -1) {
      return trimmed.slice(firstNewlineIndex + 1).trim();
    }

    return trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .trim();
  }

  return text.trim();
}

function tryParsePossiblyTruncatedJson(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const candidates = [
      trimmed + '"}',
      trimmed + '"]}',
      trimmed + '"}]}',
      trimmed + '"}}'
    ];
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // try next candidate
      }
    }

    throw new Error('Unable to parse JSON');
  }
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
  if (!hasConfiguredGeminiKey(apiKey)) {
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

    if (!hasConfiguredGeminiKey(process.env.GEMINI_API_KEY)) {
      return res.json(buildFallbackAnalysis());
    }

    const cached = analyzeCache.get(imageUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const imageBuffer = await fetchCameraImageBuffer(imageUrl.trim());
    const imageBase64 = imageBuffer.toString('base64');

    const prompt =
      "You are an expert winter driving safety analyst examining an Ontario highway camera feed. Analyze this image in detail for winter driving conditions. Return ONLY valid JSON with these fields: road_surface (one of: bare_dry, wet, partly_snow_covered, snow_covered, ice_covered), visibility (one of: excellent, good, fair, poor, very_poor), snow_coverage_percent (0-100), active_precipitation (true/false), hazards (array of specific hazards you observe like 'black ice risk', 'snow drifts on shoulder', 'reduced lane markings visibility', 'slush accumulation'), summary (2-3 detailed sentences describing what you see, road condition, and specific safety advice for a driver approaching this area). Be thorough and specific in your analysis.";

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
        maxOutputTokens: 2048
      }
    };

    const geminiData = await callGemini('gemini-2.5-flash', geminiPayload);
    const responseText = getGeminiText(geminiData);
    const normalizedText = stripJsonFences(responseText);

    try {
      const parsed = tryParsePossiblyTruncatedJson(normalizedText) as unknown;
      analyzeCache.set(imageUrl, {
        data: parsed,
        expiresAt: Date.now() + ANALYZE_TTL_MS
      });
      return res.json(parsed);
    } catch {
      return res.status(502).json({ error: 'Analysis failed', raw: responseText });
    }
  } catch (error) {
    if (shouldUseGeminiFallback(error)) {
      return res.json(buildFallbackAnalysis());
    }

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

    if (!hasConfiguredGeminiKey(process.env.GEMINI_API_KEY)) {
      return res.json(buildFallbackAdvisory(checkpoint));
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
    if (shouldUseGeminiFallback(error)) {
      const { checkpoint } = req.body as AdvisoryBody;
      if (isValidCheckpoint(checkpoint)) {
        return res.json(buildFallbackAdvisory(checkpoint));
      }
    }

    const message = error instanceof Error ? error.message : 'Failed to generate advisory';
    return res.status(500).json({ error: message });
  }
});

export default router;
