import { Router } from 'express';
import { Readable } from 'node:stream';

type SpeakBody = {
  text?: unknown;
};

const router = Router();

router.post('/speak', async (req, res) => {
  const { text } = req.body as SpeakBody;

  const rawApiKey = process.env.ELEVENLABS_API_KEY;
  const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';

  if (!apiKey || apiKey === 'fallback') {
    return res.json({ fallback: true, text: req.body.text });
  }

  if (typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'Invalid payload. text must be a non-empty string.' });
  }

  if (text.length > 500) {
    return res.status(400).json({ error: 'Invalid payload. text must be under 500 characters.' });
  }

  try {
    const elevenResponse = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75
          },
          output_format: 'mp3_22050_32'
        })
      }
    );

    if (!elevenResponse.ok || !elevenResponse.body) {
      // ElevenLabs rejected — fall back to browser TTS instead of showing an error
      return res.json({ fallback: true, text });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    Readable.fromWeb(elevenResponse.body as never).pipe(res);
  } catch {
    // Network failure — fall back to browser TTS
    return res.json({ fallback: true, text });
  }
});

export default router;
