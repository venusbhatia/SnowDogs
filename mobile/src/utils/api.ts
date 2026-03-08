import type {
  Advisory,
  CameraAnalysis,
  Checkpoint,
  RouteResponse,
  WeatherCheckpoint
} from '../types';
import { toApiUrl } from './config';

type ApiError = { error?: string; fallback?: boolean; text?: string };

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchRoute(
  origin: [number, number],
  destination: [number, number]
): Promise<RouteResponse> {
  try {
    const response = await fetch(toApiUrl('/api/route'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Route request failed (${response.status})`));
    }

    return (await response.json()) as RouteResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown route fetch error';
    throw new Error(`Failed to fetch route: ${message}`);
  }
}

export async function fetchWeather(checkpoints: Checkpoint[]): Promise<WeatherCheckpoint[]> {
  try {
    const response = await fetch(toApiUrl('/api/weather'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpoints })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Weather request failed (${response.status})`));
    }

    const payload = (await response.json()) as { checkpoints?: WeatherCheckpoint[] } | WeatherCheckpoint[];
    if (Array.isArray(payload)) {
      return payload;
    }

    return Array.isArray(payload.checkpoints) ? payload.checkpoints : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown weather fetch error';
    throw new Error(`Failed to fetch weather checkpoints: ${message}`);
  }
}

export async function fetchRoadConditions(): Promise<unknown[]> {
  try {
    const response = await fetch(toApiUrl('/api/road/conditions'));

    if (!response.ok) {
      throw new Error(await parseError(response, `Road conditions request failed (${response.status})`));
    }

    const payload = (await response.json()) as { data?: unknown[] } | unknown[];
    return Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown road conditions fetch error';
    throw new Error(`Failed to fetch road conditions: ${message}`);
  }
}

export async function fetchNearbyCameras(lat: number, lng: number, radius = 20): Promise<unknown[]> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radius)
    });

    const response = await fetch(toApiUrl(`/api/road/cameras/near?${params.toString()}`));

    if (!response.ok) {
      throw new Error(await parseError(response, `Nearby cameras request failed (${response.status})`));
    }

    const payload = (await response.json()) as { data?: unknown[] } | unknown[];
    if (!Array.isArray(payload) && Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload)) {
      return payload;
    }

    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown nearby cameras fetch error';
    throw new Error(`Failed to fetch nearby cameras: ${message}`);
  }
}

export async function analyzeCamera(imageUrl: string): Promise<CameraAnalysis> {
  try {
    const normalizedImageUrl = /^https?:\/\//i.test(imageUrl) ? imageUrl : toApiUrl(imageUrl);

    const response = await fetch(toApiUrl('/api/camera/analyze'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: normalizedImageUrl })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Camera analysis failed (${response.status})`));
    }

    return (await response.json()) as CameraAnalysis;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown camera analysis error';
    throw new Error(`Failed to analyze camera image: ${message}`);
  }
}

export async function generateAdvisory(checkpoint: {
  lat: number;
  lng: number;
  eta: string;
  snowfall: number;
  visibility: number;
  windSpeed: number;
  temperature: number;
  roadSurface: string;
  riskScore: number;
}): Promise<Advisory> {
  try {
    const response = await fetch(toApiUrl('/api/camera/advisory'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpoint })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Advisory generation failed (${response.status})`));
    }

    return (await response.json()) as Advisory;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown advisory generation error';
    throw new Error(`Failed to generate advisory: ${message}`);
  }
}
