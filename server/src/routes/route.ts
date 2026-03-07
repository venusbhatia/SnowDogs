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

    const token = process.env.MAPBOX_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'MAPBOX_TOKEN is not configured' });
    }

    const [originLng, originLat] = origin;
    const [destLng, destLat] = destination;
    const mapboxUrl =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

    const mapboxRes = await fetch(mapboxUrl);
    const mapboxData = (await mapboxRes.json()) as MapboxResponse;

    if (!mapboxRes.ok) {
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
