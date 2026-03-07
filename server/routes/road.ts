import { Router } from 'express';

const router = Router();

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const cache: Record<string, CacheEntry | undefined> = {};

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }

  return payload;
}

async function getCached(key: string, url: string): Promise<unknown> {
  const now = Date.now();
  const entry = cache[key];

  if (entry && entry.expiresAt > now) {
    return entry.payload;
  }

  const payload = await fetchJson(url);
  cache[key] = {
    payload,
    expiresAt: now + CACHE_TTL_MS
  };

  return payload;
}

router.get('/conditions', async (_req, res) => {
  try {
    const payload = await getCached(
      'conditions',
      'https://511on.ca/api/v2/get/roadconditions'
    );
    return res.json(payload);
  } catch {
    return res.status(502).json({ error: 'Failed to fetch road conditions from 511ON' });
  }
});

router.get('/cameras', async (_req, res) => {
  try {
    const payload = await getCached('cameras', 'https://511on.ca/api/v2/get/cameras');
    return res.json(payload);
  } catch {
    return res.status(502).json({ error: 'Failed to fetch cameras from 511ON' });
  }
});

router.get('/events', async (_req, res) => {
  try {
    const payload = await fetchJson('https://511on.ca/api/v2/get/event');
    return res.json(payload);
  } catch {
    return res.status(502).json({ error: 'Failed to fetch events from 511ON' });
  }
});

export default router;
