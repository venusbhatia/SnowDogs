import { Router } from 'express';

const router = Router();
const TTL_MS = 60_000;
const UNAVAILABLE_ERROR = 'Ontario 511 is currently unreachable';

class ApiCache<T> {
  private cachedData: T | null = null;
  private lastFetchedAt: number | null = null;
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get lastFetchTimestamp(): number | null {
    return this.lastFetchedAt;
  }

  hasCache(): boolean {
    return this.cachedData !== null;
  }

  getCached(): T | null {
    return this.cachedData;
  }

  async get(fetcher: () => Promise<T>): Promise<{ data: T; source: 'cache' | 'live' }> {
    const now = Date.now();

    if (this.cachedData !== null && this.lastFetchedAt !== null && now - this.lastFetchedAt < this.ttlMs) {
      return { data: this.cachedData, source: 'cache' };
    }

    const fresh = await fetcher();
    this.cachedData = fresh;
    this.lastFetchedAt = Date.now();
    return { data: fresh, source: 'live' };
  }
}

const conditionsCache = new ApiCache<unknown[]>(TTL_MS);
const camerasCache = new ApiCache<unknown[]>(TTL_MS);
const cameraImageCache = new Map<string, { expiresAt: number; imageUrl: string | null }>();

function logRoadError(endpoint: string, error: unknown) {
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${timestamp}] 511 ${endpoint} error: ${message}`);
}

async function fetch511(url: string): Promise<unknown[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`511 returned status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (Array.isArray(payload)) {
    return payload;
  }

  return [];
}

