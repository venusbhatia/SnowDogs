import { Router } from 'express';
import { Readable } from 'node:stream';

type SpeakRequestBody = {
  text?: string;
};

const router = Router();

router.post('/speak', async (req, res) => {
  const { text } = req.body as SpeakRequestBody;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Invalid payload. Expected { text: string }' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY is not configured' });
  }

  try {
    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75
          }
        })
      }
    );

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      return res.status(response.status || 502).json({
        error: errorText || 'Failed to generate speech from ElevenLabs'
      });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');

    Readable.fromWeb(response.body as never).pipe(res);
  } catch {
    return res.status(500).json({ error: 'Failed to stream TTS audio' });
  }
});

export default router;
