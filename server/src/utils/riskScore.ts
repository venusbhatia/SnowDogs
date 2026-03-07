export interface WeatherData {
  snowfall: number;
  visibility: number;
  windSpeed: number;
  windGusts: number;
  temperature: number;
  weatherCode: number;
  precipProb: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasSnowVariant(code: number): boolean {
  return (code >= 71 && code <= 75) || code === 77 || code === 85 || code === 86;
}

export function calculateRiskScore(weather: WeatherData | null, roadCondition: string | null): number {
  const surface = (roadCondition || '').toLowerCase();

  if (!weather && surface.trim() === '') {
    return 0;
  }

  let score = 0;

  if (weather) {
    if (weather.snowfall > 2) {
      score += 3;
    } else if (weather.snowfall > 0.5) {
      score += 1.5;
    }

    if (weather.visibility < 500) {
      score += 2;
    } else if (weather.visibility < 1000) {
      score += 1;
    }

    const wind = Math.max(weather.windSpeed, weather.windGusts);
    if (wind > 50) {
      score += 1.5;
    } else if (wind > 40) {
      score += 1;
    }

    if (weather.temperature <= 0 && weather.temperature >= -8) {
      score += 0.5;
    }

    if (weather.weatherCode >= 66 && weather.weatherCode <= 67) {
      score += 2;
    } else if (hasSnowVariant(weather.weatherCode)) {
      score += 1;
    }

    if (weather.precipProb > 80 && weather.snowfall > 0) {
      score += 0.5;
    }
  }

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

export function riskToColor(score: number): string {
  const normalized = clamp(score, 0, 1);

  if (normalized < 0.3) {
    return '#22c55e';
  }
  if (normalized < 0.5) {
    return '#eab308';
  }
  if (normalized < 0.7) {
    return '#f97316';
  }
  return '#ef4444';
}

export function riskToLabel(score: number): string {
  const normalized = clamp(score, 0, 1);

  if (normalized < 0.3) {
    return 'Clear';
  }
  if (normalized < 0.5) {
    return 'Caution';
  }
  if (normalized < 0.7) {
    return 'Hazardous';
  }
  return 'Dangerous';
}

export function adjustedSpeed(riskScore: number, baseSpeed = 95): number {
  const risk = clamp(riskScore, 0, 1);
  const safeBase = Math.max(0, baseSpeed);

  if (risk < 0.3) {
    return Math.round(safeBase);
  }
  if (risk < 0.5) {
    return Math.round(safeBase * 0.9);
  }
  if (risk < 0.7) {
    return Math.round(safeBase * 0.8);
  }
  return Math.round(safeBase * 0.65);
}

export function getRiskSummary(checkpoints: any[]): {
  totalRiskZones: number;
  highestRisk: number;
  safeSections: number;
  recommendation: string;
} {
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    return {
      totalRiskZones: 0,
      highestRisk: 0,
      safeSections: 0,
      recommendation: 'No checkpoint data available.'
    };
  }

  const scores = checkpoints.map((cp) => {
    const value = typeof cp?.riskScore === 'number' ? cp.riskScore : Number(cp?.riskScore || 0);
    return clamp(Number.isFinite(value) ? value : 0, 0, 1);
  });

  const highestRisk = Math.max(...scores);
  const totalRiskZones = scores.filter((score) => score >= 0.5).length;
  const safeSections = scores.filter((score) => score < 0.3).length;

  let recommendation = 'Conditions are mostly manageable. Continue with normal winter caution.';
  if (highestRisk >= 0.7) {
    recommendation = 'Dangerous segments detected. Reduce speed significantly and consider delaying travel.';
  } else if (highestRisk >= 0.5) {
    recommendation = 'Hazardous segments ahead. Increase following distance and avoid sudden maneuvers.';
  } else if (highestRisk >= 0.3) {
    recommendation = 'Moderate winter risk present. Drive defensively and monitor updates.';
  }

  return {
    totalRiskZones,
    highestRisk,
    safeSections,
    recommendation
  };
}
