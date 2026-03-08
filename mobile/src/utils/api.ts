import type {
  Advisory,
  AgentBriefing,
  CameraAnalysis,
  Checkpoint,
  Report,
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

export async function fetchReports(): Promise<Report[]> {
  try {
    const response = await fetch(toApiUrl('/api/reports'));
    if (!response.ok) {
      throw new Error(await parseError(response, `Reports request failed (${response.status})`));
    }
    const payload = (await response.json()) as unknown;
    if (Array.isArray(payload)) return payload as Report[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { reports?: unknown[] }).reports)) {
      return (payload as { reports: Report[] }).reports;
    }
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reports fetch error';
    throw new Error(`Failed to fetch reports: ${message}`);
  }
}

export async function submitReport(text: string, source: 'app' | 'social_media'): Promise<Report> {
  try {
    const response = await fetch(toApiUrl('/api/reports/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source })
    });
    if (!response.ok) {
      throw new Error(await parseError(response, `Submit failed (${response.status})`));
    }
    return (await response.json()) as Report;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown submit error';
    throw new Error(`Failed to submit report: ${message}`);
  }
}

export async function runAgentAnalysis(payload: {
  reports: Array<{ text: string; source: string; timestamp: string }>;
  checkpoints: Array<{ lat: number; lng: number; distanceKm: number; riskScore: number; etaTimestamp: string }>;
  routeSummary: { origin: string; destination: string; distanceKm: number; durationHrs: number };
}): Promise<AgentBriefing> {
  try {
    const response = await fetch(toApiUrl('/api/agent/analyze-route'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await parseError(response, `Agent request failed (${response.status})`));
    }
    return (await response.json()) as AgentBriefing;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown agent error';
    throw new Error(`Agent analysis failed: ${message}`);
  }
}
