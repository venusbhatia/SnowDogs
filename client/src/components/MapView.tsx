import { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import Map, { Layer, Marker, NavigationControl, Popup, Source, type MapRef } from 'react-map-gl';

import type { EnrichedCheckpoint, RouteGeometry } from '../types';
import { riskColor } from '../utils/sampling';

type Props = {
  routeGeometry: RouteGeometry | null;
  checkpoints: EnrichedCheckpoint[];
  selectedCheckpointId: string | null;
  onCheckpointClick: (checkpoint: EnrichedCheckpoint) => void;
};

function riskToHex(score: number): string {
  const level = riskColor(score);
  if (level === 'green') {
    return '#22c55e';
  }
  if (level === 'yellow') {
    return '#eab308';
  }
  if (level === 'orange') {
    return '#f97316';
  }
  return '#ef4444';
}

function buildSegmentCollection(
  routeGeometry: RouteGeometry,
  checkpoints: EnrichedCheckpoint[]
): FeatureCollection<LineString, { color: string; id: string }> {
  const coordinates = routeGeometry.coordinates;

  if (coordinates.length < 2 || checkpoints.length < 2) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  const maxDistance = checkpoints[checkpoints.length - 1]?.distanceKm || 1;
  const lastCoordIndex = coordinates.length - 1;

  const features: Array<Feature<LineString, { color: string; id: string }>> = checkpoints
    .slice(0, -1)
    .map((checkpoint, idx) => {
      const next = checkpoints[idx + 1];
      const startRatio = Math.max(0, Math.min(1, checkpoint.distanceKm / maxDistance));
      const endRatio = Math.max(0, Math.min(1, next.distanceKm / maxDistance));

      const startIdx = Math.floor(startRatio * lastCoordIndex);
      const endIdx = Math.max(startIdx + 1, Math.floor(endRatio * lastCoordIndex));

      const segment = coordinates.slice(startIdx, endIdx + 1);
      const lineCoords = segment.length >= 2 ? segment : [coordinates[startIdx], coordinates[endIdx]];

      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lineCoords
        },
        properties: {
          id: `${checkpoint.id}-${next.id}`,
          color: riskToHex(next.riskScore)
        }
      };
    });

  return {
    type: 'FeatureCollection',
    features
  };
}

export default function MapView({
  routeGeometry,
  checkpoints,
  selectedCheckpointId,
  onCheckpointClick
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [hoveredCheckpointId, setHoveredCheckpointId] = useState<string | null>(null);

  const token = import.meta.env.VITE_MAPBOX_TOKEN || '';

  const segmentCollection = useMemo(() => {
    if (!routeGeometry) {
      return {
        type: 'FeatureCollection',
        features: []
      } as FeatureCollection<LineString, { color: string; id: string }>;
    }

    return buildSegmentCollection(routeGeometry, checkpoints);
  }, [routeGeometry, checkpoints]);

  const hoveredCheckpoint =
    checkpoints.find((checkpoint) => checkpoint.id === hoveredCheckpointId) ?? null;

  useEffect(() => {
    if (!mapRef.current || !routeGeometry || routeGeometry.coordinates.length === 0) {
      return;
    }

    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    for (const [lng, lat] of routeGeometry.coordinates) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }

    mapRef.current.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat]
      ],
      {
        padding: 80,
        duration: 1500
      }
    );
  }, [routeGeometry]);

  return (
    <div className="map-wrap">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        initialViewState={{ latitude: 47, longitude: -84.5, zoom: 5.2 }}
      >
        <NavigationControl position="top-right" />

        {routeGeometry && checkpoints.length > 1 && (
          <Source id="route-risk-segments" type="geojson" data={segmentCollection}>
            <Layer
              id="route-glow"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 14,
                'line-opacity': 0.15,
                'line-blur': 8
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round'
              }}
            />

            <Layer
              id="route-main"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 5,
                'line-opacity': 0.9
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round'
              }}
            />
          </Source>
        )}

        {checkpoints.map((checkpoint) => {
          const isHovered = hoveredCheckpointId === checkpoint.id;
          const isSelected = selectedCheckpointId === checkpoint.id;
          const riskHex = riskToHex(checkpoint.riskScore);
          const markerSize = checkpoint.riskScore >= 0.5 ? 16 : 10;

          return (
            <Marker
              key={checkpoint.id}
              longitude={checkpoint.lng}
              latitude={checkpoint.lat}
              anchor="center"
            >
              <button
                type="button"
                onClick={() => onCheckpointClick(checkpoint)}
                onMouseEnter={() => setHoveredCheckpointId(checkpoint.id)}
                onMouseLeave={() =>
                  setHoveredCheckpointId((current) =>
                    current === checkpoint.id ? null : current
                  )
                }
                aria-label={`Checkpoint at ${checkpoint.distanceKm.toFixed(0)} km`}
                style={{
                  width: markerSize,
                  height: markerSize,
                  borderRadius: '50%',
                  border: '2px solid #ffffff',
                  background: riskHex,
                  boxShadow: `0 0 12px 2px ${riskHex}`,
                  transform: `scale(${isHovered ? 1.3 : 1})`,
                  transition: 'transform 0.15s ease',
                  cursor: 'pointer',
                  padding: 0,
                  outline: isSelected ? '2px solid #ffffff' : 'none'
                }}
              />
            </Marker>
          );
        })}

        {hoveredCheckpoint && (
          <Popup
            longitude={hoveredCheckpoint.lng}
            latitude={hoveredCheckpoint.lat}
            closeButton={false}
            closeOnClick={false}
            offset={16}
            onClose={() => setHoveredCheckpointId(null)}
          >
            <div style={{ minWidth: 210, fontSize: 12, display: 'grid', gap: 4 }}>
              <strong>{hoveredCheckpoint.riskLabel}</strong>
              <div>Distance: {hoveredCheckpoint.distanceKm.toFixed(1)} km</div>
              <div>ETA: {hoveredCheckpoint.etaLocal}</div>
              <div>
                Temp: {hoveredCheckpoint.forecast?.temperature ?? '-'}C (feels like{' '}
                {hoveredCheckpoint.forecast?.apparentTemp ?? '-'}C)
              </div>
              <div>Snowfall: {hoveredCheckpoint.forecast?.snowfall ?? '-'} cm/h</div>
              <div>Visibility: {hoveredCheckpoint.forecast?.visibility ?? '-'} m</div>
              <div>Wind: {hoveredCheckpoint.forecast?.windSpeed ?? '-'} km/h</div>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
