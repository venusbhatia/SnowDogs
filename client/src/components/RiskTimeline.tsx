import type { EnrichedCheckpoint } from '../types';
import { riskColor } from '../utils/sampling';

type Props = {
  checkpoints: EnrichedCheckpoint[];
  onCheckpointSelect: (checkpoint: EnrichedCheckpoint) => void;
};

function colorFromScore(score: number): string {
  const level = riskColor(score);
  if (level === 'green') {
    return 'var(--green)';
  }
  if (level === 'yellow') {
    return 'var(--yellow)';
  }
  if (level === 'orange') {
    return 'var(--orange)';
  }
  return 'var(--red)';
}

function formatTime(iso: string | undefined): string {
  if (!iso) {
    return '--';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export default function RiskTimeline({ checkpoints, onCheckpointSelect }: Props) {
  const departure = formatTime(checkpoints[0]?.etaTimestamp);
  const arrival = formatTime(checkpoints[checkpoints.length - 1]?.etaTimestamp);
  const riskZones = checkpoints.filter((checkpoint) => checkpoint.riskScore >= 0.5).length;

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: 24,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 5
      }}
    >
      <div
        style={{
          textTransform: 'uppercase',
          fontSize: 11,
          color: 'var(--text-secondary)',
          letterSpacing: 0.5,
          fontWeight: 600
        }}
      >
        ROUTE RISK TIMELINE
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          height: 12,
          borderRadius: 4,
          overflow: 'hidden',
          gap: 1,
          background: 'var(--border)'
        }}
      >
        {checkpoints.length === 0 && (
          <div
            style={{
              flex: 1,
              background: 'var(--bg-hover)',
              opacity: 0.7
            }}
          />
        )}

        {checkpoints.map((checkpoint) => (
          <button
            key={checkpoint.id}
            type="button"
            onClick={() => onCheckpointSelect(checkpoint)}
            aria-label={`Jump to ${checkpoint.distanceKm.toFixed(0)} km checkpoint`}
            style={{
              flex: 1,
              border: 'none',
              margin: 0,
              padding: 0,
              background: colorFromScore(checkpoint.riskScore),
              cursor: 'pointer',
              opacity: 0.95,
              transition: 'opacity 0.2s ease'
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.opacity = '0.78';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.opacity = '0.95';
            }}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: 'var(--text-secondary)'
        }}
      >
        <span>{departure}</span>
        <span style={{ color: 'var(--text-muted)' }}>{riskZones} risk zone(s) detected</span>
        <span>{arrival}</span>
      </div>
    </div>
  );
}
