import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type {
  CameraScanProgress,
  EnrichedCheckpoint,
  RouteInfo,
  ScanStage
} from '../types';
import { formatDuration } from '../utils/routeSampling';
import { riskHex, riskLabel } from '../utils/risk';
import SectionCard from './SectionCard';

const SCAN_STEPS: Array<{ key: ScanStage; label: string }> = [
  { key: 'route', label: 'Route' },
  { key: 'weather', label: 'Weather' },
  { key: 'roads', label: 'Roads' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'risk', label: 'Risk' }
];

type Props = {
  loading: boolean;
  scanStage: ScanStage;
  cameraProgress: CameraScanProgress;
  routeLabel: string | null;
  routeInfo: RouteInfo | null;
  checkpoints: EnrichedCheckpoint[];
  selectedCheckpoint: EnrichedCheckpoint | null;
  lastScanAt: string | null;
};

function formatLastScan(lastScanAt: string | null): string {
  if (!lastScanAt) {
    return 'No scan yet';
  }

  const parsed = new Date(lastScanAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'No scan yet';
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(parsed);
}

function stageTitle(scanStage: ScanStage): string {
  if (scanStage === 'route') {
    return 'Mapping corridor';
  }
  if (scanStage === 'weather') {
    return 'Pulling forecast checkpoints';
  }
  if (scanStage === 'roads') {
    return 'Checking road conditions';
  }
  if (scanStage === 'cameras') {
    return 'Inspecting nearby cameras';
  }
  if (scanStage === 'risk') {
    return 'Scoring winter hazards';
  }
  if (scanStage === 'error') {
    return 'Scan hit an error';
  }

  return 'Ready for a route scan';
}

function stageSubtitle(scanStage: ScanStage, cameraProgress: CameraScanProgress): string {
  if (scanStage === 'route') {
    return 'Building the route geometry and trip timing.';
  }
  if (scanStage === 'weather') {
    return 'Requesting forecast data for every sampled checkpoint.';
  }
  if (scanStage === 'roads') {
    return 'Blending Ontario road-surface feeds into the corridor.';
  }
  if (scanStage === 'cameras') {
    if (cameraProgress.total > 0) {
      return `Camera coverage ${cameraProgress.completed}/${cameraProgress.total} checkpoints checked.`;
    }

    return 'Looking for live 511 cameras near each checkpoint.';
  }
  if (scanStage === 'risk') {
    return 'Computing the risk band and picking the first hotspot.';
  }
  if (scanStage === 'error') {
    return 'The previous request did not complete cleanly.';
  }

  return 'Choose a preset route to get a judge-friendly demo in motion quickly.';
}

function getStepTone(stepKey: ScanStage, scanStage: ScanStage, loading: boolean): 'complete' | 'active' | 'idle' {
  if (!loading && scanStage === 'complete') {
    return 'complete';
  }

  const activeIndex = SCAN_STEPS.findIndex((step) => step.key === scanStage);
  const currentIndex = SCAN_STEPS.findIndex((step) => step.key === stepKey);

  if (activeIndex === -1 || currentIndex === -1) {
    return 'idle';
  }
  if (currentIndex < activeIndex) {
    return 'complete';
  }
  if (currentIndex === activeIndex) {
    return 'active';
  }

  return 'idle';
}

function getDirective(checkpoints: EnrichedCheckpoint[]): { tone: string; label: string; message: string } {
  if (checkpoints.length === 0) {
    return {
      tone: colors.accent,
      label: 'Ready to scan',
      message: 'Start with a preset corridor, then drill into the first flagged checkpoint for the live AI story.'
    };
  }

  const highestRisk = checkpoints.reduce((max, checkpoint) => Math.max(max, checkpoint.riskScore), 0);
  const flaggedCount = checkpoints.filter((checkpoint) => checkpoint.riskScore >= 0.5).length;

  if (highestRisk >= 0.75 || flaggedCount >= Math.ceil(checkpoints.length / 2)) {
    return {
      tone: colors.red,
      label: 'Delay or reroute',
      message: 'Multiple checkpoints breach the winter hazard threshold and need driver intervention.'
    };
  }

  if (highestRisk >= 0.5) {
    return {
      tone: colors.orange,
      label: 'Proceed with caution',
      message: 'There is at least one serious hotspot along this corridor. Use the checkpoint drill-down before departing.'
    };
  }

  if (highestRisk >= 0.3) {
    return {
      tone: colors.yellow,
      label: 'Monitor conditions',
      message: 'The route is mostly manageable, but weather or surface changes could push parts of it into caution territory.'
    };
  }

  return {
    tone: colors.green,
    label: 'Route looks clear',
    message: 'Current weather and road inputs remain below the caution threshold across sampled checkpoints.'
  };
}

export default function OperationsCard({
  loading,
  scanStage,
  cameraProgress,
  routeLabel,
  routeInfo,
  checkpoints,
  selectedCheckpoint,
  lastScanAt
}: Props) {
  const directive = getDirective(checkpoints);
  const firstFlagged = checkpoints.find((checkpoint) => checkpoint.riskScore >= 0.5) ?? selectedCheckpoint ?? checkpoints[0] ?? null;
  const cameraCoverage = checkpoints.filter((checkpoint) => checkpoint.cameraUrl).length;
  const highestRisk = checkpoints.reduce((max, checkpoint) => Math.max(max, checkpoint.riskScore), 0);
  const highestRiskLabel = checkpoints.length > 0 ? riskLabel(highestRisk) : 'Clear';
  const statusTone = loading ? colors.accent : directive.tone;

  return (
    <SectionCard
      eyebrow="Operations"
      title={loading ? stageTitle(scanStage) : directive.label}
      subtitle={loading ? stageSubtitle(scanStage, cameraProgress) : directive.message}
    >
      <View style={[styles.statusBanner, { borderColor: statusTone }]}>
        <View style={styles.statusBannerLeft}>
          {loading ? <ActivityIndicator color={colors.white} size="small" /> : <View style={[styles.statusDot, { backgroundColor: statusTone }]} />}
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>{loading ? 'Live scan in progress' : 'Driver recommendation'}</Text>
            <Text style={styles.statusValue}>{loading ? stageTitle(scanStage) : directive.label}</Text>
          </View>
        </View>
        <Text style={styles.timestamp}>{formatLastScan(lastScanAt)}</Text>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Route</Text>
          <Text style={styles.metricValue}>{routeLabel ?? 'Pick a preset corridor'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Trip</Text>
          <Text style={styles.metricValue}>
            {routeInfo ? `${routeInfo.distanceKm.toFixed(0)} km in ${formatDuration(routeInfo.durationHrs)}` : 'Weather + roads + cameras + AI'}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Coverage</Text>
          <Text style={styles.metricValue}>
            {checkpoints.length > 0 ? `${cameraCoverage}/${checkpoints.length} cameras` : 'Preset routes ready'}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Highest risk</Text>
          <Text style={[styles.metricValue, { color: checkpoints.length > 0 ? riskHex(highestRisk) : colors.text }]}>
            {highestRiskLabel}
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        {SCAN_STEPS.map((step) => {
          const tone = getStepTone(step.key, scanStage, loading);

          return (
            <View
              key={step.key}
              style={[
                styles.stepChip,
                tone === 'complete' && styles.stepChipComplete,
                tone === 'active' && styles.stepChipActive
              ]}
            >
              <Text
                style={[
                  styles.stepChipText,
                  tone === 'complete' && styles.stepChipTextComplete,
                  tone === 'active' && styles.stepChipTextActive
                ]}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      {firstFlagged ? (
        <View style={styles.hotspotCard}>
          <Text style={styles.hotspotLabel}>First hotspot</Text>
          <Text style={styles.hotspotTitle}>
            {firstFlagged.distanceKm.toFixed(0)} km checkpoint at {firstFlagged.etaLocal}
          </Text>
          <Text style={styles.hotspotText}>
            {firstFlagged.riskLabel}
            {firstFlagged.forecast?.visibility ? `, visibility ${Math.round(firstFlagged.forecast.visibility)} m` : ''}
            {firstFlagged.forecast?.snowfall ? `, snowfall ${firstFlagged.forecast.snowfall} cm/h` : ''}
            {firstFlagged.cameraUrl ? ', live camera available' : ', no nearby camera'}
          </Text>
        </View>
      ) : (
        <View style={styles.hotspotCard}>
          <Text style={styles.hotspotLabel}>Demo tip</Text>
          <Text style={styles.hotspotTitle}>Load a preset, run the scan, then open the first checkpoint.</Text>
          <Text style={styles.hotspotText}>That path shows off route sampling, live road data, camera analysis, and spoken advisory playback in one flow.</Text>
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  statusBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.panelAlt,
    padding: spacing.md,
    gap: spacing.sm
  },
  statusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill
  },
  statusCopy: {
    flex: 1,
    gap: 2
  },
  statusLabel: {
    color: colors.textSoft,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700'
  },
  statusValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 12
  },
  metricGrid: {
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
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700'
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  stepChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center'
  },
  stepChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  stepChipComplete: {
    borderColor: 'rgba(34, 197, 94, 0.45)',
    backgroundColor: 'rgba(34, 197, 94, 0.14)'
  },
  stepChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  stepChipTextActive: {
    color: colors.white
  },
  stepChipTextComplete: {
    color: colors.green
  },
  hotspotCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    gap: 6
  },
  hotspotLabel: {
    color: colors.textSoft,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700'
  },
  hotspotTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700'
  },
  hotspotText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  }
});
