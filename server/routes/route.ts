import { Router } from 'express';

type Coord = [number, number];

type RouteRequestBody = {
  origin?: Coord;
  destination?: Coord;
};

const router = Router();

function isCoord(value: unknown): value is Coord {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

router.post('/', async (req, res) => {
  const { origin, destination } = req.body as RouteRequestBody;

  if (!isCoord(origin) || !isCoord(destination)) {
    return res.status(400).json({
      error: 'Invalid payload. Expected { origin: [lng, lat], destination: [lng, lat] }'
    });
  }

  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'MAPBOX_TOKEN is not configured' });
  }

  const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);
    const data = (await response.json()) as {
      routes?: Array<{
        geometry: unknown;
        distance: number;
        duration: number;
      }>;
      message?: string;
    };

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Mapbox Directions API request failed'
      });
    }

    const bestRoute = data.routes?.[0];
    if (!bestRoute) {
      return res.status(404).json({ error: 'No route found' });
    }

    return res.json({
      geometry: bestRoute.geometry,
      distanceKm: bestRoute.distance / 1000,
      durationHrs: bestRoute.duration / 3600
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch route from Mapbox' });
  }
});

export default router;
