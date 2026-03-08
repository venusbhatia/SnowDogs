import { toApiUrl } from './config';

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRowCoords(row: unknown): { lat: number; lng: number } | null {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const record = row as Record<string, unknown>;
  const lat =
    parseNumber(record.lat) ??
    parseNumber(record.latitude) ??
    parseNumber(record.Latitude) ??
    parseNumber(record.y) ??
    parseNumber(record.Y);

  const lng =
    parseNumber(record.lng) ??
    parseNumber(record.lon) ??
    parseNumber(record.long) ??
    parseNumber(record.longitude) ??
    parseNumber(record.Longitude) ??
    parseNumber(record.x) ??
    parseNumber(record.X);

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getRoadConditionSurface(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const row = entry as Record<string, unknown>;
  const candidates = [
    row.road_surface,
    row.surface,
    row.condition,
    row.description,
    row.Condition,
    row.Surface,
    row.RoadCondition
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate;
    }
  }

  return null;
}

function extractCameraUrl(camera: unknown): string | null {
  if (!camera || typeof camera !== 'object') {
    return null;
  }

  const row = camera as Record<string, unknown>;
  const views = Array.isArray(row.Views) ? (row.Views as Array<Record<string, unknown>>) : [];
  const firstView = views[0] || null;
  const urlCandidates = [
    firstView?.Url,
    firstView?.url,
    row.url,
    row.imageUrl,
    row.cameraUrl,
    row.Url,
    row.CameraUrl,
    row.image,
    row.thumbnail
  ];

  for (const candidate of urlCandidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate;
    }
  }

  return null;
}

function extractCameraIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      return null;
    }

    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

function toCameraProxyUrl(viewerUrl: string | null): string | null {
  if (!viewerUrl) {
    return null;
  }

  const viewId = extractCameraIdFromUrl(viewerUrl);
  if (!viewId) {
    return null;
  }

  return toApiUrl(`/api/road/camera-proxy/${encodeURIComponent(viewId)}`);
}

export function getNearestCameraUrl(lat: number, lng: number, cameras: unknown[]): string | null {
  let nearest: { distance: number; url: string } | null = null;

  for (const camera of cameras) {
    const viewerUrl = extractCameraUrl(camera);
    const proxyUrl = toCameraProxyUrl(viewerUrl);
    if (!proxyUrl) {
      continue;
    }

    const coords = getRowCoords(camera);
    if (!coords) {
      if (!nearest) {
        nearest = { distance: Number.POSITIVE_INFINITY, url: proxyUrl };
      }
      continue;
    }

    const distance = haversineKm(lat, lng, coords.lat, coords.lng);
    if (!nearest || distance < nearest.distance) {
      nearest = { distance, url: proxyUrl };
    }
  }

  return nearest?.url ?? null;
}

export function getNearestRoadSurface(lat: number, lng: number, rows: unknown[]): string | null {
  let nearest: { distance: number; surface: string } | null = null;

  for (const row of rows) {
    const surface = getRoadConditionSurface(row);
    if (!surface) {
      continue;
    }

    const coords = getRowCoords(row);
    if (!coords) {
      continue;
    }

    const distance = haversineKm(lat, lng, coords.lat, coords.lng);
    if (!nearest || distance < nearest.distance) {
      nearest = { distance, surface };
    }
  }

  return nearest?.surface ?? null;
}
