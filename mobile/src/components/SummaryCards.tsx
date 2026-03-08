import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { EnrichedCheckpoint, RiskZoneSummary, RouteInfo } from '../types';
import { formatDuration } from '../utils/routeSampling';
import { riskLabel } from '../utils/risk';
import SectionCard from './SectionCard';

type Props = {
  routeInfo: RouteInfo | null;
  checkpoints: EnrichedCheckpoint[];
  riskZones: RiskZoneSummary;
};

function metricTone(value: string): string {
  if (value === 'Dangerous') {
    return colors.red;
  }
  if (value === 'Hazardous') {
    return colors.orange;
  }
  if (value === 'Caution') {
    return colors.yellow;
  }

  return colors.green;
}

export default function SummaryCards({ routeInfo, checkpoints, riskZones }: Props) {
  if (!routeInfo) {
    return (
      <SectionCard eyebrow="Snapshot" title="No scan yet" subtitle="Run a route scan to see trip distance, ETA, and the risk balance across checkpoints." />
    );
  }

  const flaggedZones = riskZones.yellow + riskZones.orange + riskZones.red;
  const highestRiskScore = checkpoints.reduce((max, checkpoint) => Math.max(max, checkpoint.riskScore), 0);
  const highestRiskLabel = riskLabel(highestRiskScore);

  return (
    <SectionCard eyebrow="Snapshot" title="Trip overview">
      <View style={styles.grid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricValue}>{routeInfo.distanceKm.toFixed(1)} km</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Drive time</Text>
          <Text style={styles.metricValue}>{formatDuration(routeInfo.durationHrs)}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Flagged zones</Text>
          <Text style={[styles.metricValue, { color: flaggedZones > 0 ? colors.red : colors.green }]}>{flaggedZones}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Highest risk</Text>
          <Text style={[styles.metricValue, { color: metricTone(highestRiskLabel) }]}>{highestRiskLabel}</Text>
        </View>
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  metricCard: {
    width: '47%',
    backgroundColor: colors.panelAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6
  },
  metricLabel: {
    color: colors.textSoft,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700'
  },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700'
  }
});
