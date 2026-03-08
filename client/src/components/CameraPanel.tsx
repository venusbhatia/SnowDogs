import { AdvancedImage, lazyload, placeholder, responsive } from '@cloudinary/react';
import { Cloudinary } from '@cloudinary/url-gen';
import { improve } from '@cloudinary/url-gen/actions/adjust';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { webp } from '@cloudinary/url-gen/qualifiers/format';
import { auto } from '@cloudinary/url-gen/qualifiers/quality';
import { useEffect, useMemo, useState } from 'react';

import type { EnrichedCheckpoint } from '../types';
import {
  analyzeCamera,
  enhanceCamera,
  generateAdvisory,
  speakAlert,
  type CameraAnalysis,
  type CloudinaryEnhanceResult
} from '../utils/api';

type Props = {
  checkpoint: EnrichedCheckpoint;
  onClose: () => void;
  onCheckpointUpdate: (checkpoint: EnrichedCheckpoint) => void;
};

const cld = new Cloudinary({
  cloud: { cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'demo' }
});

function riskHex(label: EnrichedCheckpoint['riskLabel']): string {
  if (label === 'Clear') {
    return 'var(--green)';
  }
  if (label === 'Caution') {
    return 'var(--yellow)';
  }
  if (label === 'Hazardous') {
    return 'var(--orange)';
  }
  return 'var(--red)';
}

function valueStyle(isDanger: boolean): React.CSSProperties {
  return {
    fontSize: 14,
    fontWeight: 700,
    color: isDanger ? 'var(--orange)' : 'var(--text-primary)'
  };
}

function deriveCameraId(imageUrl: string): string {
  try {
    const parsed = new URL(imageUrl, window.location.origin);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1] || 'camera';
    return lastPart.replace(/\.[a-z0-9]+$/i, '') || 'camera';
  } catch {
    return 'camera';
  }
}

