import { CloudinaryAnalysis } from '@cloudinary/analysis';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';

export type EnhanceResult = {
  originalUrl: string;
  enhancedUrl: string;
  publicId: string;
  width: number;
  height: number;
};

export type VisionResult = {
  road_surface: string;
  visibility: string;
  snow_coverage_percent: number;
  hazards: string[];
  raw_responses: Array<{ prompt: string; value: string }>;
};

export type CameraProcessResult = {
  originalUrl: string;
  enhancedUrl: string;
  publicId: string;
  vision: VisionResult;
};

export type RouteVideoResult = {
  frameUrls: string[];
  videoAvailable: boolean;
};

type CacheEntry<T> = {
  expiresAt: number;
  data: T;
};

const CACHE_TTL_MS = 120_000;

const enhanceCache = new Map<string, CacheEntry<EnhanceResult>>();
const visionCache = new Map<string, CacheEntry<VisionResult>>();

let initialized = false;
let cloudNameCache: string | null = null;
let analysisClient: CloudinaryAnalysis | null = null;

function logCloudinaryError(context: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${timestamp}] Cloudinary ${context} error: ${message}`);
}

function getCloudinaryEnv(): {
  cloudName: string | null;
  apiKey: string | null;
  apiSecret: string | null;
} {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || null;
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || null;
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || null;

  return { cloudName, apiKey, apiSecret };
}

function ensureInitialized(): boolean {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  if (!cloudName || !apiKey || !apiSecret) {
    return false;
  }

  if (initialized && cloudNameCache === cloudName && analysisClient) {
    return true;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });

  analysisClient = new CloudinaryAnalysis({
    security: {
      cloudinaryAuth: {
        apiKey,
        apiSecret
      }
    },
    serverURL: `https://api.cloudinary.com/v2/analysis/${cloudName}`
  });

  cloudNameCache = cloudName;
  initialized = true;
  return true;
}

function sanitizeCameraId(cameraId: string): string {
  return cameraId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'camera';
}

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const cached = map.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt < Date.now()) {
    map.delete(key);
    return null;
  }
  return cached.data;
}

function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, data: T): void {
  map.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function parseSnowPercent(value: string): number {
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return 0;
  }
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function parseHazards(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && part.toLowerCase() !== 'none');
}

function riskColorHex(riskLabel: string): string {
  const normalized = riskLabel.toLowerCase();
  if (normalized.includes('danger')) {
    return 'ef4444';
  }
  if (normalized.includes('hazard')) {
    return 'f97316';
  }
  if (normalized.includes('caution') || normalized.includes('moderate')) {
    return 'eab308';
  }
  return '22c55e';
}

function extractVisionResponseValues(response: unknown, prompts: string[]): Array<{ prompt: string; value: string }> {
  const payload = response as {
    data?: { analysis?: { responses?: Array<{ value?: string | null }> } };
  };

  const values = payload?.data?.analysis?.responses ?? [];
  return prompts.map((prompt, index) => ({
    prompt,
    value: typeof values[index]?.value === 'string' ? values[index]?.value || '' : ''
  }));
}

export async function uploadAndEnhance(
  imageBuffer: Buffer,
  cameraId: string
): Promise<EnhanceResult | null> {
  try {
    if (!ensureInitialized()) {
      return null;
    }

    const cacheKey = sanitizeCameraId(cameraId);
    const cached = getCached(enhanceCache, cacheKey);
    if (cached) {
      return cached;
    }

    const publicId = `cam-${cacheKey}-${Date.now()}`;

    const uploadResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'snowdogs-cameras',
          public_id: publicId,
          resource_type: 'image',
          eager: [
            {
              raw_transformation:
                'e_auto_contrast/e_auto_brightness/e_sharpen:80/q_auto:best/f_webp'
            }
          ],
          eager_async: false
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error('Cloudinary upload returned no result'));
            return;
          }
          resolve(result as Record<string, unknown>);
        }
      );

      Readable.from(imageBuffer).pipe(uploadStream);
    });

    const originalUrl =
      typeof uploadResult.secure_url === 'string' ? uploadResult.secure_url : null;
    const eagerList = Array.isArray(uploadResult.eager)
      ? (uploadResult.eager as Array<Record<string, unknown>>)
      : [];
    const enhancedUrl =
      (typeof eagerList[0]?.secure_url === 'string' ? eagerList[0]?.secure_url : null) || originalUrl;
    const uploadedPublicId =
      typeof uploadResult.public_id === 'string' ? uploadResult.public_id : null;
    const width = typeof uploadResult.width === 'number' ? uploadResult.width : 0;
    const height = typeof uploadResult.height === 'number' ? uploadResult.height : 0;

    if (!originalUrl || !enhancedUrl || !uploadedPublicId) {
      return null;
    }

    const result: EnhanceResult = {
      originalUrl,
      enhancedUrl,
      publicId: uploadedPublicId,
      width,
      height
    };

    setCached(enhanceCache, cacheKey, result);
    return result;
  } catch (error) {
    logCloudinaryError('uploadAndEnhance', error);
    return null;
  }
}

