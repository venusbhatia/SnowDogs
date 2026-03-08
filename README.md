# SnowDogs

Real-time winter road intelligence powered by an AI agent that fuses government data, weather forecasts, highway camera analysis, and crowdsourced driver reports from social media.

## What SnowDogs Does

SnowDogs helps Canadian drivers plan safer winter trips by combining:

- official Ontario 511 road conditions and incidents
- Open-Meteo weather forecasts and current conditions
- highway camera retrieval and AI image interpretation
- crowdsourced reports submitted from the app and social channels
- route-level risk scoring and checkpoint-by-checkpoint advisories
- voice safety briefings for hands-free consumption

## Agentic Architecture

SnowDogs uses an agentic backend architecture centered on Gemini 2.5 Flash function calling.

- The AI agent receives route checkpoints, crowd reports, and route context.
- It autonomously decides which tools to call (geocoding, official road condition lookup, weather fetches, credibility assessment).
- It iterates through multi-turn tool calls, reconciles conflicting sources, and outputs a structured route briefing with actionable risk segments.

## Technology Stack

- React + Vite (web) and Expo / React Native (mobile)
- TypeScript end-to-end
- Mapbox GL JS (web) and react-native-maps (mobile)
- Gemini 2.5 Flash with multi-turn function calling
- Cloudinary AI Vision for dual-AI camera analysis
- ElevenLabs Flash v2.5 voice alerts with browser TTS fallback
- Auth0 social login
- Open-Meteo GEM HRDPS 2.5 km weather model
- Ontario 511 REST API for road conditions, cameras, and events
- Backboard.io persistent corridor memory

## Monorepo Structure

- `client/`: React + Vite TypeScript frontend (web dashboard)
- `server/`: Express + TypeScript backend — routes, agent orchestration, risk scoring
- `mobile/`: Expo / React Native app with full route scanning and camera analysis
- Root scripts: concurrent local development (`npm run dev`)
