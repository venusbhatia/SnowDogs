import along from '@turf/along';
import { lineString } from '@turf/helpers';
import length from '@turf/length';

export type LineStringGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type SampledCheckpoint = {
  lat: number;
  lng: number;
  distanceKm: number;
  etaTimestamp: string;
  etaLocal: string;
};

function formatEtaLocal(timestamp: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(timestamp);
}

export function sampleRoute(
  geometry: LineStringGeometry,
  departureTime: string | number | Date,
  intervalKm = 50,
  baseSpeedKmh = 95
): SampledCheckpoint[] {
  const routeFeature = lineString(geometry.coordinates);
  const totalDistanceKm = length(routeFeature, { units: 'kilometers' });
  const stepKm = Math.max(1, intervalKm);
  const departMs = new Date(departureTime).getTime();

  if (!Number.isFinite(departMs) || totalDistanceKm <= 0) {
    return [];
  }

  const checkpoints: SampledCheckpoint[] = [];
  const sampleDistances: number[] = [];

  for (let km = 0; km <= totalDistanceKm; km += stepKm) {
    sampleDistances.push(km);
  }

  if (sampleDistances[sampleDistances.length - 1] < totalDistanceKm) {
    sampleDistances.push(totalDistanceKm);
  }

  for (const distanceKm of sampleDistances) {
    const point = along(routeFeature, distanceKm, { units: 'kilometers' });
    const [lng, lat] = point.geometry.coordinates;
    const etaMs = departMs + (distanceKm / Math.max(baseSpeedKmh, 1)) * 3600_000;
    const etaDate = new Date(etaMs);

    checkpoints.push({
      lat,
      lng,
      distanceKm: Number(distanceKm.toFixed(2)),
      etaTimestamp: etaDate.toISOString(),
      etaLocal: formatEtaLocal(etaDate)
    });
  }

  return checkpoints;
}

export function riskColor(score: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (score < 0.25) {
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

export function riskLabel(score: number): 'Low' | 'Moderate' | 'High' | 'Severe' {
  if (score < 0.25) {
    return 'Low';
  }
  if (score < 0.5) {
    return 'Moderate';
  }
  if (score < 0.75) {
    return 'High';
  }
  return 'Severe';
}
