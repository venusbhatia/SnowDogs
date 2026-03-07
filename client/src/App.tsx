import { useMemo, useState } from 'react';

import AgentPanel from './components/AgentPanel';
import CameraPanel from './components/CameraPanel';
import MapView from './components/MapView';
import RiskTimeline from './components/RiskTimeline';
import Sidebar from './components/Sidebar';
import type { EnrichedCheckpoint, RouteGeometry } from './types';
import {
  fetchNearbyCameras,
  fetchRoadConditions,
  fetchRoute,
  fetchWeather,
  type RouteResponse,
  type WeatherCheckpoint
} from './utils/api';
import { riskColor, riskLabel, sampleRoute } from './utils/sampling';

type LngLat = [number, number];

type RouteInfo = {
  distanceKm: number;
  durationHrs: number;
  distanceM: number;
  durationS: number;
};

type RiskUpdate = {
  lat: number;
  lng: number;
  newRisk: number;
};

const PRESET_LOCATIONS: Record<string, LngLat> = {
  'Thunder Bay': [-89.2477, 48.3809],
  Toronto: [-79.3832, 43.6532],
  Sudbury: [-81.0, 46.49],
  'Sault Ste Marie': [-84.33, 46.52],
  Barrie: [-79.69, 44.39]
};

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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalizeSurfaceText(value: unknown): string {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  return '';
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

function computeRiskScore(weather: WeatherCheckpoint['weather'], roadCondition: string | null): number {
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

  return `/api/road/camera-proxy/${encodeURIComponent(viewId)}`;
}

function getNearestCameraUrl(lat: number, lng: number, cameras: unknown[]): string | null {
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

function getNearestRoadSurface(lat: number, lng: number, rows: unknown[]): string | null {
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

function findNearestRiskUpdate(checkpoint: EnrichedCheckpoint, updates: RiskUpdate[]): RiskUpdate | null {
  let nearest: { update: RiskUpdate; distanceKm: number } | null = null;

  for (const update of updates) {
    if (!Number.isFinite(update.lat) || !Number.isFinite(update.lng) || !Number.isFinite(update.newRisk)) {
      continue;
    }

    const distanceKm = haversineKm(checkpoint.lat, checkpoint.lng, update.lat, update.lng);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { update, distanceKm };
    }
  }

  if (!nearest || nearest.distanceKm > 40) {
    return null;
  }

  return nearest.update;
}

export default function App() {
  const [routeGeo, setRouteGeo] = useState<RouteGeometry | null>(null);
  const [checkpoints, setCheckpoints] = useState<EnrichedCheckpoint[]>([]);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<EnrichedCheckpoint | null>(null);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const riskZones = useMemo(
    () =>
      checkpoints.reduce(
        (acc, cp) => {
          acc[cp.riskColor] += 1;
          return acc;
        },
        { green: 0, yellow: 0, orange: 0, red: 0 }
      ),
    [checkpoints]
  );

  const handleSearch = async (origin: LngLat, destination: LngLat, departureTime: string) => {
    try {
      setLoading(true);
      setError(null);
      setRouteGeo(null);
      setCheckpoints([]);
      setRouteInfo(null);
      setSelectedCheckpoint(null);
      setAgentPanelOpen(false);

      const route = await fetchRoute(origin, destination);
      const geometry = route.geometry;
      const sampled = sampleRoute(geometry, new Date(departureTime), 50, 95);

      if (sampled.length === 0) {
        throw new Error('No checkpoints generated from route geometry');
      }

      const weatherPoints = await fetchWeather(
        sampled.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          etaTimestamp: point.etaTimestamp
        }))
      );

      let roadConditions: unknown[] = [];
      try {
        roadConditions = await fetchRoadConditions();
      } catch {
        roadConditions = [];
      }

      const nearbyCamerasPerCheckpoint = await Promise.all(
        sampled.map(async (point) => {
          try {
            return await fetchNearbyCameras(point.lat, point.lng, 100);
          } catch {
            return [] as unknown[];
          }
        })
      );

      const enriched: EnrichedCheckpoint[] = sampled.map((point, index) => {
        const weather = weatherPoints[index]?.weather ?? null;
        const roadSurface = getNearestRoadSurface(point.lat, point.lng, roadConditions);
        const score = computeRiskScore(weather, roadSurface);
        const resolvedCameraUrl = getNearestCameraUrl(point.lat, point.lng, nearbyCamerasPerCheckpoint[index] || []);

        return {
          ...point,
          id: `${index}-${point.distanceKm}`,
          forecast: weather,
          riskScore: score,
          riskColor: riskColor(score),
          riskLabel: riskLabel(score),
          cameraUrl: resolvedCameraUrl,
          _cameraUrl: resolvedCameraUrl
        };
      });

      const normalizedRoute: RouteResponse = route;
      setRouteGeo(geometry);
      setCheckpoints(enriched);
      setRouteInfo({
        distanceKm: Number(normalizedRoute.distanceKm),
        durationHrs: Number(normalizedRoute.durationHrs),
        distanceM: normalizedRoute.distanceM,
        durationS: normalizedRoute.durationS
      });
      setAgentPanelOpen(enriched.length > 0);
    } catch (searchError) {
      const message = searchError instanceof Error ? searchError.message : 'Failed to scan route';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSidebarSearch = async (payload: {
    origin: LngLat;
    destination: LngLat;
    departureTime: string;
  }) => {
    await handleSearch(payload.origin, payload.destination, payload.departureTime);
  };

  const onCheckpointUpdate = (updated: EnrichedCheckpoint) => {
    setCheckpoints((prev) => prev.map((cp) => (cp.id === updated.id ? updated : cp)));
    setSelectedCheckpoint(updated);
  };

  const onAgentRiskUpdate = (updates: RiskUpdate[]) => {
    if (updates.length === 0) {
      return;
    }

    setCheckpoints((prev) =>
      prev.map((checkpoint) => {
        const riskUpdate = findNearestRiskUpdate(checkpoint, updates);
        if (!riskUpdate) {
          return checkpoint;
        }

        const nextScore = Math.max(0, Math.min(1, riskUpdate.newRisk));
        return {
          ...checkpoint,
          riskScore: nextScore,
          riskColor: riskColor(nextScore),
          riskLabel: riskLabel(nextScore)
        };
      })
    );

    setSelectedCheckpoint((prev) => {
      if (!prev) {
        return prev;
      }

      const riskUpdate = findNearestRiskUpdate(prev, updates);
      if (!riskUpdate) {
        return prev;
      }

      const nextScore = Math.max(0, Math.min(1, riskUpdate.newRisk));
      return {
        ...prev,
        riskScore: nextScore,
        riskColor: riskColor(nextScore),
        riskLabel: riskLabel(nextScore)
      };
    });
  };

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'row', height: '100vh' }}>
      <aside className="app-sidebar">
        <>
          <Sidebar
            loading={loading}
            error={error}
            routeStats={routeInfo ? { distanceKm: routeInfo.distanceKm, durationHrs: routeInfo.durationHrs } : null}
            riskZones={riskZones}
            checkpoints={checkpoints}
            onSearch={handleSidebarSearch}
            onCheckpointSelect={setSelectedCheckpoint}
            selectedCheckpointId={selectedCheckpoint?.id ?? null}
          />
          {agentPanelOpen && checkpoints.length > 0 && (
            <AgentPanel
              checkpoints={checkpoints}
              routeInfo={routeInfo ? { distanceKm: routeInfo.distanceKm, durationHrs: routeInfo.durationHrs } : null}
              onRiskUpdate={onAgentRiskUpdate}
            />
          )}
        </>
      </aside>

      <main className="app-map-area" style={{ flex: 1, position: 'relative' }}>
        <MapView
          routeGeometry={routeGeo}
          checkpoints={checkpoints}
          selectedCheckpointId={selectedCheckpoint?.id ?? null}
          onCheckpointClick={setSelectedCheckpoint}
        />
        <RiskTimeline checkpoints={checkpoints} onCheckpointSelect={setSelectedCheckpoint} />
      </main>

      {selectedCheckpoint && (
        <aside className="app-camera-panel">
          <CameraPanel
            checkpoint={selectedCheckpoint}
            onClose={() => setSelectedCheckpoint(null)}
            onCheckpointUpdate={onCheckpointUpdate}
          />
        </aside>
      )}
    </div>
  );
}

export { PRESET_LOCATIONS };
