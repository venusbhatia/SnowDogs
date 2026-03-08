import { Router } from 'express';

type Coordinate = [number, number];

type RouteRequestBody = {
  origin?: unknown;
  destination?: unknown;
};

type MapboxRoute = {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distance: number;
  duration: number;
};

type MapboxResponse = {
  routes?: MapboxRoute[];
  message?: string;
};

const router = Router();

function hasConfiguredMapboxToken(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/your_mapbox_token/i.test(value);
}

function haversineKm(origin: Coordinate, destination: Coordinate): number {
  const [originLng, originLat] = origin;
  const [destinationLng, destinationLat] = destination;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRadians(destinationLat - originLat);
  const dLng = toRadians(destinationLng - originLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(destinationLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildFallbackCoordinates(origin: Coordinate, destination: Coordinate): Coordinate[] {
  const [originLng, originLat] = origin;
  const [destinationLng, destinationLat] = destination;
  const lngDelta = destinationLng - originLng;
  const latDelta = destinationLat - originLat;
  const curveLng = latDelta * 0.18;
  const curveLat = -lngDelta * 0.12;

  return [
    origin,
    [originLng + lngDelta * 0.28 + curveLng, originLat + latDelta * 0.26 + curveLat],
    [originLng + lngDelta * 0.61 - curveLng * 0.7, originLat + latDelta * 0.62 - curveLat * 0.7],
    destination
  ];
}

function buildFallbackRoute(origin: Coordinate, destination: Coordinate) {
  const directDistanceKm = haversineKm(origin, destination);
  const simulatedRoadDistanceKm = Math.max(directDistanceKm * 1.12, directDistanceKm + 6);
  const durationHours = simulatedRoadDistanceKm / 88;

  return {
    geometry: {
      type: 'LineString' as const,
      coordinates: buildFallbackCoordinates(origin, destination)
    },
    distanceKm: simulatedRoadDistanceKm.toFixed(1),
    durationHrs: durationHours.toFixed(1),
    distanceM: Math.round(simulatedRoadDistanceKm * 1000),
    durationS: Math.round(durationHours * 3600),
    fallback: true,
    provider: 'demo'
  };
}

function isValidCoordinateArray(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

function validateLngLat(coord: Coordinate, name: 'origin' | 'destination'): string | null {
  const [lng, lat] = coord;

  if (lng < -180 || lng > 180) {
    return `${name} longitude must be between -180 and 180`;
  }

  if (lat < -90 || lat > 90) {
    return `${name} latitude must be between -90 and 90`;
  }

  return null;
}

router.post('/', async (req, res) => {
  try {
    const { origin, destination } = req.body as RouteRequestBody;

    if (!isValidCoordinateArray(origin)) {
      return res.status(400).json({
        error: 'Invalid origin. Expected [lng, lat] as an array of 2 numbers.'
      });
    }

    if (!isValidCoordinateArray(destination)) {
      return res.status(400).json({
        error: 'Invalid destination. Expected [lng, lat] as an array of 2 numbers.'
      });
    }

    const originError = validateLngLat(origin, 'origin');
    if (originError) {
      return res.status(400).json({ error: originError });
    }

    const destinationError = validateLngLat(destination, 'destination');
    if (destinationError) {
      return res.status(400).json({ error: destinationError });
    }

    const token = process.env.MAPBOX_TOKEN?.trim();
    if (!hasConfiguredMapboxToken(token)) {
      return res.json(buildFallbackRoute(origin, destination));
    }

    const [originLng, originLat] = origin;
    const [destLng, destLat] = destination;
    const mapboxUrl =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

    const mapboxRes = await fetch(mapboxUrl);
    const mapboxData = (await mapboxRes.json()) as MapboxResponse;

    if (!mapboxRes.ok) {
      if (mapboxRes.status === 401 || mapboxRes.status === 403) {
        return res.json(buildFallbackRoute(origin, destination));
      }

      return res.status(mapboxRes.status).json({
        error: mapboxData.message || 'Mapbox Directions API request failed'
      });
    }

    const route = mapboxData.routes?.[0];
    if (!route) {
      return res.status(404).json({ error: 'No route found' });
    }

    return res.json({
      geometry: route.geometry,
      distanceKm: (route.distance / 1000).toFixed(1),
      durationHrs: (route.duration / 3600).toFixed(1),
      distanceM: route.distance,
      durationS: route.duration
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch route';
    return res.status(500).json({ error: message });
  }
});

export default router;
