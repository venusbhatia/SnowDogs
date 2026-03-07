import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, NavigationControl, Popup, Source, type MapRef } from 'react-map-gl';

import type { EnrichedCheckpoint, RouteGeometry } from '../types';

type Props = {
  routeGeo: RouteGeometry | null;
  checkpoints: EnrichedCheckpoint[];
  selectedCheckpointId: string | null;
  onSelectCheckpoint: (checkpoint: EnrichedCheckpoint) => void;
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

function splitSegments(route: RouteGeometry, checkpoints: EnrichedCheckpoint[]) {
  const coords = route.coordinates;
  if (coords.length < 2 || checkpoints.length < 2) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  const lastIndex = coords.length - 1;
  const maxDistance = checkpoints[checkpoints.length - 1]?.distanceKm || 1;

  const features = checkpoints.slice(0, -1).map((cp, index) => {
    const next = checkpoints[index + 1];
    const startRatio = cp.distanceKm / maxDistance;
    const endRatio = next.distanceKm / maxDistance;
    const startIdx = Math.floor(startRatio * lastIndex);
    const endIdx = Math.max(startIdx + 1, Math.floor(endRatio * lastIndex));
    const segCoords = coords.slice(startIdx, endIdx + 1);

    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: segCoords.length >= 2 ? segCoords : [coords[startIdx], coords[endIdx]]
      },
      properties: {
        id: `${cp.id}-${next.id}`,
        color: colorHex(next.riskColor)
      }
    };
  });

  return {
    type: 'FeatureCollection',
    features
  };
}

export default function MapView({ routeGeo, checkpoints, selectedCheckpointId, onSelectCheckpoint }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mapRef = useRef<MapRef>(null);

  const token = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.MAPBOX_TOKEN || '';

  const segmentGeoJson = useMemo(() => {
    if (!routeGeo) {
      return { type: 'FeatureCollection', features: [] };
    }
    return splitSegments(routeGeo, checkpoints);
  }, [routeGeo, checkpoints]);

  const hoveredCheckpoint = checkpoints.find((cp) => cp.id === hoveredId) ?? null;

  useEffect(() => {
    if (!mapRef.current || !routeGeo || routeGeo.coordinates.length === 0) {
      return;
    }

    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    for (const [lng, lat] of routeGeo.coordinates) {
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
      { padding: 80, duration: 800 }
    );
  }, [routeGeo]);

  return (
    <div className="map-wrap">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: -84.5, latitude: 47, zoom: 4.7 }}
        mapboxAccessToken={token}
        mapStyle="mapbox://styles/mapbox/dark-v11"
      >
        <NavigationControl position="top-right" />

        {routeGeo && checkpoints.length > 1 && (
          <Source id="route-segments" type="geojson" data={segmentGeoJson as never}>
            <Layer
              id="route-segments-layer"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 5,
                'line-opacity': 0.9
              }}
            />
          </Source>
        )}

        {checkpoints.map((cp) => {
          const isHovered = hoveredId === cp.id;
          const isSelected = selectedCheckpointId === cp.id;

          return (
            <Marker key={cp.id} longitude={cp.lng} latitude={cp.lat} anchor="center">
              <button
                type="button"
                className="marker-dot"
                style={{
                  backgroundColor: colorHex(cp.riskColor),
                  transform: isHovered || isSelected ? 'scale(1.5)' : 'scale(1)',
                  boxShadow: isSelected ? '0 0 0 2px #fff' : 'none'
                }}
                onMouseEnter={() => setHoveredId(cp.id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === cp.id ? null : prev))}
                onClick={() => onSelectCheckpoint(cp)}
                aria-label={`Checkpoint ${cp.distanceKm.toFixed(0)} km`}
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
            offset={18}
            onClose={() => setHoveredId(null)}
          >
            <div>
              <strong>{hoveredCheckpoint.riskLabel} Risk</strong>
              <div>{hoveredCheckpoint.distanceKm.toFixed(0)} km marker</div>
              <div>ETA: {hoveredCheckpoint.etaLocal}</div>
              <div>Temp: {hoveredCheckpoint.forecast?.temperature ?? '-'}C</div>
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
