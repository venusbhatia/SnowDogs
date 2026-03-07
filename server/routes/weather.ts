import { Router } from 'express';

type Checkpoint = {
  lat: number;
  lng: number;
  etaTimestamp: string;
};

type WeatherRequestBody = {
  checkpoints?: Checkpoint[];
};

type HourlyData = {
  time: string[];
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

type OpenMeteoResponse = {
  hourly?: HourlyData;
};

const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'snowfall',
  'precipitation',
  'weather_code',
  'visibility',
  'wind_speed_10m',
  'wind_gusts_10m',
  'precipitation_probability'
] as const;

const router = Router();

function isValidCheckpoint(value: unknown): value is Checkpoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Checkpoint>;
  return (
    typeof candidate.lat === 'number' &&
    typeof candidate.lng === 'number' &&
    typeof candidate.etaTimestamp === 'string' &&
    !Number.isNaN(Date.parse(candidate.etaTimestamp))
  );
}

function normalizeForecastData(data: unknown, expectedCount: number): OpenMeteoResponse[] {
  if (Array.isArray(data)) {
    return data as OpenMeteoResponse[];
  }

  if (data && typeof data === 'object') {
    const objectData = data as { responses?: unknown[] };
    if (Array.isArray(objectData.responses)) {
      return objectData.responses as OpenMeteoResponse[];
    }

    if (expectedCount === 1) {
      return [data as OpenMeteoResponse];
    }
  }

  return [];
}

function findClosestHourIndex(hourlyTimes: string[], etaTimestamp: string): number {
  const etaMs = Date.parse(etaTimestamp);
  let closestIdx = 0;
  let minDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < hourlyTimes.length; i += 1) {
    const hourMs = Date.parse(hourlyTimes[i]);
    if (Number.isNaN(hourMs)) {
      continue;
    }

    const diff = Math.abs(hourMs - etaMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }

  return closestIdx;
}

router.post('/', async (req, res) => {
  const { checkpoints } = req.body as WeatherRequestBody;

  if (!Array.isArray(checkpoints) || checkpoints.length === 0 || !checkpoints.every(isValidCheckpoint)) {
    return res.status(400).json({
      error: 'Invalid payload. Expected { checkpoints: [{ lat, lng, etaTimestamp }] }'
    });
  }

  const latitudes = checkpoints.map((cp) => cp.lat).join(',');
  const longitudes = checkpoints.map((cp) => cp.lng).join(',');

  const params = new URLSearchParams({
    latitude: latitudes,
    longitude: longitudes,
    hourly: HOURLY_FIELDS.join(','),
    models: 'gem_hrdps_continental',
    timezone: 'America/Toronto'
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    const rawData = (await response.json()) as unknown;

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Open-Meteo request failed' });
    }

    const forecasts = normalizeForecastData(rawData, checkpoints.length);
    if (forecasts.length !== checkpoints.length) {
      return res.status(502).json({
        error: 'Unexpected Open-Meteo response shape for batched coordinates'
      });
    }

    const results = checkpoints.map((checkpoint, idx) => {
      const hourly = forecasts[idx]?.hourly;
      if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
        return {
          checkpoint,
          forecast: null
        };
      }

      const closestIdx = findClosestHourIndex(hourly.time, checkpoint.etaTimestamp);

      return {
        checkpoint,
        forecast: {
          forecastTimestamp: hourly.time[closestIdx],
          temperature_2m: hourly.temperature_2m?.[closestIdx] ?? null,
          apparent_temperature: hourly.apparent_temperature?.[closestIdx] ?? null,
          snowfall: hourly.snowfall?.[closestIdx] ?? null,
          precipitation: hourly.precipitation?.[closestIdx] ?? null,
          weather_code: hourly.weather_code?.[closestIdx] ?? null,
          visibility: hourly.visibility?.[closestIdx] ?? null,
          wind_speed_10m: hourly.wind_speed_10m?.[closestIdx] ?? null,
          wind_gusts_10m: hourly.wind_gusts_10m?.[closestIdx] ?? null,
          precipitation_probability: hourly.precipitation_probability?.[closestIdx] ?? null
        }
      };
    });

    return res.json({ checkpoints: results });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

export default router;
