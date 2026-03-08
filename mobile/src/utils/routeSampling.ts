import along from '@turf/along';
import { lineString } from '@turf/helpers';
import length from '@turf/length';

import type { RouteGeometry, SampledCheckpoint } from '../types';

function formatEtaLocal(timestamp: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(timestamp);
}

export function sampleRoute(
  geometry: RouteGeometry,
  departureTime: Date,
  intervalKm = 50,
  baseSpeedKmh = 95
): SampledCheckpoint[] {
  const routeFeature = lineString(geometry.coordinates);
  const totalKm = length(routeFeature, { units: 'kilometers' });
  const stepKm = Math.max(1, intervalKm);
  const departMs = departureTime.getTime();

  if (!Number.isFinite(departMs) || totalKm <= 0) {
    return [];
  }

  const checkpoints: SampledCheckpoint[] = [];
  let lastDistanceKm = 0;

  for (let dist = 0; dist <= totalKm; dist += stepKm) {
    const distanceKm = Math.min(dist, totalKm);
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

    lastDistanceKm = distanceKm;
  }

  if (lastDistanceKm < totalKm) {
    const point = along(routeFeature, totalKm, { units: 'kilometers' });
    const [lng, lat] = point.geometry.coordinates;
    const etaMs = departMs + (totalKm / Math.max(baseSpeedKmh, 1)) * 3600_000;
    const etaDate = new Date(etaMs);

    checkpoints.push({
      lat,
      lng,
      distanceKm: Number(totalKm.toFixed(2)),
      etaTimestamp: etaDate.toISOString(),
      etaLocal: formatEtaLocal(etaDate)
    });
  }

  return checkpoints;
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) {
    return '0h 0m';
  }

  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${wholeHours}h ${minutes}m`;
}
