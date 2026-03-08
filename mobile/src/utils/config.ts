import { Platform } from 'react-native';

const defaultBaseUrl =
  Platform.select({
    android: 'http://10.0.2.2:3001',
    ios: 'http://localhost:3001',
    default: 'http://localhost:3001'
  }) ?? 'http://localhost:3001';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || defaultBaseUrl).replace(
  /\/+$/,
  ''
);

export function toApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
