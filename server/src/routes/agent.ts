import { Router, type Request } from 'express';

type InputReport = {
  text: string;
  source: string;
  timestamp: string;
};

type InputCheckpoint = {
  lat: number;
  lng: number;
  distanceKm: number;
  riskScore: number;
  etaTimestamp: string;
};

type RouteSummary = {
  origin: string;
  destination: string;
  distanceKm: number;
  durationHrs: number;
};

type AnalyzeRouteBody = {
  reports?: unknown;
  checkpoints?: unknown;
  routeSummary?: unknown;
};

type GeminiFunctionCall = {
  name?: string;
  args?: unknown;
};

type GeminiPart = {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: {
    name: string;
    response: unknown;
  };
};

type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: { message?: string };
};

type FunctionDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
};

const router = Router();

const SYSTEM_PROMPT =
  'You are a Canadian winter road safety intelligence agent. You receive unstructured driver reports from social media and cross-reference them with official government data and weather forecasts. Your job: geocode vague locations, verify reports against official sources, resolve conflicts between data sources (driver reports are often more current than government data which updates only 5 times daily), and produce a comprehensive route safety briefing. Be specific about Highway 11 and Highway 17 in Northern Ontario.';

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'geocode_location',
    description: 'Resolve a vague Canadian location description to coordinates and a normalized place name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        description: {
          type: 'STRING',
          description: 'A vague location description such as near White River or east of nipigon 11.'
        }
      },
      required: ['description']
    }
  },
  {
    name: 'get_official_road_condition',
    description:
      'Get nearest official Ontario 511 road surface/condition near a coordinate using cached route data when available.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lat: { type: 'NUMBER', description: 'Latitude in decimal degrees.' },
        lng: { type: 'NUMBER', description: 'Longitude in decimal degrees.' }
      },
      required: ['lat', 'lng']
    }
  },
  {
    name: 'get_weather',
    description: 'Get current weather near the target coordinate from Open-Meteo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lat: { type: 'NUMBER', description: 'Latitude in decimal degrees.' },
        lng: { type: 'NUMBER', description: 'Longitude in decimal degrees.' }
      },
      required: ['lat', 'lng']
    }
  },
  {
    name: 'assess_credibility',
    description: 'Assess driver report credibility using official data and weather context.',
    parameters: {
      type: 'OBJECT',
      properties: {
        report_text: { type: 'STRING', description: 'The report text from driver/social media.' },
        official_data: { type: 'STRING', description: 'Nearby official data summary.' },
        weather_summary: { type: 'STRING', description: 'Nearby weather summary.' }
      },
      required: ['report_text', 'official_data', 'weather_summary']
    }
  }
];

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isInputReport(value: unknown): value is InputReport {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const report = value as Partial<InputReport>;
  return (
    typeof report.text === 'string' &&
    report.text.trim() !== '' &&
    typeof report.source === 'string' &&
    typeof report.timestamp === 'string'
  );
}

function isInputCheckpoint(value: unknown): value is InputCheckpoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const checkpoint = value as Partial<InputCheckpoint>;
  return (
    typeof checkpoint.lat === 'number' &&
    typeof checkpoint.lng === 'number' &&
    typeof checkpoint.distanceKm === 'number' &&
    typeof checkpoint.riskScore === 'number' &&
    typeof checkpoint.etaTimestamp === 'string'
  );
}

function isRouteSummary(value: unknown): value is RouteSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const summary = value as Partial<RouteSummary>;
  return (
    typeof summary.origin === 'string' &&
    typeof summary.destination === 'string' &&
    typeof summary.distanceKm === 'number' &&
    typeof summary.durationHrs === 'number'
  );
}

function stripJsonFences(text: string): string {
  const completeFence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (completeFence?.[1]) {
    return completeFence[1].trim();
  }

  const trimmed = text.trimStart();
  if (trimmed.startsWith('```json') || trimmed.startsWith('```')) {
    const newlineIndex = trimmed.indexOf('\n');
    if (newlineIndex >= 0) {
      return trimmed.slice(newlineIndex + 1).trim();
    }
    return trimmed.replace(/^```json/i, '').replace(/^```/, '').trim();
  }

  return text.trim();
}

function parseJsonFromText(text: string): unknown {
  const normalized = stripJsonFences(text);

  try {
    return JSON.parse(normalized);
  } catch {
    const attempts = [
      normalized + '}',
      normalized + ']}',
      normalized + '}]}',
      normalized + '}}'
    ];

    for (const candidate of attempts) {
      try {
        return JSON.parse(candidate);
      } catch {
        // try next completion
      }
    }
    throw new Error('Failed to parse JSON from Gemini response');
  }
}

