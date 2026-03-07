import { useMemo, useState } from 'react';

import type { EnrichedCheckpoint } from '../types';

type LngLat = [number, number];

type CityOption = {
  label: string;
  value: string;
  coords: LngLat;
};

const CITIES: CityOption[] = [
  { label: 'Thunder Bay', value: 'thunder_bay', coords: [-89.2477, 48.3809] },
  { label: 'Toronto', value: 'toronto', coords: [-79.3832, 43.6532] },
  { label: 'Sudbury', value: 'sudbury', coords: [-80.993, 46.4917] },
  { label: 'Sault Ste Marie', value: 'sault_ste_marie', coords: [-84.33, 46.5219] }
];

type Props = {
  loading: boolean;
  error: string | null;
  routeStats: { distanceKm: number; durationHrs: number } | null;
  riskZones: { green: number; yellow: number; orange: number; red: number };
  checkpoints: EnrichedCheckpoint[];
  selectedCheckpointId: string | null;
  onSearch: (payload: { origin: LngLat; destination: LngLat; departureTime: string }) => Promise<void>;
  onSelectCheckpoint: (checkpoint: EnrichedCheckpoint) => void;
};

function toDateTimeLocalValue(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function riskHex(color: EnrichedCheckpoint['riskColor']): string {
  if (color === 'green') {
    return 'var(--green)';
  }
  if (color === 'yellow') {
    return 'var(--yellow)';
  }
  if (color === 'orange') {
    return 'var(--orange)';
  }
  return 'var(--red)';
}

export default function Sidebar({
  loading,
  error,
  routeStats,
  riskZones,
  checkpoints,
  selectedCheckpointId,
  onSearch,
  onSelectCheckpoint
}: Props) {
  const [originCity, setOriginCity] = useState<string>(CITIES[0].value);
  const [destinationCity, setDestinationCity] = useState<string>(CITIES[1].value);
  const [departureTime, setDepartureTime] = useState<string>(toDateTimeLocalValue(new Date()));

  const cityMap = useMemo(() => new Map(CITIES.map((c) => [c.value, c.coords])), []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const origin = cityMap.get(originCity);
    const destination = cityMap.get(destinationCity);

    if (!origin || !destination) {
      return;
    }

    await onSearch({ origin, destination, departureTime });
  };

  return (
    <div className="sidebar">
      <h1 className="panel-title">SnowDogs</h1>
      <p className="panel-subtitle">Real-time winter road safety scan</p>

      <form onSubmit={submit} className="sidebar-form">
        <label>
          Origin
          <select value={originCity} onChange={(e) => setOriginCity(e.target.value)}>
            {CITIES.map((city) => (
              <option key={city.value} value={city.value}>
                {city.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Destination
          <select value={destinationCity} onChange={(e) => setDestinationCity(e.target.value)}>
            {CITIES.map((city) => (
              <option key={city.value} value={city.value}>
                {city.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Departure
          <input
            type="datetime-local"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Scanning...' : 'Scan Route'}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {routeStats && (
        <section className="card">
          <h2>Route Stats</h2>
          <p>Distance: {routeStats.distanceKm.toFixed(1)} km</p>
          <p>Duration: {routeStats.durationHrs.toFixed(2)} hrs</p>
          <p>
            Risk Zones: G {riskZones.green} | Y {riskZones.yellow} | O {riskZones.orange} | R {riskZones.red}
          </p>
        </section>
      )}

      <section className="card checkpoint-list">
        <h2>Checkpoints</h2>
        {checkpoints.length === 0 && <p>No checkpoints yet. Run a route scan.</p>}
        {checkpoints.map((cp, idx) => (
          <button
            key={cp.id}
            type="button"
            onClick={() => onSelectCheckpoint(cp)}
            className={`checkpoint-item ${selectedCheckpointId === cp.id ? 'active' : ''}`}
          >
            <span className="dot" style={{ background: riskHex(cp.riskColor) }} />
            <span>
              #{idx + 1} {cp.distanceKm.toFixed(0)} km - {cp.riskLabel}
            </span>
            <small>
              {cp.forecast
                ? `${cp.forecast.temperature ?? '-'}C, snow ${cp.forecast.snowfall ?? '-'} cm/h, vis ${cp.forecast.visibility ?? '-'} m`
                : 'No forecast'}
            </small>
          </button>
        ))}
      </section>
    </div>
  );
}
