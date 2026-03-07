import { useMemo, useState } from 'react';

import CameraPanel from './components/CameraPanel';
import MapView from './components/MapView';
import RiskTimeline from './components/RiskTimeline';
import Sidebar from './components/Sidebar';
import type { EnrichedCheckpoint, RouteGeometry } from './types';
import { fetchRoute, fetchWeather } from './utils/api';
import { riskColor, riskLabel, sampleRoute } from './utils/sampling';

type LngLat = [number, number];

type SearchPayload = {
  origin: LngLat;
  destination: LngLat;
  departureTime: string;
};

type RouteStats = {
  distanceKm: number;
  durationHrs: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeRiskScore(checkpoint: EnrichedCheckpoint['forecast']): number {
  if (!checkpoint) {
    return 0;
  }

  let score = 0;

  const snowfall = checkpoint.snowfall ?? 0;
  const visibility = checkpoint.visibility ?? Number.POSITIVE_INFINITY;
  const wind = checkpoint.windSpeed ?? 0;
  const temp = checkpoint.temperature ?? Number.NaN;
  const wmo = checkpoint.weatherCode ?? Number.NaN;

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

  return clamp(score / 10, 0, 1);
}

export default function App() {
  const [routeGeo, setRouteGeo] = useState<RouteGeometry | null>(null);
  const [checkpoints, setCheckpoints] = useState<EnrichedCheckpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<EnrichedCheckpoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);

  const riskZones = useMemo(() => {
    return checkpoints.reduce(
      (acc, cp) => {
        acc[cp.riskColor] += 1;
        return acc;
      },
      { green: 0, yellow: 0, orange: 0, red: 0 }
    );
  }, [checkpoints]);

  const handleSearch = async ({ origin, destination, departureTime }: SearchPayload) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedCheckpoint(null);

      const route = await fetchRoute(origin, destination);
      const sampled = sampleRoute(route.geometry, departureTime, 50, 95);

      if (sampled.length === 0) {
        throw new Error('Route sampling returned no checkpoints');
      }

      const weather = await fetchWeather(
        sampled.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          etaTimestamp: point.etaTimestamp
        }))
      );

      const enriched: EnrichedCheckpoint[] = sampled.map((point, index) => {
        const forecast = weather[index]?.weather ?? null;
        const score = computeRiskScore(forecast);

        return {
          ...point,
          id: `${index}-${point.distanceKm}`,
          forecast,
          riskScore: score,
          riskColor: riskColor(score),
          riskLabel: riskLabel(score)
        };
      });

      setRouteGeo(route.geometry);
      setRouteStats({
        distanceKm: Number(route.distanceKm),
        durationHrs: Number(route.durationHrs)
      });
      setCheckpoints(enriched);
    } catch (searchError) {
      const message = searchError instanceof Error ? searchError.message : 'Failed to scan route';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const updateCheckpoint = (checkpoint: EnrichedCheckpoint) => {
    setCheckpoints((previous) => previous.map((cp) => (cp.id === checkpoint.id ? checkpoint : cp)));
    setSelectedCheckpoint(checkpoint);
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Sidebar
          loading={loading}
          error={error}
          routeStats={routeStats}
          riskZones={riskZones}
          checkpoints={checkpoints}
          onSearch={handleSearch}
          onSelectCheckpoint={setSelectedCheckpoint}
          selectedCheckpointId={selectedCheckpoint?.id ?? null}
        />
      </aside>

      <main className="app-map-area">
        <MapView
          routeGeo={routeGeo}
          checkpoints={checkpoints}
          selectedCheckpointId={selectedCheckpoint?.id ?? null}
          onSelectCheckpoint={setSelectedCheckpoint}
        />
        <RiskTimeline checkpoints={checkpoints} />
      </main>

      {selectedCheckpoint && (
        <aside className="app-camera-panel">
          <CameraPanel
            checkpoint={selectedCheckpoint}
            onClose={() => setSelectedCheckpoint(null)}
            onCheckpointUpdate={updateCheckpoint}
          />
        </aside>
      )}
    </div>
  );
}
