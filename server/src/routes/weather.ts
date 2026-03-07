import { Router } from 'express';

type Checkpoint = {
  lat: number;
  lng: number;
  etaTimestamp: string;
};

type WeatherRequestBody = {
  checkpoints?: unknown;
};

type HourlyPayload = {
  time?: string[];
  temperature_2m?: Array<number | null>;
  apparent_temperature?: Array<number | null>;
  snowfall?: Array<number | null>;
  precipitation?: Array<number | null>;
  weather_code?: Array<number | null>;
  visibility?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
};

type OpenMeteoEntry = {
  hourly?: HourlyPayload;
};

type EnrichedCheckpoint = {
  lat: number;
  lng: number;
  etaTimestamp: string;
  weather: {
    temperature: number | null;
    apparentTemp: number | null;
    snowfall: number | null;
    precipitation: number | null;
    weatherCode: number | null;
    visibility: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    precipProb: number | null;
    forecastTime: string | null;
  } | null;
};

const router = Router();
const MAX_CHECKPOINTS = 50;

function isValidCheckpoint(value: unknown): value is Checkpoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const cp = value as Partial<Checkpoint>;
  return (
    typeof cp.lat === 'number' &&
    Number.isFinite(cp.lat) &&
    typeof cp.lng === 'number' &&
    Number.isFinite(cp.lng) &&
    typeof cp.etaTimestamp === 'string' &&
    !Number.isNaN(Date.parse(cp.etaTimestamp))
  );
}

function normalizeResponse(data: unknown, expectedCount: number): OpenMeteoEntry[] {
  if (Array.isArray(data)) {
    return data as OpenMeteoEntry[];
  }

  if (data && typeof data === 'object') {
    if (expectedCount === 1) {
      return [data as OpenMeteoEntry];
    }

    const maybeObj = data as { responses?: unknown };
    if (Array.isArray(maybeObj.responses)) {
      return maybeObj.responses as OpenMeteoEntry[];
    }
  }

  return [];
}

function findClosestHourIndex(times: string[], etaTimestamp: string): number | null {
  const etaMs = Date.parse(etaTimestamp);
  if (Number.isNaN(etaMs)) {
    return null;
  }

  let closestIndex: number | null = null;
  let minDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i += 1) {
    const timeMs = Date.parse(times[i]);
    if (Number.isNaN(timeMs)) {
      continue;
    }

    const diff = Math.abs(timeMs - etaMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }

  return closestIndex;
}

function nullWeatherCheckpoint(cp: Checkpoint): EnrichedCheckpoint {
  return {
    lat: cp.lat,
    lng: cp.lng,
    etaTimestamp: cp.etaTimestamp,
    weather: null
  };
}

router.post('/', async (req, res) => {
  try {
    const body = req.body as WeatherRequestBody;
    const checkpointsRaw = body.checkpoints;

    if (!Array.isArray(checkpointsRaw) || checkpointsRaw.length === 0) {
      return res.status(400).json({
        error: 'Invalid payload. checkpoints must be a non-empty array.'
      });
    }

    if (checkpointsRaw.length > MAX_CHECKPOINTS) {
      return res.status(400).json({
        error: `Invalid payload. checkpoints cannot exceed ${MAX_CHECKPOINTS} items.`
      });
    }

    if (!checkpointsRaw.every(isValidCheckpoint)) {
      return res.status(400).json({
        error:
          'Invalid payload. Each checkpoint must be { lat: number, lng: number, etaTimestamp: string }.'
      });
    }

    const checkpoints = checkpointsRaw as Checkpoint[];
    const latitudes = checkpoints.map((cp) => cp.lat).join(',');
    const longitudes = checkpoints.map((cp) => cp.lng).join(',');

    const params = new URLSearchParams({
      latitude: latitudes,
      longitude: longitudes,
      hourly:
        'temperature_2m,apparent_temperature,snowfall,precipitation,weather_code,visibility,wind_speed_10m,wind_gusts_10m,precipitation_probability',
      models: 'gem_hrdps_continental',
      timezone: 'America/Toronto',
      forecast_days: '3'
    });

    let normalized: OpenMeteoEntry[] = [];

    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      if (!response.ok) {
        return res.json({
          checkpoints: checkpoints.map(nullWeatherCheckpoint)
        });
      }

      const data = (await response.json()) as unknown;
      normalized = normalizeResponse(data, checkpoints.length);
    } catch {
      return res.json({
        checkpoints: checkpoints.map(nullWeatherCheckpoint)
      });
    }

    const enriched: EnrichedCheckpoint[] = checkpoints.map((cp, idx) => {
      const hourly = normalized[idx]?.hourly;
      const times = hourly?.time;

      if (!hourly || !Array.isArray(times) || times.length === 0) {
        return nullWeatherCheckpoint(cp);
      }

      const closest = findClosestHourIndex(times, cp.etaTimestamp);
      if (closest === null) {
        return nullWeatherCheckpoint(cp);
      }

      return {
        lat: cp.lat,
        lng: cp.lng,
        etaTimestamp: cp.etaTimestamp,
        weather: {
          temperature: hourly.temperature_2m?.[closest] ?? null,
          apparentTemp: hourly.apparent_temperature?.[closest] ?? null,
          snowfall: hourly.snowfall?.[closest] ?? null,
          precipitation: hourly.precipitation?.[closest] ?? null,
          weatherCode: hourly.weather_code?.[closest] ?? null,
          visibility: hourly.visibility?.[closest] ?? null,
          windSpeed: hourly.wind_speed_10m?.[closest] ?? null,
          windGusts: hourly.wind_gusts_10m?.[closest] ?? null,
          precipProb: hourly.precipitation_probability?.[closest] ?? null,
          forecastTime: times[closest] ?? null
        }
      };
    });

    return res.json({ checkpoints: enriched });
  } catch {
    return res.status(500).json({ error: 'Failed to process weather request' });
  }
});

export default router;
