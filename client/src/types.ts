import type { CameraAnalysis, WeatherCheckpoint } from './utils/api';
import type { SampledCheckpoint } from './utils/sampling';

export type ForecastPoint = NonNullable<WeatherCheckpoint['weather']>;

export type EnrichedCheckpoint = SampledCheckpoint & {
  id: string;
  riskScore: number;
  riskColor: 'green' | 'yellow' | 'orange' | 'red';
  riskLabel: 'Clear' | 'Caution' | 'Hazardous' | 'Dangerous';
  forecast: ForecastPoint | null;
  cameraUrl?: string | null;
  _cameraUrl?: string | null;
  cameraAnalysis?: CameraAnalysis;
};

export type RouteGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};