async function callGemini(
  model: string,
  payload: {
    contents: GeminiContent[];
    systemInstruction?: { role?: 'system'; parts: Array<{ text: string }> };
    tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
    generationConfig?: { temperature?: number; maxOutputTokens?: number };
  }
): Promise<GeminiResponse> {
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

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini request failed (${response.status})`);
  }

  return data;
}

function getGeminiText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').filter(Boolean).join('\n').trim();
}

function getFunctionCalls(data: GeminiResponse): GeminiFunctionCall[] {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.functionCall)
    .filter((call): call is GeminiFunctionCall => Boolean(call?.name));
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getCoordsFromRoadEntry(entry: unknown): { lat: number; lng: number } | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const row = entry as Record<string, unknown>;
  const lat =
    asNumber(row.lat) ??
    asNumber(row.latitude) ??
    asNumber(row.Latitude) ??
    asNumber(row.y) ??
    asNumber(row.Y);
  const lng =
    asNumber(row.lng) ??
    asNumber(row.lon) ??
    asNumber(row.long) ??
    asNumber(row.longitude) ??
    asNumber(row.Longitude) ??
    asNumber(row.x) ??
    asNumber(row.X);

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
}

function getRoadSurface(entry: unknown): string {
  if (!entry || typeof entry !== 'object') {
    return 'unknown';
  }

  const row = entry as Record<string, unknown>;
  const candidates = [
    row.road_surface,
    row.surface,
    row.condition,
    row.description,
    row.Condition,
    row.Surface,
    row.RoadCondition
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate;
    }
  }
  return 'unknown';
}

function getRoadLocation(entry: unknown): string {
  if (!entry || typeof entry !== 'object') {
    return 'Unknown location';
  }

  const row = entry as Record<string, unknown>;
  const candidates = [
    row.location,
    row.Location,
    row.route,
    row.RouteName,
    row.name,
    row.Name,
    row.description
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate;
    }
  }

  const coords = getCoordsFromRoadEntry(entry);
  if (!coords) {
    return 'Unknown location';
  }

  return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
}

function getServerBaseUrl(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol =
    typeof forwardedProto === 'string' && forwardedProto.trim() !== ''
      ? forwardedProto.split(',')[0].trim()
      : req.protocol || 'http';
  const host = req.get('host') || `localhost:${Number(process.env.PORT) || 3001}`;
  return `${protocol}://${host}`;
}

async function geocodeLocation(description: string): Promise<unknown> {
  const data = await callGemini('gemini-2.5-flash', {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Return ONLY JSON {lat: number, lng: number, resolved_name: string, confidence: number} for this Canadian location: ${description}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 256
    }
  });

  const text = getGeminiText(data);
  return parseJsonFromText(text);
}

async function getOfficialRoadCondition(baseUrl: string, lat: number, lng: number): Promise<unknown> {
  const localUrl = `${baseUrl}/api/road/conditions`;
  const response = await fetch(localUrl);
  if (!response.ok) {
    throw new Error(`Road conditions endpoint returned ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const rows =
    Array.isArray(payload) ? payload : Array.isArray((payload as { data?: unknown[] })?.data) ? ((payload as { data: unknown[] }).data || []) : [];

  if (rows.length === 0) {
    return {
      surface: 'unknown',
      location: 'No official data available',
      distance_km: null
    };
  }

  let nearest: { row: unknown; distanceKm: number } | null = null;

  for (const row of rows) {
    const coords = getCoordsFromRoadEntry(row);
    if (!coords) {
      continue;
    }

    const distanceKm = haversineKm(lat, lng, coords.lat, coords.lng);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { row, distanceKm };
    }
  }

  if (!nearest) {
    return {
      surface: 'unknown',
      location: 'Official data has no geocoded entries',
      distance_km: null
    };
  }

  return {
    surface: getRoadSurface(nearest.row),
    location: getRoadLocation(nearest.row),
    distance_km: Number(nearest.distanceKm.toFixed(2))
  };
}

async function getWeather(lat: number, lng: number): Promise<unknown> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('current', 'temperature_2m,snowfall,visibility,wind_speed_10m');
  url.searchParams.set('models', 'gem_hrdps_continental');
  url.searchParams.set('timezone', 'America/Toronto');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo returned ${response.status}`);
  }

  const payload = (await response.json()) as { current?: unknown };
  return payload.current ?? null;
}

async function assessCredibility(
  reportText: string,
  officialData: string,
  weatherSummary: string
): Promise<unknown> {
  const prompt =
    "Rate this driver report's credibility 0-1 given official data and weather. Return ONLY JSON {credibility: number, reasoning: string}.\n\n" +
    `Report: ${reportText}\n` +
    `Official data: ${officialData}\n` +
    `Weather: ${weatherSummary}`;

  const data = await callGemini('gemini-2.5-flash-lite', {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 200
    }
  });

  const text = getGeminiText(data);
  return parseJsonFromText(text);
}

