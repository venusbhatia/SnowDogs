import * as Speech from 'expo-speech';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import type { AgentBriefing, EnrichedCheckpoint, Report, RouteInfo } from '../types';
import { colors, radius, spacing } from '../theme';
import { fetchReports, runAgentAnalysis, submitReport } from '../utils/api';
import SectionCard from './SectionCard';

type Props = {
  checkpoints: EnrichedCheckpoint[];
  routeInfo: RouteInfo | null;
  routeNames: { origin: string; destination: string } | null;
};

const STATUS_STEPS = [
  'Geocoding driver reports...',
  'Cross-referencing Ontario 511...',
  'Checking weather data...',
  'Assessing report credibility...',
  'Generating route briefing...'
];

function overallRiskStyle(risk: string): { color: string; bg: string; label: string } {
  const n = risk.toLowerCase();
  if (n === 'safe') return { color: colors.green, bg: 'rgba(34,197,94,0.16)', label: 'SAFE' };
  if (n === 'moderate') return { color: colors.yellow, bg: 'rgba(245,197,66,0.16)', label: 'MODERATE' };
  if (n === 'hazardous') return { color: colors.orange, bg: 'rgba(245,139,58,0.16)', label: 'HAZARDOUS' };
  return { color: colors.red, bg: 'rgba(244,91,105,0.16)', label: 'DO NOT TRAVEL' };
}

function credColor(v: number): string {
  if (v < 0.35) return colors.red;
  if (v < 0.6) return colors.yellow;
  if (v < 0.8) return colors.orange;
  return colors.green;
}

function truncate(text: string, max = 100): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

function relativeTime(iso: string): string {
  const delta = Date.now() - Date.parse(iso);
  const abs = Math.abs(delta);
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ago`;
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ago`;
  return `${Math.floor(abs / 86_400_000)}d ago`;
}

