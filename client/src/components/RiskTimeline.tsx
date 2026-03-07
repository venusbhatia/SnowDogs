import type { EnrichedCheckpoint } from '../types';

type Props = {
  checkpoints: EnrichedCheckpoint[];
};

function colorHex(color: EnrichedCheckpoint['riskColor']): string {
  if (color === 'green') {
    return '#22c55e';
  }
  if (color === 'yellow') {
    return '#eab308';
  }
  if (color === 'orange') {
    return '#f97316';
  }
  return '#ef4444';
}

export default function RiskTimeline({ checkpoints }: Props) {
  const departure = checkpoints[0]?.etaLocal ?? '--';
  const arrival = checkpoints[checkpoints.length - 1]?.etaLocal ?? '--';

  return (
    <div className="risk-timeline">
      <div className="timeline-legend">
        <span>{departure}</span>
        <span>{arrival}</span>
      </div>
      <div className="timeline-bar">
        {checkpoints.length === 0 && <div className="timeline-empty">Run scan to build risk timeline</div>}
        {checkpoints.map((cp) => (
          <div key={cp.id} className="timeline-segment" style={{ background: colorHex(cp.riskColor) }} />
        ))}
      </div>
    </div>
  );
}
