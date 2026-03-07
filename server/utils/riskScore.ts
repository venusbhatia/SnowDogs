type WeatherInput = {
  snowfall?: number | null;
  visibility?: number | null;
  wind_speed_10m?: number | null;
  temperature_2m?: number | null;
  weather_code?: number | null;
};

type RoadConditionInput =
  | string
  | {
      surface?: string | null;
      road_surface?: string | null;
      condition?: string | null;
      description?: string | null;
    };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toText(value: RoadConditionInput): string {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }

  return (
    value.surface ||
    value.road_surface ||
    value.condition ||
    value.description ||
    ''
  ).toLowerCase();
}

export function calculateRiskScore(
  weather: WeatherInput = {},
  roadCondition: RoadConditionInput = ''
): number {
  let score = 0;

  const snowfall = Number(weather.snowfall ?? 0);
  const visibility = Number(weather.visibility ?? Number.POSITIVE_INFINITY);
  const wind = Number(weather.wind_speed_10m ?? 0);
  const temp = Number(weather.temperature_2m ?? Number.NaN);
  const wmo = Number(weather.weather_code ?? Number.NaN);
  const surfaceText = toText(roadCondition);

  if (snowfall > 2) {
    score += 3;
  } else if (snowfall > 0.5) {
    score += 1.5;
  }

  if (visibility < 500) {
    score += 2;
  } else if (visibility < 1000) {
    score += 1;
  }

  if (wind > 50) {
    score += 1.5;
  } else if (wind > 40) {
    score += 1;
  }

  if (!Number.isNaN(temp) && temp >= -8 && temp <= 0) {
    score += 0.5;
  }

  if (!Number.isNaN(wmo)) {
    if (wmo >= 66 && wmo <= 67) {
      score += 2;
    } else if (wmo >= 71 && wmo <= 75) {
      score += 1;
    }
  }

  if (surfaceText.includes('ice')) {
    score += 4;
  } else if (surfaceText.includes('snow packed') || surfaceText.includes('snow covered')) {
    score += 3;
  } else if (surfaceText.includes('partly snow covered')) {
    score += 1.5;
  }

  return clamp(score / 10, 0, 1);
}

export function riskToColor(risk: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (risk < 0.25) {
    return 'green';
  }
  if (risk < 0.5) {
    return 'yellow';
  }
  if (risk < 0.75) {
    return 'orange';
  }
  return 'red';
}

export function riskToLabel(risk: number): 'Low' | 'Moderate' | 'High' | 'Severe' {
  if (risk < 0.25) {
    return 'Low';
  }
  if (risk < 0.5) {
    return 'Moderate';
  }
  if (risk < 0.75) {
    return 'High';
  }
  return 'Severe';
}

export function adjustedSpeed(postedSpeedKmh: number, risk: number): number {
  const safePosted = Math.max(0, postedSpeedKmh);
  const cappedRisk = clamp(risk, 0, 1);

  if (cappedRisk < 0.25) {
    return safePosted;
  }
  if (cappedRisk < 0.5) {
    return Math.max(20, Math.round(safePosted * 0.9));
  }
  if (cappedRisk < 0.75) {
    return Math.max(20, Math.round(safePosted * 0.75));
  }
  return Math.max(20, Math.round(safePosted * 0.6));
}
