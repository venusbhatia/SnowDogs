import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

import cameraRouter from './routes/camera';
import roadRouter from './routes/road';
import routeRouter from './routes/route';
import voiceRouter from './routes/voice';
import weatherRouter from './routes/weather';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/route', routeRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/road', roadRouter);
app.use('/api/camera', cameraRouter);
app.use('/api/voice', voiceRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: 'SnowDogs' });
});

app.listen(port, () => {
  console.log(`SnowDogs server listening on http://localhost:${port}`);
});
