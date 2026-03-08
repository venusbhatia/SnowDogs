import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Heatmap, Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';

import { colors, radius, spacing } from '../theme';
import type { EnrichedCheckpoint, RouteGeometry } from '../types';
import { riskHex } from '../utils/risk';
import SectionCard from './SectionCard';

type Props = {
  routeGeometry: RouteGeometry | null;
  checkpoints: EnrichedCheckpoint[];
  selectedCheckpointId: string | null;
  onCheckpointSelect: (checkpoint: EnrichedCheckpoint) => void;
};

function toLatLngs(routeGeometry: RouteGeometry | null): LatLng[] {
  return routeGeometry?.coordinates.map(([lng, lat]) => ({ longitude: lng, latitude: lat })) ?? [];
}

type PreviewPoint = {
  x: number;
  y: number;
};

type Projection = {
  project: (point: LatLng) => PreviewPoint;
};

type PreviewSegment = {
  key: string;
  left: number;
  top: number;
  width: number;
  angle: number;
};

type HeatPoint = {
  latitude: number;
  longitude: number;
  weight: number;
};

const PREVIEW_PADDING = 26;

function createProjection(points: LatLng[], width: number, height: number): Projection | null {
  if (points.length === 0 || width <= 0 || height <= 0) {
    return null;
  }

  const meanLatitudeRadians =
    (points.reduce((sum, point) => sum + point.latitude, 0) / Math.max(points.length, 1)) * (Math.PI / 180);
  const longitudeScale = Math.cos(meanLatitudeRadians) || 1;
  const cartesianPoints = points.map((point) => ({
    x: point.longitude * longitudeScale,
    y: point.latitude
  }));

  const xValues = cartesianPoints.map((point) => point.x);
  const yValues = cartesianPoints.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const spanX = Math.max(maxX - minX, 0.0001);
  const spanY = Math.max(maxY - minY, 0.0001);
  const drawableWidth = Math.max(width - PREVIEW_PADDING * 2, 1);
  const drawableHeight = Math.max(height - PREVIEW_PADDING * 2, 1);
  const scale = Math.min(drawableWidth / spanX, drawableHeight / spanY);
  const offsetX = PREVIEW_PADDING + (drawableWidth - spanX * scale) / 2;
  const offsetY = PREVIEW_PADDING + (drawableHeight - spanY * scale) / 2;

  return {
    project: (point: LatLng) => ({
      x: offsetX + (point.longitude * longitudeScale - minX) * scale,
      y: offsetY + (maxY - point.latitude) * scale
    })
  };
}

function buildPreviewSegments(points: PreviewPoint[]): PreviewSegment[] {
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;

    return {
      key: `segment-${index}`,
      left: (previous.x + point.x) / 2,
      top: (previous.y + point.y) / 2,
      width: Math.max(Math.sqrt(dx * dx + dy * dy), 2),
      angle: Math.atan2(dy, dx)
    };
  });
}

