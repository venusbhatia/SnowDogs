import { useAuth0 } from '@auth0/auth0-react';
import { useMemo, useState } from 'react';

import type { EnrichedCheckpoint } from '../types';
import { formatDuration } from '../utils/sampling';

type LngLat = [number, number];

type CityOption = {
  label: string;
  value: string;
  coords: LngLat;
};

const CITIES: CityOption[] = [
  { label: 'Thunder Bay', value: 'thunder_bay', coords: [-89.2477, 48.3809] },
  { label: 'Toronto', value: 'toronto', coords: [-79.3832, 43.6532] },
  { label: 'Sudbury', value: 'sudbury', coords: [-81.0, 46.49] },
  { label: 'Sault Ste Marie', value: 'sault_ste_marie', coords: [-84.33, 46.52] },
  { label: 'Barrie', value: 'barrie', coords: [-79.69, 44.39] }
];

type Props = {
  loading: boolean;
  error: string | null;
  routeStats: { distanceKm: number; durationHrs: number } | null;
  riskZones: { green: number; yellow: number; orange: number; red: number };
  checkpoints: EnrichedCheckpoint[];
  selectedCheckpointId: string | null;
  onSearch: (payload: { origin: LngLat; destination: LngLat; departureTime: string }) => Promise<void>;
  onCheckpointSelect: (checkpoint: EnrichedCheckpoint) => void;
};

function toDateTimeLocalValue(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tomorrowAt6am(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(6, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

function riskDotColor(color: EnrichedCheckpoint['riskColor']): string {
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

function riskBadgeStyle(label: EnrichedCheckpoint['riskLabel']): { background: string; color: string } {
  if (label === 'Clear') {
    return { background: 'rgba(34,197,94,0.2)', color: 'var(--green)' };
  }
  if (label === 'Caution') {
    return { background: 'rgba(234,179,8,0.2)', color: 'var(--yellow)' };
  }
  if (label === 'Hazardous') {
    return { background: 'rgba(249,115,22,0.2)', color: 'var(--orange)' };
  }
  return { background: 'rgba(239,68,68,0.22)', color: 'var(--red)' };
}

function formatEta(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Toronto'
  }).format(date);
}

export default function Sidebar({
  loading,
  error,
  routeStats,
  riskZones,
  checkpoints,
  selectedCheckpointId,
  onSearch,
  onCheckpointSelect
}: Props) {
  const { isAuthenticated, user, loginWithRedirect, logout } = useAuth0();
  const [originCity, setOriginCity] = useState<string>(CITIES[0].value);
  const [destinationCity, setDestinationCity] = useState<string>(CITIES[1].value);
  const [departureTime, setDepartureTime] = useState<string>(tomorrowAt6am());

  const cityMap = useMemo(() => new Map(CITIES.map((city) => [city.value, city.coords])), []);

  const riskZoneCount = riskZones.yellow + riskZones.orange + riskZones.red;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const origin = cityMap.get(originCity);
    const destination = cityMap.get(destinationCity);

    if (!origin || !destination) {
      return;
    }

    await onSearch({ origin, destination, departureTime });
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        padding: 16,
        gap: 14,
        fontSize: 13,
        lineHeight: 1.35
      }}
    >
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={() => loginWithRedirect()}
            style={{
              border: '1px solid transparent',
              borderRadius: 'var(--radius)',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              padding: '8px 12px',
              cursor: 'pointer'
            }}
          >
            Sign In
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || 'User'}
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)'
                  }}
                />
              )}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {user?.name || 'Authenticated User'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Logout
            </button>
          </>
        )}
      </section>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 21, lineHeight: 1 }}>🐕</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>SnowDogs</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Winter Road Intelligence</p>
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.6 }}>
          From
          <select
            value={originCity}
            onChange={(e) => setOriginCity(e.target.value)}
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px 11px'
            }}
          >
            {CITIES.map((city) => (
              <option key={city.value} value={city.value}>
                {city.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.6 }}>
          To
          <select
            value={destinationCity}
            onChange={(e) => setDestinationCity(e.target.value)}
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px 11px'
            }}
          >
            {CITIES.map((city) => (
              <option key={city.value} value={city.value}>
                {city.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.6 }}>
          Departure
          <input
            type="datetime-local"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px 11px'
            }}
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 2,
            padding: '11px 12px',
            borderRadius: 'var(--radius)',
            border: '1px solid transparent',
            background: loading ? '#356ba8' : 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.85 : 1
          }}
        >
          {loading ? 'Analyzing route...' : 'Scan Route'}
        </button>

        {error && (
          <div style={{ marginTop: 2, color: 'var(--red)', fontSize: 12 }}>
            {error}
          </div>
        )}
      </form>

      {routeStats && (
        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-panel)',
            padding: 11,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8
          }}
        >
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.6 }}>Distance</div>
            <div style={{ marginTop: 3, fontSize: 13, fontWeight: 600 }}>{routeStats.distanceKm.toFixed(1)} km</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.6 }}>Drive Time</div>
            <div style={{ marginTop: 3, fontSize: 13, fontWeight: 600 }}>{formatDuration(routeStats.durationHrs)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.6 }}>Risk Zones</div>
            <div
              style={{
                marginTop: 3,
                fontSize: 13,
                fontWeight: 700,
                color: riskZoneCount > 0 ? 'var(--red)' : 'var(--green)'
              }}
            >
              {riskZoneCount}
            </div>
          </div>
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, flex: 1 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.6 }}>
          Checkpoints
        </div>

        <div
          style={{
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            paddingRight: 2
          }}
        >
          {checkpoints.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No checkpoints yet. Run a route scan.</div>
          )}

          {checkpoints.map((checkpoint) => {
            const badge = riskBadgeStyle(checkpoint.riskLabel);
            const active = selectedCheckpointId === checkpoint.id;

            return (
              <button
                key={checkpoint.id}
                type="button"
                onClick={() => onCheckpointSelect(checkpoint)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: active ? 'var(--bg-hover)' : 'var(--bg-panel)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '9px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 999,
                        background: riskDotColor(checkpoint.riskColor),
                        flexShrink: 0
                      }}
                    />
                    <span>{checkpoint.distanceKm.toFixed(0)} km</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatEta(checkpoint.etaTimestamp)}</span>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 7px',
                      borderRadius: 999,
                      background: badge.background,
                      color: badge.color
                    }}
                  >
                    {checkpoint.riskLabel}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {checkpoint.forecast ? (
                    <>
                      <span>{checkpoint.forecast.temperature ?? '-'}C</span>
                      {typeof checkpoint.forecast.snowfall === 'number' && checkpoint.forecast.snowfall > 0 && (
                        <span>  •  Snow {checkpoint.forecast.snowfall.toFixed(1)} cm/h</span>
                      )}
                    </>
                  ) : (
                    <span>No weather data</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
