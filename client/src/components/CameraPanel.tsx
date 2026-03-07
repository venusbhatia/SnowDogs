import { useEffect, useState } from 'react';

import type { EnrichedCheckpoint } from '../types';
import { analyzeCamera, generateAdvisory, speakAlert, type CameraAnalysis } from '../utils/api';

type Props = {
  checkpoint: EnrichedCheckpoint;
  onClose: () => void;
  onCheckpointUpdate: (checkpoint: EnrichedCheckpoint) => void;
};

const DEFAULT_CAMERA_IMAGE = 'https://images.unsplash.com/photo-1489674267075-cee793167910?auto=format&fit=crop&w=1200&q=80';

export default function CameraPanel({ checkpoint, onClose, onCheckpointUpdate }: Props) {
  const [imageUrl, setImageUrl] = useState(DEFAULT_CAMERA_IMAGE);
  const [analysis, setAnalysis] = useState<CameraAnalysis | null>(checkpoint.cameraAnalysis ?? null);
  const [advisory, setAdvisory] = useState<string>('');
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingAdvisory, setLoadingAdvisory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnalysis(checkpoint.cameraAnalysis ?? null);
    setAdvisory('');
    setError(null);
  }, [checkpoint.id, checkpoint.cameraAnalysis]);

  const runAnalysis = async () => {
    try {
      setLoadingAnalysis(true);
      setError(null);

      const result = await analyzeCamera(imageUrl);
      setAnalysis(result);
      onCheckpointUpdate({ ...checkpoint, cameraAnalysis: result });
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Camera analysis failed';
      setError(message);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const playAlert = async () => {
    try {
      setLoadingAdvisory(true);
      setError(null);

      const result = await generateAdvisory({
        lat: checkpoint.lat,
        lng: checkpoint.lng,
        eta: checkpoint.etaTimestamp,
        snowfall: checkpoint.forecast?.snowfall ?? 0,
        visibility: checkpoint.forecast?.visibility ?? 0,
        windSpeed: checkpoint.forecast?.windSpeed ?? 0,
        temperature: checkpoint.forecast?.temperature ?? 0,
        roadSurface: analysis?.road_surface ?? 'unknown',
        riskScore: checkpoint.riskScore
      });

      setAdvisory(result.advisory);
      await speakAlert(result.advisory);
    } catch (advisoryError) {
      const message = advisoryError instanceof Error ? advisoryError.message : 'Failed to generate voice alert';
      setError(message);
    } finally {
      setLoadingAdvisory(false);
    }
  };

  return (
    <div className="camera-panel">
      <div className="panel-header">
        <h2>Checkpoint Detail</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <p>
        {checkpoint.distanceKm.toFixed(1)} km marker | {checkpoint.riskLabel} risk ({(checkpoint.riskScore * 100).toFixed(0)}%)
      </p>
      <p>ETA: {checkpoint.etaLocal}</p>

      <div className="weather-grid">
        <div>
          <span>Temp</span>
          <strong>{checkpoint.forecast?.temperature ?? '-'}C</strong>
        </div>
        <div>
          <span>Snowfall</span>
          <strong>{checkpoint.forecast?.snowfall ?? '-'} cm/h</strong>
        </div>
        <div>
          <span>Visibility</span>
          <strong>{checkpoint.forecast?.visibility ?? '-'} m</strong>
        </div>
        <div>
          <span>Wind</span>
          <strong>{checkpoint.forecast?.windSpeed ?? '-'} km/h</strong>
        </div>
      </div>

      <div className="camera-preview">
        <img src={imageUrl} alt="Checkpoint camera" />
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="Camera image URL"
        />
      </div>

      <div className="camera-actions">
        <button type="button" onClick={runAnalysis} disabled={loadingAnalysis}>
          {loadingAnalysis ? 'Analyzing...' : 'Analyze with AI'}
        </button>
        <button type="button" onClick={playAlert} disabled={loadingAdvisory}>
          {loadingAdvisory ? 'Generating...' : 'Play Voice Alert'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {analysis && (
        <section className="card">
          <h3>Gemini Camera Analysis</h3>
          <p>Road Surface: {analysis.road_surface}</p>
          <p>Visibility: {analysis.visibility}</p>
          <p>Snow Coverage: {analysis.snow_coverage_percent}%</p>
          <p>Precipitation: {analysis.active_precipitation}</p>
          <p>Hazards: {analysis.hazards.join(', ') || 'None reported'}</p>
          <p>{analysis.summary}</p>
        </section>
      )}

      {advisory && (
        <section className="card">
          <h3>Driving Advisory</h3>
          <p>{advisory}</p>
        </section>
      )}
    </div>
  );
}