export default function AgentCard({ checkpoints, routeInfo, routeNames }: Props) {
  const [reportText, setReportText] = useState('');
  const [reportSource, setReportSource] = useState<'app' | 'social_media'>('social_media');
  const [reports, setReports] = useState<Report[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [briefing, setBriefing] = useState<AgentBriefing | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = checkpoints.length > 0 && routeInfo !== null && !runLoading;

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    [reports]
  );

  useEffect(() => {
    fetchReports().then(setReports).catch(() => {});
  }, []);

  useEffect(() => {
    if (!runLoading) return;
    const id = setInterval(() => setStepIndex((p) => (p + 1) % STATUS_STEPS.length), 3000);
    return () => clearInterval(id);
  }, [runLoading]);

  const handleSubmit = async () => {
    const text = reportText.trim();
    if (!text) { setError('Enter a report first.'); return; }
    try {
      setSubmitLoading(true); setError(null);
      await submitReport(text, reportSource);
      setReportText('');
      const fresh = await fetchReports();
      setReports(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRun = async () => {
    if (!routeInfo || !checkpoints.length) return;
    try {
      setRunLoading(true); setStepIndex(0); setError(null); setBriefing(null);
      const latest = await fetchReports();
      setReports(latest);
      const result = await runAgentAnalysis({
        reports: latest.map((r) => ({ text: r.text, source: r.source, timestamp: r.timestamp })),
        checkpoints: checkpoints.map((c) => ({
          lat: c.lat, lng: c.lng, distanceKm: c.distanceKm, riskScore: c.riskScore, etaTimestamp: c.etaTimestamp
        })),
        routeSummary: {
          origin: routeNames?.origin || 'Unknown',
          destination: routeNames?.destination || 'Unknown',
          distanceKm: routeInfo.distanceKm,
          durationHrs: routeInfo.durationHrs
        }
      });
      setBriefing(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent failed');
    } finally {
      setRunLoading(false);
    }
  };

  const handleSpeak = async () => {
    if (!briefing?.executive_summary) return;
    try {
      setSpeaking(true);
      await Speech.speak(briefing.executive_summary, { language: 'en', rate: 0.9 });
    } catch {
      setError('Speech failed');
    } finally {
      setSpeaking(false);
    }
  };

  const riskStyle = briefing ? overallRiskStyle(briefing.overall_risk) : null;

  return (
    <SectionCard eyebrow="Route Intelligence Agent" title="AI Agent">
      {/* Report input */}
      <TextInput
        style={s.input}
        placeholder="Paste a road report from Facebook, Reddit, or type your own..."
        placeholderTextColor={colors.textSoft}
        multiline
        numberOfLines={3}
        value={reportText}
        onChangeText={setReportText}
      />

      <View style={s.sourceRow}>
        <Pressable style={[s.sourceBtn, reportSource === 'app' && s.sourceBtnActive]} onPress={() => setReportSource('app')}>
          <Text style={[s.sourceBtnText, reportSource === 'app' && s.sourceBtnTextActive]}>Personal</Text>
        </Pressable>
        <Pressable style={[s.sourceBtn, reportSource === 'social_media' && s.sourceBtnActive]} onPress={() => setReportSource('social_media')}>
          <Text style={[s.sourceBtnText, reportSource === 'social_media' && s.sourceBtnTextActive]}>Social Media</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={s.submitBtn} onPress={handleSubmit} disabled={submitLoading}>
          <Text style={s.submitBtnText}>{submitLoading ? 'Submitting...' : 'Submit'}</Text>
        </Pressable>
      </View>

      {/* Reports list */}
      {sortedReports.length > 0 && (
        <View style={s.reportsList}>
          {sortedReports.slice(0, 4).map((r) => (
            <View key={r.id} style={s.reportItem}>
              <Text style={s.reportText} numberOfLines={2}>{truncate(r.text)}</Text>
              <View style={s.reportMeta}>
                <View style={[s.sourceBadge, { backgroundColor: r.source === 'social_media' ? 'rgba(74,158,255,0.18)' : 'rgba(34,197,94,0.18)' }]}>
                  <Text style={[s.sourceBadgeText, { color: r.source === 'social_media' ? colors.accent : colors.green }]}>
                    {r.source === 'social_media' ? 'Social' : 'Personal'}
                  </Text>
                </View>
                <Text style={s.reportTime}>{relativeTime(r.timestamp)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Run agent button */}
      <Pressable style={[s.runBtn, !canRun && s.runBtnDisabled]} onPress={handleRun} disabled={!canRun}>
        {runLoading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={s.runBtnText}>{STATUS_STEPS[stepIndex]}</Text>
          </View>
        ) : (
          <Text style={s.runBtnText}>Run AI Agent Analysis</Text>
        )}
      </Pressable>

      {/* Briefing results */}
      {briefing && riskStyle && (
        <View style={s.briefing}>
          <View style={[s.riskBadge, { borderColor: riskStyle.color, backgroundColor: riskStyle.bg }]}>
            <Text style={[s.riskBadgeText, { color: riskStyle.color }]}>{riskStyle.label}</Text>
          </View>

          <Text style={s.actionText}>{briefing.recommended_action}</Text>

          <View style={s.summaryBox}>
            <Text style={s.summaryText}>{briefing.executive_summary}</Text>
          </View>

          <Pressable style={s.speakBtn} onPress={handleSpeak} disabled={speaking}>
            <Text style={s.speakBtnText}>{speaking ? 'Reading...' : 'Read Briefing Aloud'}</Text>
          </Pressable>

          {/* Processed reports */}
          {(briefing.processed_reports || []).length > 0 && (
            <>
              <Text style={s.sectionLabel}>Processed Reports</Text>
              {briefing.processed_reports.map((pr, i) => {
                const cred = Math.max(0, Math.min(1, Number(pr.credibility) || 0));
                return (
                  <View key={`${i}-${pr.resolved_location}`} style={s.prCard}>
                    <Text style={s.prText} numberOfLines={2}>{truncate(pr.original_text, 140)}</Text>
                    <Text style={s.prLocation}>Location: {pr.resolved_location || 'Unknown'}</Text>
                    <View style={s.credRow}>
                      <Text style={s.credLabel}>Credibility</Text>
                      <Text style={[s.credValue, { color: credColor(cred) }]}>{Math.round(cred * 100)}%</Text>
                    </View>
                    <View style={s.credBarBg}>
                      <View style={[s.credBarFill, { width: `${cred * 100}%`, backgroundColor: credColor(cred) }]} />
                    </View>
                    <Text style={[s.agreesText, { color: pr.official_agrees ? colors.green : colors.red }]}>
                      {pr.official_agrees ? '✓ Official data agrees' : '✗ Official data does not agree'}
                    </Text>
                  </View>
                );
              })}
            </>
          )}

          {/* Risk segments */}
          {(briefing.risk_segments || []).length > 0 && (
            <>
              <Text style={s.sectionLabel}>Risk Segments</Text>
              {briefing.risk_segments.map((seg, i) => (
                <View key={`${i}-${seg.location}`} style={s.segCard}>
                  <Text style={s.segLocation}>{seg.location}</Text>
                  <Text style={s.segDesc}>{seg.description}</Text>
                  <Text style={s.segMeta}>Risk: {seg.risk}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {error ? <Text style={s.errorText}>{error}</Text> : null}
    </SectionCard>
  );
}

const s = StyleSheet.create({
  input: {
    color: colors.text,
    backgroundColor: 'rgba(74,158,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.35)',
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 13,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: spacing.xs
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  sourceBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border
  },
  sourceBtnActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(74,158,255,0.12)'
  },
  sourceBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted
  },
  sourceBtnTextActive: {
    color: colors.accent
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm
  },
  submitBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700'
  },
  reportsList: {
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  reportItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.xs,
    backgroundColor: colors.bgElevated
  },
  reportText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4
  },
  reportMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sourceBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700'
  },
  reportTime: {
    fontSize: 11,
    color: colors.textSoft
  },
  runBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  runBtnDisabled: {
    opacity: 0.5
  },
  runBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800'
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  briefing: {
    gap: spacing.sm
  },
  riskBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  riskBadgeText: {
    fontSize: 13,
    fontWeight: '800'
  },
  actionText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19
  },
  summaryBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    padding: spacing.sm
  },
  summaryText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19
  },
  speakBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.panel
  },
  speakBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  sectionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xs
  },
  prCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    padding: spacing.xs,
    gap: 4
  },
  prText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  },
  prLocation: {
    color: colors.textMuted,
    fontSize: 11
  },
  credRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  credLabel: {
    color: colors.textMuted,
    fontSize: 11
  },
  credValue: {
    fontSize: 11,
    fontWeight: '700'
  },
  credBarBg: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.panelSoft,
    overflow: 'hidden'
  },
  credBarFill: {
    height: '100%',
    borderRadius: radius.pill
  },
  agreesText: {
    fontSize: 11
  },
  segCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    padding: spacing.xs,
    gap: 3
  },
  segLocation: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  segDesc: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16
  },
  segMeta: {
    color: colors.textSoft,
    fontSize: 11
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    marginTop: spacing.xs
  }
});
