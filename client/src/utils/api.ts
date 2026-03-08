export interface RouteResponse {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distanceKm: number | string;
  durationHrs: number | string;
  distanceM: number;
  durationS: number;
}

export interface Checkpoint {
  lat: number;
  lng: number;
  etaTimestamp: string;
}

export interface WeatherCheckpoint extends Checkpoint {
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
}

export interface CameraAnalysis {
  road_surface: 'bare_dry' | 'wet' | 'partly_snow_covered' | 'snow_covered' | 'ice_covered' | string;
  visibility: 'good' | 'fair' | 'poor' | string;
  snow_coverage_percent: number;
  active_precipitation: boolean;
  hazards: string[];
  summary: string;
}

export interface Advisory {
  advisory: string;
}

export interface CloudinaryEnhanceResult {
  originalUrl: string;
  enhancedUrl: string;
  publicId: string;
  vision: {
    road_surface: string;
    visibility: string;
    snow_coverage_percent: number;
    hazards: string[];
    raw_responses: Array<{ prompt: string; value: string }>;
  };
}

type ApiError = { error?: string; fallback?: boolean; text?: string };

let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_authToken) {
    headers['Authorization'] = `Bearer ${_authToken}`;
  }
  if (extra) {
    Object.assign(headers, extra);
  }
  return headers;
}

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
    const response = await fetch('/api/route', {
      method: 'POST',
      headers: authHeaders(),
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
    const response = await fetch('/api/weather', {
      method: 'POST',
      headers: authHeaders(),
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

export async function fetchRoadConditions(): Promise<any[]> {
  try {
    const response = await fetch('/api/road/conditions');

    if (!response.ok) {
      throw new Error(await parseError(response, `Road conditions request failed (${response.status})`));
    }

    const payload = (await response.json()) as { data?: any[] } | any[];
    return Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown road conditions fetch error';
    throw new Error(`Failed to fetch road conditions: ${message}`);
  }
}

export async function fetchNearbyCameras(lat: number, lng: number, radius = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radius)
    });

    const response = await fetch(`/api/road/cameras/near?${params.toString()}`);

    if (!response.ok) {
      throw new Error(await parseError(response, `Nearby cameras request failed (${response.status})`));
    }

    const payload = (await response.json()) as { data?: any[] } | any[];
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
    const normalizedImageUrl =
      imageUrl.startsWith('/') ? `${window.location.origin}${imageUrl}` : imageUrl;

    const response = await fetch('/api/camera/analyze', {
      method: 'POST',
      headers: authHeaders(),
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

export async function enhanceCamera(
  imageUrl: string,
  cameraId?: string
): Promise<CloudinaryEnhanceResult> {
  try {
    const response = await fetch('/api/camera/enhance', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ imageUrl, cameraId })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Enhance failed (${response.status})`));
    }

    return (await response.json()) as CloudinaryEnhanceResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown camera enhancement error';
    throw new Error(`Failed to enhance camera image: ${message}`);
  }
}

export interface AdvisoryCheckpoint {
  lat: number;
  lng: number;
  eta: string;
  snowfall: number;
  visibility: number;
  windSpeed: number;
  temperature: number;
  roadSurface: string;
  riskScore: number;
}

export async function generateAdvisory(checkpoint: AdvisoryCheckpoint): Promise<Advisory> {
  try {
    const response = await fetch('/api/camera/advisory', {
      method: 'POST',
      headers: authHeaders(),
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

export async function speakAlert(text: string): Promise<void> {
  try {
    const response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Voice request failed (${response.status})`));
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as ApiError;
      if (payload.fallback) {
        if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance === 'undefined') {
          throw new Error('Browser speech synthesis is not supported');
        }

        await new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(payload.text || text);
          utterance.rate = 0.9;
          utterance.pitch = 1;
          utterance.onend = () => resolve();
          utterance.onerror = () => reject(new Error('Browser TTS playback failed'));
          window.speechSynthesis.speak(utterance);
        });
        return;
      }

      throw new Error(payload.error || 'Unexpected JSON response from voice endpoint');
    }

    const audioBlob = await response.blob();
    const objectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(objectUrl);

    try {
      await audio.play();
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Audio playback failed'));
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown voice alert error';
    throw new Error(`Failed to speak alert: ${message}`);
  }
}