async function executeTool(
  call: GeminiFunctionCall,
  context: { baseUrl: string }
): Promise<{ name: string; content: unknown }> {
  const name = call.name || 'unknown_tool';
  const args = (call.args && typeof call.args === 'object' ? call.args : {}) as Record<
    string,
    unknown
  >;

  try {
    if (name === 'geocode_location') {
      const description = typeof args.description === 'string' ? args.description : '';
      if (!description.trim()) {
        throw new Error('description is required');
      }
      const content = await geocodeLocation(description.trim());
      return { name, content };
    }

    if (name === 'get_official_road_condition') {
      const lat = asNumber(args.lat);
      const lng = asNumber(args.lng);
      if (lat === null || lng === null) {
        throw new Error('lat and lng are required numbers');
      }
      const content = await getOfficialRoadCondition(context.baseUrl, lat, lng);
      return { name, content };
    }

    if (name === 'get_weather') {
      const lat = asNumber(args.lat);
      const lng = asNumber(args.lng);
      if (lat === null || lng === null) {
        throw new Error('lat and lng are required numbers');
      }
      const content = await getWeather(lat, lng);
      return { name, content };
    }

    if (name === 'assess_credibility') {
      const reportText = typeof args.report_text === 'string' ? args.report_text : '';
      const officialData = typeof args.official_data === 'string' ? args.official_data : '';
      const weatherSummary = typeof args.weather_summary === 'string' ? args.weather_summary : '';

      if (!reportText) {
        throw new Error('report_text is required');
      }
      const content = await assessCredibility(reportText, officialData, weatherSummary);
      return { name, content };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name,
      content: { error: `Tool failed: ${message}` }
    };
  }
}

router.post('/analyze-route', async (req, res) => {
  try {
    const body = req.body as AnalyzeRouteBody;
    const reportsRaw = Array.isArray(body.reports) ? body.reports : null;
    const checkpointsRaw = Array.isArray(body.checkpoints) ? body.checkpoints : null;
    const routeSummaryRaw = body.routeSummary;

    if (!reportsRaw || !reportsRaw.every(isInputReport)) {
      return res.status(400).json({
        error: 'Invalid payload. reports must be an array of {text, source, timestamp}.'
      });
    }

    if (!checkpointsRaw || !checkpointsRaw.every(isInputCheckpoint)) {
      return res.status(400).json({
        error:
          'Invalid payload. checkpoints must be an array of {lat, lng, distanceKm, riskScore, etaTimestamp}.'
      });
    }

    if (!isRouteSummary(routeSummaryRaw)) {
      return res.status(400).json({
        error:
          'Invalid payload. routeSummary must be {origin, destination, distanceKm, durationHrs}.'
      });
    }

    const reports = reportsRaw;
    const checkpoints = checkpointsRaw;
    const routeSummary = routeSummaryRaw;
    const baseUrl = getServerBaseUrl(req);

    const conversation: GeminiContent[] = [
      {
        role: 'user',
        parts: [
          {
            text:
              'Analyze this winter route context. Use tools when needed to geocode locations, verify against official 511 data, and evaluate report credibility.\n\n' +
              JSON.stringify(
                {
                  reports,
                  checkpoints,
                  routeSummary
                },
                null,
                2
              )
          }
        ]
      }
    ];

    let stoppedCallingTools = false;

    for (let round = 0; round < 8; round += 1) {
      const response = await callGemini('gemini-2.5-flash', {
        systemInstruction: {
          role: 'system',
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: conversation,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      });

      const modelParts = response.candidates?.[0]?.content?.parts ?? [];
      conversation.push({
        role: 'model',
        parts: modelParts
      });

      const functionCalls = getFunctionCalls(response);
      if (functionCalls.length === 0) {
        stoppedCallingTools = true;
        break;
      }

      const toolResponseParts: GeminiPart[] = [];
      for (const call of functionCalls) {
        const toolResult = await executeTool(call, { baseUrl });
        toolResponseParts.push({
          functionResponse: {
            name: toolResult.name,
            response: {
              name: toolResult.name,
              content: toolResult.content
            }
          }
        });
      }

      conversation.push({
        role: 'user',
        parts: toolResponseParts
      });
    }

    if (!stoppedCallingTools) {
      conversation.push({
        role: 'user',
        parts: [
          {
            text: 'Stop tool calls now and provide your final analysis summary for this route.'
          }
        ]
      });
    }

    conversation.push({
      role: 'user',
      parts: [
        {
          text:
            "Based on your analysis, produce a JSON route briefing: {overall_risk: 'safe'|'moderate'|'hazardous'|'do_not_travel', recommended_action: string, risk_segments: Array<{location: string, lat: number, lng: number, risk: string, description: string}>, processed_reports: Array<{original_text: string, resolved_location: string, credibility: number, official_agrees: boolean}>, executive_summary: string (3-4 sentences a driver would hear as a voice briefing)}. Return ONLY the JSON."
        }
      ]
    });

    const finalResponse = await callGemini('gemini-2.5-flash', {
      systemInstruction: {
        role: 'system',
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: conversation,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    });

    const finalText = getGeminiText(finalResponse);
    const briefing = parseJsonFromText(finalText);
    return res.json(briefing);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent analysis failed';
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] agent analyze-route error: ${message}`);
    return res.status(500).json({ error: message });
  }
});

export default router;
