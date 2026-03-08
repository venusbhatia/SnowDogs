import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import * as Speech from 'expo-speech';

import { colors, radius, spacing } from '../theme';
import type { CameraAnalysis, EnrichedCheckpoint } from '../types';
import { analyzeCamera, generateAdvisory } from '../utils/api';
import { riskHex } from '../utils/risk';
import SectionCard from './SectionCard';

type Props = {
  checkpoint: EnrichedCheckpoint;
  onCheckpointUpdate: (checkpoint: EnrichedCheckpoint) => void;
};

function formatValue(value: number | null | undefined, suffix = ''): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return `${value}${suffix}`;
}

export default function CheckpointDetailCard({ checkpoint, onCheckpointUpdate }: Props) {
  const [analysis, setAnalysis] = useState<CameraAnalysis | null>(checkpoint.cameraAnalysis ?? null);
  const [advisory, setAdvisory] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingAdvisory, setGeneratingAdvisory] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnalysis(checkpoint.cameraAnalysis ?? null);
    setAdvisory('');
    setError(null);
  }, [checkpoint.cameraAnalysis, checkpoint.id]);

  useEffect(() => {
    return () => {
      void Speech.stop();
    };
  }, []);

  const weather = checkpoint.forecast;
  const cameraUrl = checkpoint.cameraUrl ?? null;

  const requestAdvisory = async (): Promise<string> => {
    const response = await generateAdvisory({
      lat: checkpoint.lat,
      lng: checkpoint.lng,
      eta: checkpoint.etaTimestamp,
      snowfall: weather?.snowfall ?? 0,
      visibility: weather?.visibility ?? 0,
      windSpeed: weather?.windSpeed ?? 0,
      temperature: weather?.temperature ?? 0,
      roadSurface: analysis?.road_surface || 'unknown',
      riskScore: checkpoint.riskScore
    });

    setAdvisory(response.advisory);
    return response.advisory;
  };

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      setError(null);

      if (!cameraUrl) {
        await requestAdvisory();
        return;
      }

      const result = await analyzeCamera(cameraUrl);
      setAnalysis(result);
      onCheckpointUpdate({ ...checkpoint, cameraAnalysis: result });
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Camera analysis failed';
      setError(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const buildAdvisory = async () => {
    try {
      setGeneratingAdvisory(true);
      setError(null);
      await requestAdvisory();
    } catch (advisoryError) {
      const message = advisoryError instanceof Error ? advisoryError.message : 'Advisory generation failed';
      setError(message);
    } finally {
      setGeneratingAdvisory(false);
    }
  };

  const speakAdvisory = async () => {
    try {
      setSpeaking(true);
      setError(null);

      const message = advisory || (await requestAdvisory());
      await Speech.stop();
      await new Promise<void>((resolve, reject) => {
        Speech.speak(message, {
          rate: 0.92,
          pitch: 1,
          onDone: () => resolve(),
          onStopped: () => resolve(),
          onError: () => reject(new Error('Speech playback failed'))
        });
      });
    } catch (speechError) {
      const message = speechError instanceof Error ? speechError.message : 'Voice playback failed';
      setError(message);
    } finally {
      setSpeaking(false);
    }
  };

  return (
    <SectionCard
      eyebrow="Checkpoint Detail"
      title={`${checkpoint.distanceKm.toFixed(0)} km • ${checkpoint.riskLabel}`}
      subtitle={`ETA ${checkpoint.etaLocal}. This is the mobile drill-down for camera analysis and spoken winter guidance.`}
    >
      <View style={styles.metricGrid}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Temp</Text>
          <Text style={styles.metricValue}>{formatValue(weather?.temperature, 'C')}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Visibility</Text>
          <Text style={[styles.metricValue, { color: (weather?.visibility ?? 9999) < 1000 ? colors.orange : colors.text }]}>
            {formatValue(weather?.visibility, ' m')}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Snowfall</Text>
          <Text style={[styles.metricValue, { color: (weather?.snowfall ?? 0) > 0 ? colors.orange : colors.text }]}>
            {formatValue(weather?.snowfall, ' cm/h')}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Wind</Text>
          <Text style={styles.metricValue}>{formatValue(weather?.windSpeed, ' km/h')}</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.riskPill, { borderColor: riskHex(checkpoint.riskColor) }]}>
          <Text style={[styles.riskPillText, { color: riskHex(checkpoint.riskColor) }]}>{checkpoint.riskLabel}</Text>
        </View>
        <Text style={styles.statusText}>{cameraUrl ? 'Nearest 511 camera attached' : 'No camera nearby, using weather-only AI brief'}</Text>
      </View>

      {cameraUrl ? (
        <Image source={{ uri: cameraUrl }} style={styles.cameraImage} resizeMode="cover" />
      ) : (
        <View style={styles.cameraFallback}>
          <Text style={styles.cameraFallbackText}>Ontario 511 did not return a nearby camera for this checkpoint.</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={runAnalysis}>
          {analyzing ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{cameraUrl ? 'Analyze camera' : 'Generate AI brief'}</Text>}
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={buildAdvisory}>
          {generatingAdvisory ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryButtonText}>Draft advisory</Text>}
        </Pressable>
      </View>

      <Pressable style={({ pressed }) => [styles.voiceButton, pressed && styles.pressed]} onPress={speakAdvisory}>
        {speaking ? <ActivityIndicator color={colors.white} /> : <Text style={styles.voiceButtonText}>Speak advisory</Text>}
      </Pressable>

      {analysis ? (
        <View style={styles.analysisBox}>
          <Text style={styles.analysisTitle}>AI camera analysis</Text>
          <Text style={styles.analysisText}>Surface: {analysis.road_surface}</Text>
          <Text style={styles.analysisText}>Visibility: {analysis.visibility}</Text>
          <Text style={styles.analysisText}>Snow coverage: {analysis.snow_coverage_percent}%</Text>
          {analysis.hazards?.length ? <Text style={styles.analysisText}>Hazards: {analysis.hazards.join(', ')}</Text> : null}
          <Text style={styles.analysisSummary}>{analysis.summary}</Text>
        </View>
      ) : null}

      {advisory ? (
        <View style={styles.advisoryBox}>
          <Text style={styles.analysisTitle}>Driver advisory</Text>
          <Text style={styles.advisoryText}>{advisory}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  metricBox: {
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
    fontSize: 18,
    fontWeight: '700'
  },
  statusRow: {
    gap: 10
  },
  riskPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.panelAlt
  },
  riskPillText: {
    fontSize: 13,
    fontWeight: '700'
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  cameraImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt
  },
  cameraFallback: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: spacing.lg,
    backgroundColor: colors.panelAlt
  },
  cameraFallbackText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    minHeight: 52
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700'
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    minHeight: 52
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  voiceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    minHeight: 52
  },
  voiceButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700'
  },
  pressed: {
    opacity: 0.9
  },
  analysisBox: {
    backgroundColor: colors.panelAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8
  },
  advisoryBox: {
    backgroundColor: colors.panelSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8
  },
  analysisTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  analysisText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  analysisSummary: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21
  },
  advisoryText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18
  }
});


