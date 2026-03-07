# SnowDogs Mobile

This Expo app adapts the uploaded SnowDogs web experience into a phone-first hackathon build.

## Features

- route scan between preset Ontario cities
- checkpoint sampling every 50 km
- weather and road risk scoring
- Ontario 511 nearby camera support
- Gemini-powered camera analysis and advisories through the existing server
- spoken advisory playback with Expo speech

## Setup

1. Start the backend from the repo root:
   - `npm run server`
2. Create `mobile/.env` from `mobile/.env.example`
3. Set `EXPO_PUBLIC_API_BASE_URL`
   - Android emulator: `http://10.0.2.2:3001`
   - iOS simulator: `http://localhost:3001`
   - Physical device: use your computer's LAN IP
4. Install dependencies in `mobile/`
5. Start Expo with `npm run start`

## Android Studio Emulator

1. Start an Android Virtual Device from Android Studio.
2. Use a Google Play image and install Expo Go on the emulator if needed.
3. From the repo root, run:
   - `npm run server`
   - `npm run mobile:android:studio`

If Expo cannot find the emulator, add Android SDK `platform-tools` to your `PATH` so `adb` is available in the terminal.

## Notes

- The Expo app uses native maps instead of the web Mapbox client.
- Spoken alerts use local Expo speech so the mobile app does not depend on browser audio playback.
- Placeholder `MAPBOX_TOKEN` and `GEMINI_API_KEY` values now trigger demo fallbacks so the Android emulator flow is still testable.
- Add real `MAPBOX_TOKEN` and `GEMINI_API_KEY` values in `server/.env` for live route and Gemini outputs.