export default function CameraPanel({ checkpoint, onClose, onCheckpointUpdate }: Props) {
  const cameraUrl = checkpoint._cameraUrl || checkpoint.cameraUrl || null;

  const [analysisCache, setAnalysisCache] = useState<Record<string, CameraAnalysis>>({});
  const [analysis, setAnalysis] = useState<CameraAnalysis | null>(checkpoint.cameraAnalysis ?? null);
  const [cloudinaryResult, setCloudinaryResult] = useState<CloudinaryEnhanceResult | null>(null);
  const [advisory, setAdvisory] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhancedImg = useMemo(() => {
    if (!cloudinaryResult?.publicId) {
      return null;
    }

    return cld
      .image(cloudinaryResult.publicId)
      .adjust(improve())
      .delivery(format(webp()))
      .delivery(quality(auto()));
  }, [cloudinaryResult?.publicId]);

  useEffect(() => {
    if (cameraUrl && analysisCache[cameraUrl]) {
      setAnalysis(analysisCache[cameraUrl]);
    } else {
      setAnalysis(checkpoint.cameraAnalysis ?? null);
    }
    setAdvisory('');
    setCloudinaryResult(null);
    setEnhancing(false);
    setError(null);
  }, [checkpoint.id, checkpoint.cameraAnalysis, cameraUrl, analysisCache]);

  const weather = checkpoint.forecast;

  const danger = useMemo(
    () => ({
      snow: (weather?.snowfall ?? 0) > 0,
      visibility: (weather?.visibility ?? Number.POSITIVE_INFINITY) < 1000,
      wind: (weather?.windSpeed ?? 0) > 40
    }),
    [weather]
  );

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      setError(null);

      if (cameraUrl) {
        if (analysisCache[cameraUrl]) {
          setAnalysis(analysisCache[cameraUrl]);
          return;
        }

        const result = await analyzeCamera(cameraUrl);
        setAnalysis(result);
        setAnalysisCache((prev) => ({ ...prev, [cameraUrl]: result }));
        onCheckpointUpdate({ ...checkpoint, cameraAnalysis: result });
        return;
      }

      const advisoryResult = await generateAdvisory({
        lat: checkpoint.lat,
        lng: checkpoint.lng,
        eta: checkpoint.etaTimestamp,
        snowfall: weather?.snowfall ?? 0,
        visibility: weather?.visibility ?? 0,
        windSpeed: weather?.windSpeed ?? 0,
        temperature: weather?.temperature ?? 0,
        roadSurface: 'unknown',
        riskScore: checkpoint.riskScore
      });
      setAdvisory(advisoryResult.advisory);
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Camera analysis failed';
      setError(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const playVoiceAlert = async () => {
    try {
      setSpeaking(true);
      setError(null);

      let message = advisory;
      if (!message) {
        const result = await generateAdvisory({
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
        message = result.advisory;
        setAdvisory(message);
      }

      await speakAlert(message);
    } catch (voiceError) {
      const message = voiceError instanceof Error ? voiceError.message : 'Voice alert failed';
      setError(message);
    } finally {
      setSpeaking(false);
    }
  };

  const runCloudinaryEnhancement = async () => {
    try {
      if (!cameraUrl) {
        setError('No nearby camera available for Cloudinary enhancement.');
        return;
      }

      setEnhancing(true);
      setError(null);
      const result = await enhanceCamera(cameraUrl, deriveCameraId(cameraUrl));
      setCloudinaryResult(result);
    } catch (cloudinaryError) {
      const message = cloudinaryError instanceof Error ? cloudinaryError.message : 'Cloudinary enhancement failed';
      setError(message);
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <div
      style={{
        width: 340,
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontSize: 13
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: riskHex(checkpoint.riskLabel) }}>
            {checkpoint.riskLabel}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
            {checkpoint.distanceKm.toFixed(1)} km from start • ETA {checkpoint.etaLocal}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            width: 28,
            height: 28,
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          X
        </button>
      </div>

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--bg-panel)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
          Weather at Arrival
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Temp</span>
            <span style={valueStyle(false)}>{weather?.temperature ?? '-'}C</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Feels Like</span>
            <span style={valueStyle(false)}>{weather?.apparentTemp ?? '-'}C</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Snow</span>
            <span style={valueStyle(danger.snow)}>{weather?.snowfall ?? '-'} cm/h</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visibility</span>
            <span style={valueStyle(danger.visibility)}>{weather?.visibility ?? '-'} m</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Wind</span>
            <span style={valueStyle(danger.wind)}>{weather?.windSpeed ?? '-'} km/h</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Precip %</span>
            <span style={valueStyle(false)}>{weather?.precipProb ?? '-'}%</span>
          </div>
        </div>
      </section>

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--bg-panel)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
          Highway Camera
        </div>

        {cameraUrl ? (
          enhancedImg ? (
            <AdvancedImage
              cldImg={enhancedImg}
              plugins={[lazyload(), responsive(), placeholder()]}
              style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
            />
          ) : (
            <img
              src={cameraUrl}
              alt="Highway camera"
              style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
            />
          )
        ) : (
          <div
            style={{
              border: '1px dashed var(--border)',
              borderRadius: 10,
              padding: 14,
              color: 'var(--text-secondary)',
              fontSize: 12
            }}
          >
            No nearby camera available for this checkpoint.
          </div>
        )}

        <button
          type="button"
          onClick={runAnalysis}
          disabled={analyzing}
          style={{
            border: '1px solid transparent',
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: analyzing ? 'not-allowed' : 'pointer',
            opacity: analyzing ? 0.8 : 1,
            transition: 'all 0.2s ease'
          }}
        >
          {analyzing
            ? 'Analyzing with Gemini...'
            : cameraUrl
              ? 'Analyze with AI'
              : 'Analyze Weather with AI'}
        </button>

        <button
          type="button"
          onClick={runCloudinaryEnhancement}
          disabled={enhancing || !cameraUrl}
          style={{
            border: '1px solid transparent',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #3448C5 0%, #5B8DEF 100%)',
            color: '#fff',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: enhancing || !cameraUrl ? 'not-allowed' : 'pointer',
            opacity: enhancing || !cameraUrl ? 0.8 : 1,
            transition: 'all 0.2s ease'
          }}
        >
          {enhancing ? 'Enhancing with Cloudinary...' : 'Enhance & Second Opinion (Cloudinary)'}
        </button>

        {cloudinaryResult && cameraUrl && (
          <div style={{ display: 'grid', gap: 9 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
              Before / After
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--bg-secondary)'
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                  Original (511)
                </div>
                <img src={cameraUrl} alt="Original highway camera" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
              </div>

              <div
                style={{
                  flex: 1,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--bg-secondary)'
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                  AI Enhanced (Cloudinary)
                </div>
                {enhancedImg ? (
                  <AdvancedImage
                    cldImg={enhancedImg}
                    plugins={[lazyload(), responsive(), placeholder()]}
                    style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <img src={cloudinaryResult.enhancedUrl} alt="Enhanced highway camera" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                )}
              </div>
            </div>

            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
              Cloudinary AI Vision
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Surface</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {cloudinaryResult.vision.road_surface}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visibility</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {cloudinaryResult.vision.visibility}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Snow Cover</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {cloudinaryResult.vision.snow_coverage_percent}%
                </span>
              </div>
            </div>

            {cloudinaryResult.vision.hazards.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cloudinaryResult.vision.hazards.map((hazard) => (
                  <span
                    key={hazard}
                    style={{
                      background: 'rgba(74,158,255,0.15)',
                      color: 'var(--accent)',
                      borderRadius: 999,
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 700
                    }}
                  >
                    {hazard}
                  </span>
                ))}
              </div>
            )}

            {analysis && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--bg-secondary)',
                  padding: 9,
                  display: 'grid',
                  gap: 7
                }}
              >
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
                  Dual AI Consensus
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color:
                      analysis.road_surface.toLowerCase() === cloudinaryResult.vision.road_surface.toLowerCase()
                        ? 'var(--green)'
                        : 'var(--orange)'
                  }}
                >
                  {analysis.road_surface.toLowerCase() === cloudinaryResult.vision.road_surface.toLowerCase()
                    ? '✓ Both AIs agree'
                    : `⚠ Gemini: ${analysis.road_surface} | Cloudinary: ${cloudinaryResult.vision.road_surface}`}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color:
                      analysis.visibility.toLowerCase() === cloudinaryResult.vision.visibility.toLowerCase()
                        ? 'var(--green)'
                        : 'var(--orange)'
                  }}
                >
                  {analysis.visibility.toLowerCase() === cloudinaryResult.vision.visibility.toLowerCase()
                    ? '✓ Both AIs agree'
                    : `⚠ Gemini: ${analysis.visibility} | Cloudinary: ${cloudinaryResult.vision.visibility}`}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color:
                      Math.abs(
                        Number(analysis.snow_coverage_percent) -
                          Number(cloudinaryResult.vision.snow_coverage_percent)
                      ) <= 15
                        ? 'var(--green)'
                        : 'var(--orange)'
                  }}
                >
                  {Math.abs(
                    Number(analysis.snow_coverage_percent) -
                      Number(cloudinaryResult.vision.snow_coverage_percent)
                  ) <= 15
                    ? '✓ Both AIs agree'
                    : `⚠ Gemini: ${analysis.snow_coverage_percent}% | Cloudinary: ${cloudinaryResult.vision.snow_coverage_percent}%`}
                </div>
              </div>
            )}
          </div>
        )}

        {analysis && (
          <div style={{ display: 'grid', gap: 8, marginTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Road Surface</span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '2px 8px'
                }}
              >
                {analysis.road_surface}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Visibility: <span style={{ color: 'var(--text-primary)' }}>{analysis.visibility}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Snow Coverage: <span style={{ color: 'var(--text-primary)' }}>{analysis.snow_coverage_percent}%</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{analysis.summary}</div>
          </div>
        )}
      </section>

      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--bg-panel)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
          Voice Alert
        </div>

        <button
          type="button"
          onClick={playVoiceAlert}
          disabled={speaking}
          style={{
            border: '1px solid transparent',
            borderRadius: 10,
            background: 'var(--red)',
            color: '#fff',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: speaking ? 'not-allowed' : 'pointer',
            opacity: speaking ? 0.8 : 1,
            transition: 'all 0.2s ease'
          }}
        >
          {speaking ? 'Speaking...' : 'Play Voice Alert'}
        </button>

        {advisory && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{advisory}</div>
        )}
      </section>

      {error && (
        <div
          style={{
            border: '1px solid rgba(239,68,68,0.5)',
            background: 'rgba(127,29,29,0.35)',
            color: '#fecaca',
            borderRadius: 10,
            padding: '9px 10px',
            fontSize: 12
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
