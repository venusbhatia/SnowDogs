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

- React
- TypeScript
- Mapbox
- Gemini 2.5 Flash with function calling
- ElevenLabs
- Auth0
- Open-Meteo
- Ontario 511 API
- Backboard.io

## Monorepo Structure

- `client/`: React + Vite TypeScript frontend
- `server/`: Express + TypeScript backend routes and agent orchestration
- root scripts: concurrent local development for client and server
