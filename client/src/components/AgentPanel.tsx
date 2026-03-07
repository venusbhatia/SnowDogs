import { useEffect, useMemo, useState } from 'react';

import type { EnrichedCheckpoint } from '../types';
import { speakAlert } from '../utils/api';

type Props = {
  checkpoints: EnrichedCheckpoint[];
  routeInfo: { distanceKm: number; durationHrs: number } | null;
  onRiskUpdate: (updates: Array<{ lat: number; lng: number; newRisk: number }>) => void;
};

type Report = {
  id: string;
  text: string;
  source: 'app' | 'social_media';
  timestamp: string;
  processed: boolean;
};

type AgentRiskSegment = {
  location: string;
  lat: number;
  lng: number;
  risk: string;
  description: string;
};

type ProcessedReport = {
  original_text: string;
  resolved_location: string;
  credibility: number;
  official_agrees: boolean;
};

type AgentBriefing = {
  overall_risk: 'safe' | 'moderate' | 'hazardous' | 'do_not_travel' | string;
  recommended_action: string;
  risk_segments: AgentRiskSegment[];
  processed_reports: ProcessedReport[];
  executive_summary: string;
};

type ApiError = {
  error?: string;
};

const STATUS_STEPS = [
  'Geocoding driver reports...',
  'Cross-referencing Ontario 511...',
  'Checking weather data...',
  'Assessing report credibility...',
  'Generating route briefing...'
];

