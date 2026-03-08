import type { ForecastPoint, RiskColor, RiskLabel } from '../types';
import { colors } from '../theme';

function normalizeSurfaceText(value: unknown): string {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }

  return '';
}

export function computeRiskScore(weather: ForecastPoint | null, roadCondition: string | null): number {
  if (!weather && !roadCondition) {
    return 0;
  }

  let score = 0;

  if (weather) {
    if ((weather.snowfall ?? 0) > 2) {
      score += 3;
    } else if ((weather.snowfall ?? 0) > 0.5) {
      score += 1.5;
    }

    if ((weather.visibility ?? Number.POSITIVE_INFINITY) < 500) {
      score += 2;
    } else if ((weather.visibility ?? Number.POSITIVE_INFINITY) < 1000) {
      score += 1;
    }

    const wind = Math.max(weather.windSpeed ?? 0, weather.windGusts ?? 0);
    if (wind > 50) {
      score += 1.5;
    } else if (wind > 40) {
      score += 1;
    }

    const temp = weather.temperature;
    if (typeof temp === 'number' && temp <= 0 && temp >= -8) {
      score += 0.5;
    }

    const wmo = weather.weatherCode;
    if (typeof wmo === 'number') {
      if (wmo >= 66 && wmo <= 67) {
        score += 2;
      } else if ((wmo >= 71 && wmo <= 75) || wmo === 77 || wmo === 85 || wmo === 86) {
        score += 1;
      }
    }

    if ((weather.precipProb ?? 0) > 80 && (weather.snowfall ?? 0) > 0) {
      score += 0.5;
    }
  }

  const surface = normalizeSurfaceText(roadCondition);
  if (surface.includes('ice')) {
    score += 4;
  } else if (surface.includes('snow packed') || surface.includes('snow covered')) {
    score += 3;
  } else if (surface.includes('partly snow covered')) {
    score += 1.5;
  } else if (surface.includes('wet')) {
    score += 0.5;
  }

  return Math.min(score / 10, 1);
}

export function riskColor(score: number): RiskColor {
  if (score < 0.3) {
    return 'green';
  }
  if (score < 0.5) {
    return 'yellow';
  }
  if (score < 0.75) {
    return 'orange';
  }

  return 'red';
}

export function riskLabel(score: number): RiskLabel {
  if (score < 0.3) {
    return 'Clear';
  }
  if (score < 0.5) {
    return 'Caution';
  }
  if (score < 0.7) {
    return 'Hazardous';
  }

  return 'Dangerous';
}

export function riskHex(value: RiskColor | number): string {
  if (typeof value === 'number') {
    return riskHex(riskColor(value));
  }

  if (value === 'green') {
    return colors.green;
  }
  if (value === 'yellow') {
    return colors.yellow;
  }
  if (value === 'orange') {
    return colors.orange;
  }

  return colors.red;
}