export async function analyzeWithVision(imageUri: string): Promise<VisionResult | null> {
  try {
    if (!ensureInitialized() || !analysisClient) {
      return null;
    }

    const cacheKey = imageUri.trim();
    const cached = getCached(visionCache, cacheKey);
    if (cached) {
      return cached;
    }

    const prompts = [
      'Describe the road surface: bare and dry, wet, partly snow covered, fully snow covered, or ice covered. Reply with only the condition.',
      'Rate visibility: excellent, good, fair, poor, or very poor. Reply with only the rating.',
      'What percentage of the visible road is covered by snow or ice? Reply with only a number from 0 to 100.',
      'List hazards visible: vehicles in ditch, overturned trucks, snow drifts, black ice, reduced lane markings, or none. Reply as a comma separated list.'
    ];

    const response = await analysisClient.analyze.aiVisionGeneral({
      source: { uri: cacheKey },
      prompts
    });

    const rawResponses = extractVisionResponseValues(response, prompts);
    const roadSurface = rawResponses[0]?.value?.trim().toLowerCase() || 'unknown';
    const visibility = rawResponses[1]?.value?.trim().toLowerCase() || 'unknown';
    const snowCoveragePercent = parseSnowPercent(rawResponses[2]?.value || '');
    const hazards = parseHazards(rawResponses[3]?.value || '');

    const vision: VisionResult = {
      road_surface: roadSurface,
      visibility,
      snow_coverage_percent: snowCoveragePercent,
      hazards,
      raw_responses: rawResponses
    };

    setCached(visionCache, cacheKey, vision);
    return vision;
  } catch (error) {
    logCloudinaryError('analyzeWithVision', error);
    return null;
  }
}

export async function processCamera(
  imageBuffer: Buffer,
  cameraId: string
): Promise<CameraProcessResult | null> {
  try {
    if (!ensureInitialized()) {
      return null;
    }

    const enhanced = await uploadAndEnhance(imageBuffer, cameraId);
    if (!enhanced) {
      return null;
    }

    const vision = await analyzeWithVision(enhanced.enhancedUrl);
    if (!vision) {
      return null;
    }

    return {
      originalUrl: enhanced.originalUrl,
      enhancedUrl: enhanced.enhancedUrl,
      publicId: enhanced.publicId,
      vision
    };
  } catch (error) {
    logCloudinaryError('processCamera', error);
    return null;
  }
}

export async function generateRouteVideo(
  cameraImages: Array<{ publicId: string; label: string; riskLabel: string }>
): Promise<RouteVideoResult | null> {
  try {
    if (!ensureInitialized() || !cloudNameCache) {
      return null;
    }

    if (!Array.isArray(cameraImages) || cameraImages.length === 0) {
      return { frameUrls: [], videoAvailable: false };
    }

    const frameUrls = cameraImages
      .filter((image) => typeof image.publicId === 'string' && image.publicId.trim() !== '')
      .map((image) => {
        const safeLabel = encodeURIComponent(`${image.label} | ${image.riskLabel}`);
        const color = riskColorHex(image.riskLabel);
        const transformations = [
          `l_text:Arial_24_bold:${safeLabel}`,
          `co_rgb:ffffff`,
          `b_rgb:${color}`,
          `g_south`,
          `y_20`,
          `fl_layer_apply`
        ].join(',');

        return `https://res.cloudinary.com/${cloudNameCache}/image/upload/${transformations}/${image.publicId}.webp`;
      });

    return {
      frameUrls,
      videoAvailable: frameUrls.length > 0
    };
  } catch (error) {
    logCloudinaryError('generateRouteVideo', error);
    return null;
  }
}