function truncate(text: string, max = 120): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}...`;
}

function relativeTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return 'Unknown time';
  }

  const deltaMs = Date.now() - time;
  const abs = Math.abs(deltaMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) {
    return 'just now';
  }
  if (abs < hour) {
    return `${Math.floor(abs / minute)}m ago`;
  }
  if (abs < day) {
    return `${Math.floor(abs / hour)}h ago`;
  }
  return `${Math.floor(abs / day)}d ago`;
}

function reportSourceLabel(source: Report['source']): string {
  return source === 'social_media' ? 'Social Media' : 'Personal';
}

function normalizeReports(payload: unknown): Report[] {
  if (Array.isArray(payload)) {
    return payload as Report[];
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { reports?: unknown[] }).reports)) {
    return (payload as { reports: Report[] }).reports;
  }

  return [];
}

function toRiskScore(risk: string): number {
  const normalized = risk.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('do_not_travel') || normalized.includes('dangerous')) {
    return 0.95;
  }
  if (normalized.includes('hazard')) {
    return 0.7;
  }
  if (normalized.includes('moderate') || normalized.includes('caution')) {
    return 0.45;
  }
  return 0.15;
}

function overallRiskStyles(overallRisk: string): { color: string; background: string; label: string } {
  const normalized = overallRisk.toLowerCase();
  if (normalized === 'safe') {
    return { color: 'var(--green)', background: 'rgba(34,197,94,0.16)', label: 'SAFE' };
  }
  if (normalized === 'moderate') {
    return { color: 'var(--yellow)', background: 'rgba(234,179,8,0.16)', label: 'MODERATE' };
  }
  if (normalized === 'hazardous') {
    return { color: 'var(--orange)', background: 'rgba(249,115,22,0.16)', label: 'HAZARDOUS' };
  }
  return { color: 'var(--red)', background: 'rgba(239,68,68,0.16)', label: 'DO NOT TRAVEL' };
}

function credibilityColor(value: number): string {
  if (value < 0.35) {
    return 'var(--red)';
  }
  if (value < 0.6) {
    return 'var(--yellow)';
  }
  if (value < 0.8) {
    return 'var(--orange)';
  }
  return 'var(--green)';
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export default function AgentPanel({ checkpoints, routeInfo, onRiskUpdate }: Props) {
  const [reportText, setReportText] = useState('');
  const [reportSource, setReportSource] = useState<'app' | 'social_media'>('social_media');
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [briefing, setBriefing] = useState<AgentBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const loadingStep = STATUS_STEPS[loadingStepIndex] || STATUS_STEPS[0];
  const canRunAgent = checkpoints.length > 0 && routeInfo !== null && !runLoading;

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    [reports]
  );

  useEffect(() => {
    let intervalId: number | null = null;
    if (runLoading) {
      intervalId = window.setInterval(() => {
        setLoadingStepIndex((prev) => (prev + 1) % STATUS_STEPS.length);
      }, 3000);
    }

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [runLoading]);

  const loadReports = async (): Promise<Report[]> => {
    setReportsLoading(true);
    try {
      const response = await fetch('/api/reports');
      if (!response.ok) {
        throw new Error(await parseApiError(response, `Reports request failed (${response.status})`));
      }

      const payload = (await response.json()) as unknown;
      const normalized = normalizeReports(payload);
      setReports(normalized);
      return normalized;
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    loadReports().catch((loadError) => {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load reports';
      setError(message);
    });
  }, []);

  const submitReport = async () => {
    const text = reportText.trim();
    if (!text) {
      setError('Please enter a report before submitting.');
      return;
    }

    try {
      setSubmitLoading(true);
      setError(null);

      const response = await fetch('/api/reports/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: reportSource })
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, `Submit failed (${response.status})`));
      }

      setReportText('');
      await loadReports();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to submit report';
      setError(message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const runAgent = async () => {
    if (!routeInfo || checkpoints.length === 0) {
      return;
    }

    try {
      setRunLoading(true);
      setLoadingStepIndex(0);
      setError(null);
      setBriefing(null);

      const latestReports = await loadReports();
      const payload = {
        reports: latestReports.map((report) => ({
          text: report.text,
          source: report.source,
          timestamp: report.timestamp
        })),
        checkpoints: checkpoints.map((checkpoint) => ({
          lat: checkpoint.lat,
          lng: checkpoint.lng,
          distanceKm: checkpoint.distanceKm,
          riskScore: checkpoint.riskScore,
          etaTimestamp: checkpoint.etaTimestamp
        })),
        routeSummary: {
          origin: 'Thunder Bay',
          destination: 'Toronto',
          distanceKm: routeInfo.distanceKm,
          durationHrs: routeInfo.durationHrs
        }
      };

      const response = await fetch('/api/agent/analyze-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, `Agent request failed (${response.status})`));
      }

      const data = (await response.json()) as AgentBriefing;
      setBriefing(data);

      if (Array.isArray(data.risk_segments)) {
        const updates = data.risk_segments
          .map((segment) => ({
            lat: Number(segment.lat),
            lng: Number(segment.lng),
            newRisk: toRiskScore(segment.risk || data.overall_risk || 'moderate')
          }))
          .filter(
            (segment) =>
              Number.isFinite(segment.lat) && Number.isFinite(segment.lng) && Number.isFinite(segment.newRisk)
          );

        if (updates.length > 0) {
          onRiskUpdate(updates);
        }
      }
    } catch (agentError) {
      const message = agentError instanceof Error ? agentError.message : 'Agent analysis failed';
      setError(message);
    } finally {
      setRunLoading(false);
    }
  };

  const readBriefingAloud = async () => {
    if (!briefing?.executive_summary) {
      return;
    }

    try {
      setSpeaking(true);
      setError(null);
      await speakAlert(briefing.executive_summary);
    } catch (voiceError) {
      const message = voiceError instanceof Error ? voiceError.message : 'Failed to read briefing aloud';
      setError(message);
    } finally {
      setSpeaking(false);
    }
  };

  const riskStyle = briefing ? overallRiskStyles(briefing.overall_risk) : null;

  return (
    <div
      style={{
        height: '100%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 16,
        color: 'var(--text-primary)',
        background: 'var(--bg-secondary)',
        fontSize: 13
      }}
    >
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-panel)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
          Community Reports
        </div>

        <textarea
          rows={4}
          placeholder="Paste a road condition report from Facebook, Reddit, or type your own..."
          value={reportText}
          onChange={(event) => setReportText(event.target.value)}
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: 92,
            color: 'var(--text-primary)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 10,
            fontFamily: 'var(--font)',
            fontSize: 13
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <input
                type="radio"
                name="report-source"
                checked={reportSource === 'app'}
                onChange={() => setReportSource('app')}
              />
              Personal
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <input
                type="radio"
                name="report-source"
                checked={reportSource === 'social_media'}
                onChange={() => setReportSource('social_media')}
              />
              Social Media
            </label>
          </div>

          <button
            type="button"
            onClick={submitReport}
            disabled={submitLoading}
            style={{
              border: '1px solid transparent',
              borderRadius: 10,
              padding: '9px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--accent)',
              cursor: submitLoading ? 'not-allowed' : 'pointer',
              opacity: submitLoading ? 0.85 : 1
            }}
          >
            {submitLoading ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>

        <div
          style={{
            maxHeight: 240,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingRight: 2
          }}
        >
          {reportsLoading && <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Loading reports...</div>}

          {!reportsLoading && sortedReports.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No recent reports in the last 24 hours.</div>
          )}

          {sortedReports.map((report) => (
            <div
              key={report.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 9,
                display: 'grid',
                gap: 8,
                background: 'var(--bg-secondary)'
              }}
            >
              <div style={{ color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.35 }}>{truncate(report.text)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: report.source === 'social_media' ? 'rgba(74,158,255,0.18)' : 'rgba(34,197,94,0.18)',
                    color: report.source === 'social_media' ? 'var(--accent)' : 'var(--green)'
                  }}
                >
                  {reportSourceLabel(report.source)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relativeTime(report.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-panel)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0,
          flex: 1
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
          Route Intelligence Agent
        </div>

        <button
          type="button"
          onClick={runAgent}
          disabled={!canRunAgent}
          style={{
            border: '1px solid transparent',
            borderRadius: 12,
            padding: '13px 14px',
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            background: 'var(--accent)',
            opacity: canRunAgent ? 1 : 0.65,
            cursor: canRunAgent ? 'pointer' : 'not-allowed',
            transition: 'opacity 0.2s ease'
          }}
        >
          {runLoading ? 'Running Agent...' : 'Run AI Agent Analysis'}
        </button>

        {runLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-secondary)', fontSize: 12 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '2px solid var(--border)',
                borderTopColor: 'var(--accent)',
                animation: 'spin 1s linear infinite'
              }}
            />
            <span>{loadingStep}</span>
          </div>
        )}

        {briefing && riskStyle && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <div
              style={{
                alignSelf: 'flex-start',
                borderRadius: 999,
                border: `1px solid ${riskStyle.color}`,
                color: riskStyle.color,
                background: riskStyle.background,
                fontSize: 13,
                fontWeight: 800,
                padding: '6px 12px'
              }}
            >
              {riskStyle.label}
            </div>

            <div style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.4 }}>
              {briefing.recommended_action}
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-secondary)',
                padding: 10,
                color: 'var(--text-primary)',
                lineHeight: 1.45
              }}
            >
              {briefing.executive_summary}
            </div>

            <button
              type="button"
              onClick={readBriefingAloud}
              disabled={speaking}
              style={{
                alignSelf: 'flex-start',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: 12,
                padding: '8px 12px',
                cursor: speaking ? 'not-allowed' : 'pointer',
                opacity: speaking ? 0.75 : 1
              }}
            >
              {speaking ? 'Reading...' : 'Read Briefing Aloud'}
            </button>

            <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Processed Reports
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', paddingRight: 2 }}>
              {(briefing.processed_reports || []).map((report, index) => {
                const credibility = Math.max(0, Math.min(1, Number(report.credibility) || 0));
                const barColor = credibilityColor(credibility);
                return (
                  <div
                    key={`${report.original_text}-${index}`}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      background: 'var(--bg-secondary)',
                      padding: 9,
                      display: 'grid',
                      gap: 6
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{truncate(report.original_text, 170)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Location: <span style={{ color: 'var(--text-primary)' }}>{report.resolved_location || 'Unknown'}</span>
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Credibility</span>
                        <span style={{ color: barColor, fontWeight: 700 }}>{Math.round(credibility * 100)}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${credibility * 100}%`, background: barColor }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: report.official_agrees ? 'var(--green)' : 'var(--red)' }}>
                      {report.official_agrees ? '✓ Official data agrees' : 'X Official data does not agree'}
                    </div>
                  </div>
                );
              })}
            </div>

            {Array.isArray(briefing.risk_segments) && briefing.risk_segments.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase'
                  }}
                >
                  Risk Segments
                </div>
                <div style={{ display: 'grid', gap: 7, maxHeight: 180, overflowY: 'auto', paddingRight: 2 }}>
                  {briefing.risk_segments.map((segment, index) => (
                    <div
                      key={`${segment.location}-${index}`}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        background: 'var(--bg-secondary)',
                        padding: 8,
                        display: 'grid',
                        gap: 4
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{segment.location}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{segment.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Risk: {segment.risk} • {Number(segment.lat).toFixed(3)}, {Number(segment.lng).toFixed(3)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      </section>
    </div>
  );
}
