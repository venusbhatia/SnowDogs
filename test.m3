flowchart LR
  %% ===== Clients =====
  U[Driver / User]

  subgraph Frontend[Client App (React + Vite)]
    direction TB
    M[main.tsx]
    A[App.tsx]

    subgraph UI[UI Components]
      S[Sidebar.tsx]
      MV[MapView.tsx]
      RT[RiskTimeline.tsx]
      CP[CameraPanel.tsx]
    end

    subgraph FUtils[Client Utils]
      API[utils/api.ts]
      Samp[utils/sampling.ts]
      Types[types.ts]
      CSS[index.css]
    end

    Turf[@turf/along + @turf/length]
    RMB[react-map-gl + mapbox-gl]
  end

  %% ===== Server =====
  subgraph Backend[Server (Express + TypeScript)]
    direction TB
    IDX[src/index.ts]

    subgraph Routes[src/routes/*]
      RRoute[route.ts\nPOST /api/route]
      RWeather[weather.ts\nPOST /api/weather]
      RRoad[road.ts\nGET /api/road/*]
      RCamera[camera.ts\nPOST /api/camera/*]
      RVoice[voice.ts\nPOST /api/voice/speak]
    end

    subgraph SUtils[src/utils]
      Risk[riskScore.ts]
    end

    subgraph Caches[In-memory Caches]
      RoadCache[ApiCache<T>\nconditions/cameras TTL 60s]
      CamImgCache[cameraImageCache\nper viewId TTL 60s]
      AnalyzeCache[analyzeCache\nper imageUrl TTL 120s]
    end

    ENV[(.env\nMAPBOX_TOKEN\nGEMINI_API_KEY\nELEVENLABS_API_KEY)]
  end

  %% ===== External APIs =====
  subgraph External[External Services]
    Mapbox[Mapbox Directions API]
    OpenMeteo[Open-Meteo Forecast API\n(gem_hrdps_continental)]
    ON511[Ontario 511 API + CCTV pages]
    Gemini[Google Gemini 2.5\nFlash / Flash-Lite]
    Eleven[ElevenLabs TTS Stream]
    BrowserTTS[Browser SpeechSynthesis]
  end

  %% ===== Frontend wiring =====
  U --> M --> A
  A --> S
  A --> MV
  A --> RT
  A --> CP

  A --> API
  A --> Samp
  A --> Types
  M --> CSS
  MV --> RMB
  Samp --> Turf

  %% ===== API calls from client =====
  API -->|POST /api/route| RRoute
  API -->|POST /api/weather| RWeather
  API -->|GET /api/road/conditions| RRoad
  API -->|GET /api/road/cameras| RRoad
  API -->|GET /api/road/cameras/near| RRoad
  API -->|POST /api/camera/analyze| RCamera
  API -->|POST /api/camera/advisory| RCamera
  API -->|POST /api/voice/speak| RVoice

  %% ===== Backend routing =====
  IDX --> RRoute
  IDX --> RWeather
  IDX --> RRoad
  IDX --> RCamera
  IDX --> RVoice
  IDX --> ENV

  %% ===== Route internals =====
  RRoute --> Mapbox
  RWeather --> OpenMeteo

  RRoad --> ON511
  RRoad --> RoadCache
  RRoad --> CamImgCache

  RCamera --> Gemini
  RCamera --> ON511
  RCamera --> AnalyzeCache

  RVoice --> Eleven
  RVoice -->|fallback JSON| BrowserTTS

  %% ===== Data used in UI =====
  RWeather -.weather checkpoints.-> A
  RRoad -.road/camera data.-> A
  RRoute -.geometry + distance + duration.-> A
  A -->|risk scoring in App.tsx\n(+ weather + road condition)| CP
  Risk -.available utility module.-> IDX
