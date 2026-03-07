import cors from 'cors';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';

import cameraRouter from './routes/camera';
import roadRouter from './routes/road';
import routeRouter from './routes/route';
import voiceRouter from './routes/voice';
import weatherRouter from './routes/weather';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3001;

const REQUIRED_API_KEYS = ['MAPBOX_TOKEN', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY'] as const;

function logWithTimestamp(level: 'warn' | 'error', message: string, error?: unknown) {
  const timestamp = new Date().toISOString();

  if (level === 'warn') {
    console.warn(`[${timestamp}] WARN: ${message}`);
    return;
  }

  console.error(`[${timestamp}] ERROR: ${message}`);
  if (error) {
    console.error(error);
  }
}

for (const key of REQUIRED_API_KEYS) {
  if (!process.env[key]) {
    logWithTimestamp(
      'warn',
      `${key} is missing in environment. Related routes will fail gracefully until it is set.`
    );
  }
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/route', routeRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/road', roadRouter);
app.use('/api/camera', cameraRouter);
app.use('/api/voice', voiceRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'SnowDogs',
    timestamp: new Date().toISOString()
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  logWithTimestamp('error', message, err);
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] SnowDogs server listening on http://localhost:${port}`);
});