export default function RouteMap({ routeGeometry, checkpoints, selectedCheckpointId, onCheckpointSelect }: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 320, height: 280 });
  
  const [showSnowHeatmap, setShowSnowHeatmap] = useState(true);
  const routePoints = useMemo(() => toLatLngs(routeGeometry), [routeGeometry]);
  const hasAndroidMapsKey = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
  const canRenderMap = Platform.OS !== 'android' || hasAndroidMapsKey;
  const snowHeatPoints = useMemo<HeatPoint[]>(() => {
    return checkpoints
      .map((checkpoint) => {
        const snowfall = checkpoint.forecast?.snowfall ?? 0;
        const weight = Math.max(0, Math.min(1, snowfall / 3));

        if (weight <= 0) {
          return null;
        }

        return { latitude: checkpoint.lat, longitude: checkpoint.lng, weight };
      })
      .filter((point): point is HeatPoint => Boolean(point));
  }, [checkpoints]);
  const sectionSubtitle = canRenderMap
    ? 'The web map is now adapted to Expo with native markers and route overlays.'
    : 'Android renders a plotted route sketch with tappable checkpoint markers when native map tiles are unavailable.';
  const previewProjection = useMemo(
    () => createProjection(routePoints, previewSize.width, previewSize.height),
    [routePoints, previewSize.width, previewSize.height]
  );
  const previewRoutePoints = useMemo(
    () => (previewProjection ? routePoints.map((point) => previewProjection.project(point)) : []),
    [previewProjection, routePoints]
  );
  const previewSegments = useMemo(() => buildPreviewSegments(previewRoutePoints), [previewRoutePoints]);
  const previewCheckpoints = useMemo(
    () =>
      previewProjection
        ? checkpoints.map((checkpoint) => ({
            checkpoint,
            point: previewProjection.project({ latitude: checkpoint.lat, longitude: checkpoint.lng })
          }))
        : [],
    [checkpoints, previewProjection]
  );

  useEffect(() => {
    if (!canRenderMap || !mapRef.current || routePoints.length < 2) {
      return;
    }

    mapRef.current.fitToCoordinates(routePoints, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true
    });
  }, [routePoints]);

  return (
    <SectionCard
      eyebrow="Route Map"
      title="Mobile route view"
      subtitle={sectionSubtitle}
    >
      <View
        style={styles.mapFrame}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;

          if (
            Math.abs(width - previewSize.width) > 1 ||
            Math.abs(height - previewSize.height) > 1
          ) {
            setPreviewSize({ width, height });
          }
        }}
      >
        {routePoints.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Scan a route to render the map.</Text>
            <Text style={styles.emptyText}>Markers will reflect checkpoint severity as soon as the backend returns the forecast and road data.</Text>
          </View>
        ) : !canRenderMap ? (
          <View style={styles.previewCanvas}>
            <View style={styles.previewGlowPrimary} />
            <View style={styles.previewGlowSecondary} />

            {previewSegments.map((segment) => (
              <View
                key={segment.key}
                style={[
                  styles.previewSegment,
                  {
                    left: segment.left - segment.width / 2,
                    top: segment.top - 3,
                    width: segment.width,
                    transform: [{ rotate: `${segment.angle}rad` }]
                  }
                ]}
              />
            ))}

            {previewRoutePoints[0] ? (
              <View
                style={[
                  styles.endpointBadge,
                  styles.startBadge,
                  {
                    left: previewRoutePoints[0].x - 13,
                    top: previewRoutePoints[0].y - 13
                  }
                ]}
              >
                <Text style={styles.endpointBadgeText}>S</Text>
              </View>
            ) : null}

            {previewRoutePoints.at(-1) ? (
              <View
                style={[
                  styles.endpointBadge,
                  styles.finishBadge,
                  {
                    left: previewRoutePoints.at(-1)!.x - 13,
                    top: previewRoutePoints.at(-1)!.y - 13
                  }
                ]}
              >
                <Text style={styles.endpointBadgeText}>F</Text>
              </View>
            ) : null}

            {previewCheckpoints.map(({ checkpoint, point }) => {
              const selected = checkpoint.id === selectedCheckpointId;

              return (
                <Pressable
                  key={checkpoint.id}
                  style={({ pressed }) => [
                    styles.previewMarkerTapTarget,
                    {
                      left: point.x - 16,
                      top: point.y - 16
                    },
                    selected && styles.previewMarkerTapTargetSelected,
                    pressed && styles.previewMarkerTapTargetPressed
                  ]}
                  hitSlop={10}
                  onPress={() => onCheckpointSelect(checkpoint)}
                >
                  <View
                    style={[
                      styles.previewMarker,
                      { backgroundColor: riskHex(checkpoint.riskColor) },
                      selected && styles.previewMarkerSelected
                    ]}
                  />
                </Pressable>
              );
            })}

            <View style={styles.previewHeader}>
              <Text style={styles.previewEyebrow}>Android route sketch</Text>
              <Text style={styles.previewHeading}>Tap a checkpoint marker</Text>
              <Text style={styles.previewCaption}>
                Native map tiles are off in this build, so this plotted preview keeps the route usable for the demo.
              </Text>
            </View>

            <View style={styles.previewFooter}>
              <View style={styles.previewPill}>
                <Text style={styles.previewPillText}>{routePoints.length} route points</Text>
              </View>
              <View style={styles.previewPill}>
                <Text style={styles.previewPillText}>{checkpoints.length} checkpoints</Text>
              </View>
            </View>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
            initialRegion={{
              latitude: routePoints[0]?.latitude ?? 47,
              longitude: routePoints[0]?.longitude ?? -84.5,
              latitudeDelta: 8,
              longitudeDelta: 8
            }}
            showsCompass={false}
            showsScale={false}
            toolbarEnabled={false}
          >
            {Platform.OS === 'android' && showSnowHeatmap && snowHeatPoints.length > 0 ? (
              <Heatmap
                points={snowHeatPoints}
                radius={44}
                opacity={0.75}
                gradient={{
                  colors: [
                    'rgba(56, 189, 248, 0)',
                    'rgba(56, 189, 248, 0.65)',
                    'rgba(74, 222, 128, 0.75)',
                    'rgba(250, 204, 21, 0.85)',
                    'rgba(251, 113, 133, 0.95)'
                  ],
                  startPoints: [0, 0.18, 0.45, 0.7, 0.9],
                  colorMapSize: 256
                }}
              />
            ) : null}            <Polyline coordinates={routePoints} strokeColor={colors.accent} strokeWidth={5} />
            {checkpoints.map((checkpoint) => (
              <Marker
                key={checkpoint.id}
                coordinate={{ latitude: checkpoint.lat, longitude: checkpoint.lng }}
                pinColor={riskHex(checkpoint.riskColor)}
                opacity={selectedCheckpointId === checkpoint.id ? 1 : 0.88}
                onPress={() => onCheckpointSelect(checkpoint)}
              />
            ))}
          </MapView>
        )}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  mapFrame: {
    height: 280,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center'
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  previewCanvas: {
    flex: 1,
    backgroundColor: '#08111F'
  },
  previewGlowPrimary: {
    position: 'absolute',
    top: -30,
    right: -10,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(74, 158, 255, 0.18)'
  },
  previewGlowSecondary: {
    position: 'absolute',
    bottom: -60,
    left: -20,
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.12)'
  },
  previewSegment: {
    position: 'absolute',
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.9
  },
  endpointBadge: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white
  },
  startBadge: {
    backgroundColor: '#155EEF'
  },
  finishBadge: {
    backgroundColor: '#16A34A'
  },
  endpointBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800'
  },
  previewMarkerTapTarget: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewMarkerTapTargetSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  previewMarkerTapTargetPressed: {
    opacity: 0.88
  },
  previewMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#08111F'
  },
  previewMarkerSelected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderColor: colors.white
  },
  previewHeader: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    gap: 4
  },
  previewEyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  previewHeading: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800'
  },
  previewCaption: {
    color: 'rgba(232, 241, 255, 0.82)',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 250
  },
  previewFooter: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm
  },
  previewPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: 'rgba(8, 17, 31, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)'
  },
  previewPillText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700'
  }
});










