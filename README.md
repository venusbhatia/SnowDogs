# SnowDogs

SnowDogs is a winter route intelligence project with three runnable surfaces:

- `server/`: Express API for routing, weather, road conditions, camera analysis, and voice alerts
- `client/`: Vite + React desktop web app
- `mobile/`: Expo React Native app for Android and iOS

## Prerequisites

- Node.js 20+
- npm 10+
- Expo Go on a device or an Android/iOS simulator for `mobile/`

## Environment

Create these env files before running the app stack:

- `server/.env`
- `client/.env`
- `mobile/.env`

Example values:

```dotenv
# server/.env
PORT=3001
MAPBOX_TOKEN=your_mapbox_token
GEMINI_API_KEY=your_gemini_api_key
ELEVENLABS_API_KEY=fallback
```

```dotenv
# client/.env
VITE_MAPBOX_TOKEN=your_mapbox_token
```

```dotenv
# mobile/.env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001
```

Notes:

- Use `http://localhost:3001` for iOS Simulator.
- Use your machine's LAN IP for a physical device.
- `ELEVENLABS_API_KEY=fallback` keeps the voice endpoint in browser-fallback mode if you do not want ElevenLabs enabled.

## Install

From the repo root:

```bash
npm run install:all
```

## Run The Web App

Start the API:

```bash
npm run server
```

In a second terminal, start the web client:

```bash
npm run client
```

The Vite app runs on [http://localhost:5173](http://localhost:5173) and proxies `/api` to the backend on port `3001`.

## Run The Mobile App

Start the backend first:

```bash
npm run server
```

Then start Expo:

```bash
npm run mobile
```

Useful shortcuts:

```bash
npm run mobile:android
npm run mobile:android:studio
npm run mobile:ios
npm run mobile:web
npm run dev:android
```

## Android Studio Testing

1. Open Android Studio and start an Android Virtual Device.
2. Use a Google Play emulator image and install Expo Go if the emulator does not already have it.
3. Keep `mobile/.env` set to:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001
```

4. Start the full Android test loop from the repo root:

```bash
npm run dev:android
```

If you prefer two terminals, run `npm run server` in one terminal and `npm run mobile:android:studio` in the other.

Notes:

- `adb` from the Android SDK must be on your `PATH` for Expo to open the emulator automatically.
- The repo now falls back to demo route/advisory responses when `MAPBOX_TOKEN` or `GEMINI_API_KEY` are still placeholders, so the app remains testable in the emulator.
- Add real API keys in `server/.env` to replace the demo fallbacks with live route and Gemini results.
```

## Verification

Available local checks:

```bash
npm run build:client
npm run typecheck:mobile
```
