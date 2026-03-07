import type { CameraAnalysis, WeatherCheckpoint } from './utils/api';
import type { SampledCheckpoint } from './utils/sampling';

export type ForecastPoint = NonNullable<WeatherCheckpoint['weather']>;

export type EnrichedCheckpoint = SampledCheckpoint & {
  id: string;
  riskScore: number;
  riskColor: 'green' | 'yellow' | 'orange' | 'red';
  riskLabel: 'Low' | 'Moderate' | 'High' | 'Severe';
  forecast: ForecastPoint | null;
  cameraAnalysis?: CameraAnalysis;
};

export type RouteGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};