async function getWithFallback(
  endpoint: string,
  cache: ApiCache<unknown[]> | null,
  fetcher: () => Promise<unknown[]>
): Promise<{ data: unknown[]; source: 'cache' | 'live' | 'unavailable'; error?: string }> {
  try {
    if (!cache) {
      const data = await fetcher();
      return { data, source: 'live' };
    }

    const result = await cache.get(fetcher);
    return { data: result.data, source: result.source };
  } catch (error) {
    logRoadError(endpoint, error);

    if (cache?.hasCache()) {
      return { data: cache.getCached() ?? [], source: 'cache' };
    }

    return { data: [], source: 'unavailable', error: UNAVAILABLE_ERROR };
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getCameraCoordinates(camera: unknown): { lat: number; lng: number } | null {
  if (!camera || typeof camera !== 'object') {
    return null;
  }

  const record = camera as Record<string, unknown>;
  const lat =
    parseNumber(record.lat) ??
    parseNumber(record.latitude) ??
    parseNumber(record.Latitude) ??
    parseNumber(record.Lat);
  const lng =
    parseNumber(record.lng) ??
    parseNumber(record.lon) ??
    parseNumber(record.long) ??
    parseNumber(record.longitude) ??
    parseNumber(record.Longitude) ??
    parseNumber(record.Lng);

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toAbsoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractImageUrlFromHtml(html: string, pageUrl: string): string | null {
  const ogImageMatch = html.match(
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  if (ogImageMatch?.[1]) {
    return toAbsoluteUrl(decodeHtmlEntities(ogImageMatch[1]), pageUrl);
  }

  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+\.(?:jpe?g)(?:\?[^"']*)?)["'][^>]*>/gi);
  for (const match of imgMatches) {
    if (match?.[1]) {
      return toAbsoluteUrl(decodeHtmlEntities(match[1]), pageUrl);
    }
  }

  return null;
}

router.get('/conditions', async (_req, res) => {
  const result = await getWithFallback(
    'conditions',
    conditionsCache,
    async () => fetch511('https://511on.ca/api/v2/get/roadconditions')
  );

  return res.json(result);
});

router.get('/cameras', async (_req, res) => {
  const result = await getWithFallback(
    'cameras',
    camerasCache,
    async () => fetch511('https://511on.ca/api/v2/get/cameras')
  );

  return res.json(result);
});

router.get('/events', async (_req, res) => {
  const result = await getWithFallback(
    'events',
    null,
    async () => fetch511('https://511on.ca/api/v2/get/event')
  );

  return res.json(result);
});

router.get('/cameras/near', async (req, res) => {
  const lat = parseNumber(req.query.lat);
  const lng = parseNumber(req.query.lng);
  const radiusKm = parseNumber(req.query.radius) ?? 20;

  if (lat === null || lng === null) {
    return res.status(400).json({
      error: 'lat and lng query parameters are required numbers'
    });
  }

  if (radiusKm <= 0) {
    return res.status(400).json({
      error: 'radius must be a positive number'
    });
  }

  const result = await getWithFallback(
    'cameras/near',
    camerasCache,
    async () => fetch511('https://511on.ca/api/v2/get/cameras')
  );

  if (result.source === 'unavailable') {
    return res.json(result);
  }

  const filtered = result.data.filter((camera) => {
    const coords = getCameraCoordinates(camera);
    if (!coords) {
      return false;
    }

    return haversineKm(lat, lng, coords.lat, coords.lng) <= radiusKm;
  });

  return res.json({
    data: filtered,
    source: result.source,
    radiusKm
  });
});

router.get('/camera-image/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ imageUrl: null, error: 'Camera ID is required' });
  }

  const cached = cameraImageCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.imageUrl) {
      return res.json({ imageUrl: cached.imageUrl });
    }
    return res.json({ imageUrl: null, error: 'Could not resolve image URL' });
  }

  const viewerUrl = `https://511on.ca/map/Cctv/${encodeURIComponent(id)}`;

  try {
    const pageResponse = await fetch(viewerUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });

    if (pageResponse.ok) {
      const contentType = (pageResponse.headers.get('content-type') || '').toLowerCase();

      if (contentType.startsWith('image/')) {
        const imageUrl = pageResponse.url || viewerUrl;
        cameraImageCache.set(id, { imageUrl, expiresAt: Date.now() + TTL_MS });
        return res.json({ imageUrl });
      }

      const html = await pageResponse.text();
      const parsedImageUrl = extractImageUrlFromHtml(html, viewerUrl);
      if (parsedImageUrl) {
        cameraImageCache.set(id, { imageUrl: parsedImageUrl, expiresAt: Date.now() + TTL_MS });
        return res.json({ imageUrl: parsedImageUrl });
      }
    }
  } catch (error) {
    logRoadError('camera-image/page', error);
  }

  try {
    const imageFallback = await fetch(viewerUrl, {
      headers: { Accept: 'image/*,*/*;q=0.8' }
    });

    const contentType = (imageFallback.headers.get('content-type') || '').toLowerCase();
    if (imageFallback.ok && contentType.startsWith('image/')) {
      const imageUrl = imageFallback.url || viewerUrl;
      cameraImageCache.set(id, { imageUrl, expiresAt: Date.now() + TTL_MS });
      return res.json({ imageUrl });
    }
  } catch (error) {
    logRoadError('camera-image/fallback', error);
  }

  cameraImageCache.set(id, { imageUrl: null, expiresAt: Date.now() + TTL_MS });
  return res.json({ imageUrl: null, error: 'Could not resolve image URL' });
});

router.get('/camera-proxy/:viewId', async (req, res) => {
  const viewId = String(req.params.viewId || '').trim();
  if (!viewId) {
    return res.status(400).json({ error: 'viewId is required' });
  }

  const viewerUrl = `https://511on.ca/map/Cctv/${encodeURIComponent(viewId)}`;

  try {
    const upstream = await fetch(viewerUrl, {
      headers: {
        Accept: 'image/*,text/html,*/*;q=0.8'
      }
    });

    if (!upstream.ok) {
      logRoadError('camera-proxy/upstream', `status ${upstream.status} for viewId ${viewId}`);
      return res.status(502).json({ imageUrl: null, error: 'Could not resolve image URL' });
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) {
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(bytes);
    }

    const html = await upstream.text();
    const parsedImageUrl = extractImageUrlFromHtml(html, viewerUrl);
    if (parsedImageUrl) {
      return res.redirect(parsedImageUrl);
    }

    return res.json({ imageUrl: null, error: 'Could not resolve image URL' });
  } catch (error) {
    logRoadError('camera-proxy', error);
    return res.status(500).json({ imageUrl: null, error: 'Could not resolve image URL' });
  }
});

export default router;
