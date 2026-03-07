import { randomUUID } from 'node:crypto';
import { Router } from 'express';

export interface Report {
  id: string;
  text: string;
  source: 'app' | 'social_media';
  timestamp: string;
  processed: boolean;
}

type SubmitBody = {
  text?: unknown;
  source?: unknown;
};

const router = Router();

const reports: Report[] = [
  {
    id: randomUUID(),
    text: 'Starting my way from Toronto to Nipigon. Any advice 11 or 17 now? U know that both of them are close now. Google maps shows 8 hours to Cochrain and 7 ours to Sault St Marie.',
    source: 'social_media',
    timestamp: '2026-03-07T08:10:00-05:00',
    processed: false
  },
  {
    id: randomUUID(),
    text: 'Closed form Cochrane to nipigeon both ways',
    source: 'social_media',
    timestamp: '2026-03-07T08:35:00-05:00',
    processed: false
  },
  {
    id: randomUUID(),
    text: 'Neither, roads conditions are terrible and many roads closure on both. Stay in Toronto for a few days.',
    source: 'social_media',
    timestamp: '2026-03-07T09:00:00-05:00',
    processed: false
  },
  {
    id: randomUUID(),
    text: 'Expect a flash freeze as the sun goes down if you travel the lakeside.',
    source: 'social_media',
    timestamp: '2026-03-07T09:15:00-05:00',
    processed: false
  },
  {
    id: randomUUID(),
    text: 'East of nipigon 11 — truck overturned, road blocked',
    source: 'social_media',
    timestamp: '2026-03-07T09:45:00-05:00',
    processed: false
  },
  {
    id: randomUUID(),
    text: 'North West Region OPP: Multiple road closures due to severe weather, poor visibility, and deteriorating road conditions. ROADS CURRENTLY CLOSED: Hwy 11 Nipigon to Geraldton. Hwy 11/17 Flying J to Nipigon. REOPENED: Hwy 527 Thunder Bay to Armstrong. Motorists urged to avoid travel unless absolutely necessary.',
    source: 'social_media',
    timestamp: '2026-03-07T10:10:00-05:00',
    processed: false
  }
];

router.get('/', (_req, res) => {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

  const recent = reports
    .filter((report) => Date.parse(report.timestamp) >= cutoffMs)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return res.json({ reports: recent });
});

router.post('/submit', (req, res) => {
  const { text, source } = req.body as SubmitBody;

  if (typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'Invalid payload. text must be a non-empty string.' });
  }

  const normalizedSource: 'app' | 'social_media' =
    source === 'social_media' ? 'social_media' : 'app';

  const report: Report = {
    id: randomUUID(),
    text: text.trim(),
    source: normalizedSource,
    timestamp: new Date().toISOString(),
    processed: false
  };

  reports.push(report);
  return res.status(201).json(report);
});

export default router;
