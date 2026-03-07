type LngLat = [number, number];

type RouteResponse = {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distanceKm: number;
  durationHrs: number;
};

type WeatherCheckpointInput = {
  lat: number;
  lng: number;
  etaTimestamp: string;
};

type WeatherResponse = {
  checkpoints: Array<{
    checkpoint: WeatherCheckpointInput;
    forecast: {
      forecastTimestamp: string;
      temperature_2m: number | null;
      apparent_temperature: number | null;
      snowfall: number | null;
      precipitation: number | null;
      weather_code: number | null;
      visibility: number | null;
      wind_speed_10m: number | null;
      wind_gusts_10m: number | null;
      precipitation_probability: number | null;
    } | null;
  }>;
};

type CameraAnalysis = {
  road_surface: string;
  visibility: string;
  snow_coverage_percent: number;
  active_precipitation: string;
  hazards: string[];
  summary: string;
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

type AdvisoryResponse = {
  advisory: string;
};

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // ignore JSON parse errors and keep fallback message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function fetchRoute(origin: LngLat, destination: LngLat): Promise<RouteResponse> {
  return request<RouteResponse>('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination })
  });
}

export function fetchWeather(checkpoints: WeatherCheckpointInput[]): Promise<WeatherResponse> {
  return request<WeatherResponse>('/api/weather', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkpoints })
  });
}

export function fetchRoadConditions(): Promise<unknown> {
  return request<unknown>('/api/road/conditions');
}

export function fetchCameras(): Promise<unknown> {
  return request<unknown>('/api/road/cameras');
}

export function analyzeCamera(imageUrl: string): Promise<CameraAnalysis> {
  return request<CameraAnalysis>('/api/camera/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl })
  });
}

export function generateAdvisory(checkpoint: AdvisoryCheckpoint): Promise<AdvisoryResponse> {
  return request<AdvisoryResponse>('/api/camera/advisory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkpoint })
  });
}

export async function speakAlert(text: string): Promise<void> {
  const response = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    let message = `TTS failed with status ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // keep fallback message if error body is not JSON
    }
    throw new Error(message);
  }

  const audioBlob = await response.blob();
  const objectUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(objectUrl);

  try {
    await audio.play();
  } finally {
    const revoke = () => URL.revokeObjectURL(objectUrl);
    audio.addEventListener('ended', revoke, { once: true });
    audio.addEventListener('error', revoke, { once: true });
  }
}

export type {
  AdvisoryCheckpoint,
  AdvisoryResponse,
  CameraAnalysis,
  RouteResponse,
  WeatherCheckpointInput,
  WeatherResponse
};

