import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import CheckpointDetailCard from './src/components/CheckpointDetailCard';
import CheckpointList from './src/components/CheckpointList';
import OperationsCard from './src/components/OperationsCard';
import RiskStrip from './src/components/RiskStrip';
import RouteForm from './src/components/RouteForm';
import RouteMap from './src/components/RouteMap';
import SectionCard from './src/components/SectionCard';
import SummaryCards from './src/components/SummaryCards';
import { colors, radius, spacing } from './src/theme';
import type {
  CameraScanProgress,
  EnrichedCheckpoint,
  RiskZoneSummary,
  RouteGeometry,
  RouteInfo,
  RouteSearchPayload,
  ScanStage
} from './src/types';
import { fetchNearbyCameras, fetchRoadConditions, fetchRoute, fetchWeather } from './src/utils/api';
import { getNearestCameraUrl, getNearestRoadSurface } from './src/utils/enrichment';
import { API_BASE_URL } from './src/utils/config';
import { sampleRoute } from './src/utils/routeSampling';
import { computeRiskScore, riskColor, riskLabel } from './src/utils/risk';

function summarizeRiskZones(checkpoints: EnrichedCheckpoint[]): RiskZoneSummary {
  return checkpoints.reduce(
    (acc, checkpoint) => {
      acc[checkpoint.riskColor] += 1;
      return acc;
    },
    { green: 0, yellow: 0, orange: 0, red: 0 }
  );
}

export default function App() {
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null);
  const [checkpoints, setCheckpoints] = useState<EnrichedCheckpoint[]>([]);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<EnrichedCheckpoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanStage, setScanStage] = useState<ScanStage>('idle');
  const [cameraProgress, setCameraProgress] = useState<CameraScanProgress>({ completed: 0, total: 0 });
  const [activeRouteLabel, setActiveRouteLabel] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const riskZones = summarizeRiskZones(checkpoints);

  const handleSearch = async (payload: RouteSearchPayload) => {
    try {
      setLoading(true);
      setScanStage('route');
      setCameraProgress({ completed: 0, total: 0 });
      setActiveRouteLabel(`${payload.originLabel} to ${payload.destinationLabel}`);
      setError(null);
      setRouteGeometry(null);
      setCheckpoints([]);
      setRouteInfo(null);
      setSelectedCheckpoint(null);

      const route = await fetchRoute(payload.origin, payload.destination);
      const sampled = sampleRoute(route.geometry, payload.departureTime, 50, 95);

      if (sampled.length === 0) {
        throw new Error('No checkpoints generated from route geometry');
      }

      setScanStage('weather');
      const weatherPoints = await fetchWeather(
        sampled.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          etaTimestamp: point.etaTimestamp
        }))
      );

      setScanStage('roads');
      let roadConditions: unknown[] = [];
      try {
        roadConditions = await fetchRoadConditions();
      } catch {
        roadConditions = [];
      }

      setScanStage('cameras');
      setCameraProgress({ completed: 0, total: sampled.length });
      let completedCameraChecks = 0;
      const nearbyCamerasPerCheckpoint = await Promise.all(
        sampled.map(async (point) => {
          try {
            return await fetchNearbyCameras(point.lat, point.lng, 100);
          } catch {
            return [] as unknown[];
          } finally {
            completedCameraChecks += 1;
            setCameraProgress({ completed: completedCameraChecks, total: sampled.length });
          }
        })
      );

      setScanStage('risk');
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
          cameraUrl: resolvedCameraUrl
        };
      });

      const firstPriorityCheckpoint = enriched.find((checkpoint) => checkpoint.riskScore >= 0.5) ?? enriched[0] ?? null;

      setRouteGeometry(route.geometry);
      setCheckpoints(enriched);
      setRouteInfo({
        distanceKm: Number(route.distanceKm),
        durationHrs: Number(route.durationHrs),
        distanceM: route.distanceM,
        durationS: route.durationS
      });
      setSelectedCheckpoint(firstPriorityCheckpoint);
      setLastScanAt(new Date().toISOString());
      setScanStage('complete');
    } catch (searchError) {
      const message = searchError instanceof Error ? searchError.message : 'Failed to scan route';
      setScanStage('error');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onCheckpointUpdate = (updated: EnrichedCheckpoint) => {
    setCheckpoints((current) => current.map((checkpoint) => (checkpoint.id === updated.id ? updated : checkpoint)));
    setSelectedCheckpoint(updated);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.backgroundOrbPrimary} />
      <View style={styles.backgroundOrbSecondary} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Hackathon mobile build</Text>
          <Text style={styles.title}>SnowDogs</Text>
          <Text style={styles.subtitle}>Native Expo companion for winter route intelligence across Ontario corridors.</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>Expo + native maps</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>API {API_BASE_URL.replace(/^https?:\/\//, '')}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>Live checkpoint AI</Text>
            </View>
          </View>
        </View>

        <OperationsCard
          loading={loading}
          scanStage={scanStage}
          cameraProgress={cameraProgress}
          routeLabel={activeRouteLabel}
          routeInfo={routeInfo}
          checkpoints={checkpoints}
          selectedCheckpoint={selectedCheckpoint}
          lastScanAt={lastScanAt}
        />

        <RouteForm loading={loading} scanStage={scanStage} cameraProgress={cameraProgress} onSubmit={handleSearch} />

        {error ? (
          <SectionCard eyebrow="Route Error" title="Scan failed" style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </SectionCard>
        ) : null}

        <SummaryCards routeInfo={routeInfo} checkpoints={checkpoints} riskZones={riskZones} />
        <RouteMap
          routeGeometry={routeGeometry}
          checkpoints={checkpoints}
          selectedCheckpointId={selectedCheckpoint?.id ?? null}
          onCheckpointSelect={setSelectedCheckpoint}
        />
        <RiskStrip checkpoints={checkpoints} onCheckpointSelect={setSelectedCheckpoint} />
        <CheckpointList
          checkpoints={checkpoints}
          selectedCheckpointId={selectedCheckpoint?.id ?? null}
          onCheckpointSelect={setSelectedCheckpoint}
        />

        {selectedCheckpoint ? (
          <CheckpointDetailCard checkpoint={selectedCheckpoint} onCheckpointUpdate={onCheckpointUpdate} />
        ) : (
          <SectionCard
            eyebrow="Checkpoint Detail"
            title="Pick a checkpoint"
            subtitle="After a scan, select any stop in the timeline to open the camera analysis, AI summary, and spoken advisory tools."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg
  },
  hero: {
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    fontWeight: '700'
  },
  title: {
    color: colors.text,
    fontSize: 42,
    lineHeight: 44,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 420
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4
  },
  metaChip: {
    backgroundColor: 'rgba(22, 35, 56, 0.88)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill
  },
  metaChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  errorCard: {
    borderColor: 'rgba(244, 91, 105, 0.6)'
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20
  },
  backgroundOrbPrimary: {
    position: 'absolute',
    top: -80,
    right: -30,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(74, 158, 255, 0.16)'
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    top: 240,
    left: -120,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.08)'
  }
});
