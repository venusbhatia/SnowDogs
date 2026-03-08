import type { BackboardClient as BackboardClientType } from 'backboard-sdk';

const ASSISTANT_NAME = 'SnowDogs Route Intelligence';
const ASSISTANT_SYSTEM_PROMPT =
  'You are a persistent memory system for a Canadian winter road safety platform. You store and recall route analysis briefings, driver reports, and road condition patterns for Ontario highways. When queried about a route corridor, recall all relevant historical data.';

let cachedApiKey: string | null = null;
let client: BackboardClientType | null = null;
let assistantIdCache: string | null = null;
const threadIdByCorridor = new Map<string, string>();
const lookupAttempted = new Set<string>();
let backboardClientCtor: (new (options: { apiKey: string }) => BackboardClientType) | null = null;
let sdkLoadAttempted = false;

function logBackboardError(context: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${timestamp}] Backboard ${context} error: ${message}`);
}

function normalizeCorridor(corridor: string): string {
  return corridor.trim().toLowerCase();
}

async function loadBackboardSdk(): Promise<
  (new (options: { apiKey: string }) => BackboardClientType) | null
> {
  if (backboardClientCtor) {
    return backboardClientCtor;
  }

  if (sdkLoadAttempted) {
    return null;
  }

  sdkLoadAttempted = true;

  try {
    const dynamicImport = new Function(
      'specifier',
      'return import(specifier)'
    ) as (specifier: string) => Promise<{ BackboardClient?: unknown }>;

    const moduleExports = await dynamicImport('backboard-sdk');
    if (typeof moduleExports.BackboardClient === 'function') {
      backboardClientCtor = moduleExports.BackboardClient as new (options: {
        apiKey: string;
      }) => BackboardClientType;
      return backboardClientCtor;
    }
  } catch (error) {
    logBackboardError('loadBackboardSdk', error);
  }

  return null;
}

async function getClient(): Promise<BackboardClientType | null> {
  const apiKey = process.env.BACKBOARD_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const ClientCtor = await loadBackboardSdk();
  if (!ClientCtor) {
    return null;
  }

  if (!client || cachedApiKey !== apiKey) {
    client = new ClientCtor({ apiKey });
    cachedApiKey = apiKey;
    assistantIdCache = null;
    threadIdByCorridor.clear();
    lookupAttempted.clear();
  }

  return client;
}

function extractAssistantId(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.assistantId === 'string' && row.assistantId.trim() !== '') {
    return row.assistantId;
  }

  if (typeof row.assistant_id === 'string' && row.assistant_id.trim() !== '') {
    return row.assistant_id;
  }

  return null;
}

function extractThreadId(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.threadId === 'string' && row.threadId.trim() !== '') {
    return row.threadId;
  }

  if (typeof row.thread_id === 'string' && row.thread_id.trim() !== '') {
    return row.thread_id;
  }

  if (typeof row.id === 'string' && row.id.trim() !== '') {
    return row.id;
  }

  return null;
}

function extractMessageContent(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.content === 'string' && row.content.trim() !== '') {
    return row.content.trim();
  }

  if (typeof row.message === 'string' && row.message.trim() !== '') {
    return row.message.trim();
  }

  return null;
}

async function ensureAssistantId(): Promise<string | null> {
  if (assistantIdCache) {
    return assistantIdCache;
  }

  const backboard = await getClient();
  if (!backboard) {
    return null;
  }

  try {
    const assistants = await backboard.listAssistants({ skip: 0, limit: 100 });
    const existing = assistants.find((assistant) => assistant.name === ASSISTANT_NAME);
    if (existing) {
      assistantIdCache = existing.assistantId;
      return assistantIdCache;
    }

    const created = await backboard.createAssistant({
      name: ASSISTANT_NAME,
      system_prompt: ASSISTANT_SYSTEM_PROMPT
    });

    assistantIdCache = extractAssistantId(created);
    return assistantIdCache;
  } catch (error) {
    logBackboardError('ensureAssistantId', error);
    return null;
  }
}

function threadHasCorridorMarker(thread: unknown, corridor: string): boolean {
  if (!thread || typeof thread !== 'object') {
    return false;
  }

  const row = thread as Record<string, unknown>;
  const messages = Array.isArray(row.messages) ? row.messages : [];
  return messages.some((message) => {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const content = (message as { content?: unknown }).content;
    return typeof content === 'string' && content.includes(`CORRIDOR_KEY:${corridor}`);
  });
}

async function findExistingThreadForCorridor(corridor: string): Promise<string | null> {
  const backboard = await getClient();
  if (!backboard) {
    return null;
  }

  const assistantId = await ensureAssistantId();
  if (!assistantId) {
    return null;
  }

  try {
    const threads = await backboard.listThreadsForAssistant(assistantId, { skip: 0, limit: 100 });

    for (const thread of threads) {
      const threadId = extractThreadId(thread);
      if (!threadId) {
        continue;
      }

      try {
        const details = await backboard.getThread(threadId);
        if (threadHasCorridorMarker(details, corridor)) {
          return threadId;
        }
      } catch (error) {
        logBackboardError(`findExistingThreadForCorridor/getThread(${threadId})`, error);
      }
    }
  } catch (error) {
    logBackboardError('findExistingThreadForCorridor/listThreadsForAssistant', error);
  }

  return null;
}

async function getOrCreateCorridorThread(
  corridor: string,
  createIfMissing: boolean
): Promise<string | null> {
  const normalized = normalizeCorridor(corridor);
  if (!normalized) {
    return null;
  }

  const existingCached = threadIdByCorridor.get(normalized);
  if (existingCached) {
    return existingCached;
  }

  const backboard = await getClient();
  if (!backboard) {
    return null;
  }

  if (!lookupAttempted.has(normalized)) {
    lookupAttempted.add(normalized);
    const discovered = await findExistingThreadForCorridor(normalized);
    if (discovered) {
      threadIdByCorridor.set(normalized, discovered);
      return discovered;
    }
  }

  if (!createIfMissing) {
    return null;
  }

  const assistantId = await ensureAssistantId();
  if (!assistantId) {
    return null;
  }

  try {
    const thread = await backboard.createThread(assistantId);
    const threadId = extractThreadId(thread);
    if (!threadId) {
      return null;
    }

    threadIdByCorridor.set(normalized, threadId);

    try {
      await backboard.addMessage(threadId, {
        content:
          `CORRIDOR_KEY:${normalized}\n` +
          `This thread stores persistent SnowDogs route memory for ${normalized}.`,
        memory: 'Auto',
        stream: false
      });
    } catch (error) {
      logBackboardError('getOrCreateCorridorThread/addMessage(marker)', error);
    }

    return threadId;
  } catch (error) {
    logBackboardError('getOrCreateCorridorThread/createThread', error);
    return null;
  }
}

function summarizeRiskSegments(briefing: Record<string, unknown>): string {
  const riskSegments = Array.isArray(briefing.risk_segments)
    ? (briefing.risk_segments as Array<Record<string, unknown>>)
    : [];

  if (riskSegments.length === 0) {
    return 'none';
  }

  return riskSegments
    .slice(0, 8)
    .map((segment) => {
      const location =
        typeof segment.location === 'string' && segment.location.trim() !== ''
          ? segment.location
          : 'Unknown location';
      const risk =
        typeof segment.risk === 'string' && segment.risk.trim() !== '' ? segment.risk : 'unknown risk';
      return `${location} (${risk})`;
    })
    .join('; ');
}

export async function storeRouteBriefing(corridor: string, briefing: object): Promise<void> {
  try {
    const backboard = await getClient();
    if (!backboard) {
      return;
    }

    const threadId = await getOrCreateCorridorThread(corridor, true);
    if (!threadId) {
      return;
    }

    const record = (briefing || {}) as Record<string, unknown>;
    const overallRisk =
      typeof record.overall_risk === 'string' && record.overall_risk.trim() !== ''
        ? record.overall_risk
        : 'unknown';
    const executiveSummary =
      typeof record.executive_summary === 'string' && record.executive_summary.trim() !== ''
        ? record.executive_summary
        : 'No executive summary provided.';
    const processedReports = Array.isArray(record.processed_reports) ? record.processed_reports.length : 0;
    const recommendation =
      typeof record.recommended_action === 'string' && record.recommended_action.trim() !== ''
        ? record.recommended_action
        : 'No recommendation provided.';
    const segmentSummary = summarizeRiskSegments(record);

    const content =
      `Route briefing for ${normalizeCorridor(corridor)} on ${new Date().toISOString()}: ` +
      `Overall risk: ${overallRisk}. ` +
      `Executive summary: ${executiveSummary}. ` +
      `Processed ${processedReports} driver reports. ` +
      `Key risk segments: ${segmentSummary}. ` +
      `Agent recommendation: ${recommendation}.`;

    await backboard.addMessage(threadId, {
      content,
      memory: 'Auto',
      stream: false
    });
  } catch (error) {
    logBackboardError('storeRouteBriefing', error);
  }
}

export async function recallCorridorHistory(corridor: string): Promise<string | null> {
  try {
    const backboard = await getClient();
    if (!backboard) {
      return null;
    }

    const threadId = await getOrCreateCorridorThread(corridor, false);
    if (!threadId) {
      return null;
    }

    const response = await backboard.addMessage(threadId, {
      content:
        'What do you remember about road conditions, patterns, and past analyses for this corridor? Summarize any recurring hazards, frequently reported problem areas, and historical risk patterns.',
      memory: 'Auto',
      stream: false
    });

    return extractMessageContent(response);
  } catch (error) {
    logBackboardError('recallCorridorHistory', error);
    return null;
  }
}

export async function storeDriverReport(
  corridor: string,
  reportText: string,
  credibility: number
): Promise<void> {
  try {
    const trimmed = reportText.trim();
    if (!trimmed) {
      return;
    }

    const backboard = await getClient();
    if (!backboard) {
      return;
    }

    const threadId = await getOrCreateCorridorThread(corridor, true);
    if (!threadId) {
      return;
    }

    const clampedCredibility = Math.max(0, Math.min(1, Number.isFinite(credibility) ? credibility : 0));

    const content =
      `Driver report for ${normalizeCorridor(corridor)} on ${new Date().toISOString()} ` +
      `(credibility: ${clampedCredibility.toFixed(2)}): ${trimmed}`;

    await backboard.addMessage(threadId, {
      content,
      memory: 'Auto',
      stream: false
    });
  } catch (error) {
    logBackboardError('storeDriverReport', error);
  }
}
