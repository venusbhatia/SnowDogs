export type LngLat = [number, number];

export type RouteSearchPayload = {
  origin: LngLat;
  destination: LngLat;
  departureTime: Date;
  originLabel: string;
  destinationLabel: string;
};

export type RouteGeometry = {
  type: 'LineString';
  coordinates: LngLat[];
};

export interface RouteResponse {
  geometry: RouteGeometry;
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
  visibility: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor' | string;
  snow_coverage_percent: number;
  active_precipitation: boolean;
  hazards: string[];
  summary: string;
}

export interface Advisory {
  advisory: string;
}

export type ForecastPoint = NonNullable<WeatherCheckpoint['weather']>;

export type SampledCheckpoint = {
  lat: number;
  lng: number;
  distanceKm: number;
  etaTimestamp: string;
  etaLocal: string;
};

export type RiskColor = 'green' | 'yellow' | 'orange' | 'red';
export type RiskLabel = 'Clear' | 'Caution' | 'Hazardous' | 'Dangerous';

export type EnrichedCheckpoint = SampledCheckpoint & {
  id: string;
  riskScore: number;
  riskColor: RiskColor;
  riskLabel: RiskLabel;
  forecast: ForecastPoint | null;
  cameraUrl?: string | null;
  cameraAnalysis?: CameraAnalysis;
};

export type RouteInfo = {
  distanceKm: number;
  durationHrs: number;
  distanceM: number;
  durationS: number;
};

export type RiskZoneSummary = {
  green: number;
  yellow: number;
  orange: number;
  red: number;
};

export type ScanStage = 'idle' | 'route' | 'weather' | 'roads' | 'cameras' | 'risk' | 'complete' | 'error';

export type CameraScanProgress = {
  completed: number;
  total: number;
};

export type Report = {
  id: string;
  text: string;
  source: 'app' | 'social_media';
  timestamp: string;
  processed: boolean;
};

export type AgentRiskSegment = {
  location: string;
  lat: number;
  lng: number;
  risk: string;
  description: string;
};

export type ProcessedReport = {
  original_text: string;
  resolved_location: string;
  credibility: number;
  official_agrees: boolean;
};

export type AgentBriefing = {
  overall_risk: 'safe' | 'moderate' | 'hazardous' | 'do_not_travel' | string;
  recommended_action: string;
  risk_segments: AgentRiskSegment[];
  processed_reports: ProcessedReport[];
  executive_summary: string;
};
