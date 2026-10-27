import 'server-only';
import snapshot from '@/data/ai-employees-snapshot.json';
import { AI_EMPLOYEE_MAP, MAX_AI_EMPLOYEES_PER_FUNCTION } from '@/data/aiEmployeeMap';
import type { AiEmployeeLinks, AiEmployeeSummary } from './types';

/*
 * NDI's AI Employees catalogue, read from the AI Sales Coach's API with the secret
 * AI_EMPLOYEES_API_KEY — server-side only, so neither the key nor the catalogue's internal fields
 * (maturity, priority, agents, business cases) ever reach the browser.
 *
 * The Coach re-reads NDI's Drive once an hour and announces its next check in `nextCheckAt`, so this
 * asks about 5 minutes after that (at most roughly once an hour), and sends the last `version` as
 * an ETag so an unchanged catalogue costs an empty 304. Without the key, or while the API can't be
 * reached, it serves the snapshot bundled with the app (npm run ai-employees:snapshot refreshes it).
 */

const API_URL = 'https://ndi-ai-sales-coach-production.up.railway.app/api/ai-employees';
const MINUTE = 60_000;
const DEFAULT_CHECK_EVERY_MS = 60 * MINUTE;
const AFTER_NEXT_CHECK_MS = 5 * MINUTE;
const RETRY_AFTER_ERROR_MS = 15 * MINUTE;
const MAX_WAIT_MS = 2 * 60 * MINUTE;
const REQUEST_TIMEOUT_MS = 5_000;

interface Catalog {
  version: string;
  source: AiEmployeeLinks['source'];
  /** Built AI Employees by code. "Concept" ones (not built yet) are left out. */
  employees: Map<string, AiEmployeeSummary>;
}

interface ApiEmployee {
  code?: unknown;
  name?: unknown;
  category?: unknown;
  tagline?: unknown;
  videoUrl?: unknown;
  internal?: { maturity?: unknown } | null;
}

/** The catalogue this server holds, and when to ask the Coach next. */
interface CatalogState {
  catalog: Catalog;
  nextFetchAt: number; // epoch ms; 0 = on first use
  checkEveryMs: number;
  coachNextCheckAt: number | null;
  inFlight: Promise<void> | null;
}

// One state per server process, kept on globalThis. Next.js bundles this file once for
// /api/ai-employee-links and again for the print page behind the PDF; plain module variables would
// give each bundle its own copy, and its own call to the API every hour.
const shared = globalThis as unknown as Record<symbol, CatalogState | undefined>;
const state = (shared[Symbol.for('ndi.dr12.aiEmployees')] ??= {
  catalog: fromSnapshot(),
  nextFetchAt: 0,
  checkEveryMs: DEFAULT_CHECK_EVERY_MS,
  coachNextCheckAt: null,
  inFlight: null,
});

// Links resolved from state.catalog. Cheap to build, so each bundle keeps its own.
let resolved: { catalog: Catalog; links: AiEmployeeLinks } | null = null;

/** The NDI AI Employees matching each sub-function, best fit first — public fields only. */
export async function getAiEmployeeLinks(): Promise<AiEmployeeLinks> {
  if (process.env.AI_EMPLOYEES_API_KEY && Date.now() >= state.nextFetchAt) {
    state.inFlight ??= refresh().finally(() => {
      state.inFlight = null;
    });
    await state.inFlight;
  }
  const { catalog } = state;
  if (!resolved || resolved.catalog !== catalog) resolved = { catalog, links: resolveLinks(catalog) };
  return resolved.links;
}

async function refresh(): Promise<void> {
  const now = Date.now();
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.AI_EMPLOYEES_API_KEY}` };
  // An empty 304 doesn't say when the Coach checks next, so the first call asks for the full answer.
  if (state.catalog.source === 'live') headers['If-None-Match'] = `"${state.catalog.version}"`;
  try {
    const res = await fetch(API_URL, { headers, cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    if (res.status === 304) {
      scheduleNextFetch(now); // nothing changed since our version
      return;
    }

    if (!res.ok) {
      const badKey = res.status === 401 || res.status === 403;
      const retryAfterMs = Number(res.headers.get('retry-after')) * 1000; // 503 "not ready" sends one
      state.nextFetchAt =
        now +
        (badKey
          ? 60 * MINUTE
          : retryAfterMs > 0
            ? Math.min(Math.max(retryAfterMs, MINUTE), 60 * MINUTE)
            : RETRY_AFTER_ERROR_MS);
      console.warn(
        `AI Employees API answered ${res.status}${badKey ? ' (check AI_EMPLOYEES_API_KEY)' : ''}; ` +
          `keeping the ${state.catalog.source} catalogue.`,
      );
      return;
    }

    const data = (await res.json()) as {
      version?: unknown;
      nextCheckAt?: unknown;
      checkEveryMinutes?: unknown;
      aiEmployees?: unknown;
    };
    if (typeof data.version !== 'string' || !Array.isArray(data.aiEmployees)) {
      throw new Error('unexpected response shape');
    }

    if (data.version !== state.catalog.version || state.catalog.source !== 'live') {
      state.catalog = { version: data.version, source: 'live', employees: publicEmployees(data.aiEmployees) };
    }
    if (typeof data.checkEveryMinutes === 'number' && data.checkEveryMinutes >= 5) {
      state.checkEveryMs = data.checkEveryMinutes * MINUTE;
    }
    const announced = typeof data.nextCheckAt === 'string' ? Date.parse(data.nextCheckAt) : NaN;
    state.coachNextCheckAt = Number.isFinite(announced) ? announced : null;
    scheduleNextFetch(now);
  } catch (err) {
    state.nextFetchAt = now + RETRY_AFTER_ERROR_MS;
    console.warn(
      `AI Employees API unreachable (${err instanceof Error ? err.message : String(err)}); ` +
        `keeping the ${state.catalog.source} catalogue.`,
    );
  }
}

/**
 * About 5 minutes after the Coach's next check of NDI's Drive. Once that moment has passed (always
 * the case after a 304, which carries no schedule), the next slot on the Coach's cadence.
 */
function scheduleNextFetch(now: number) {
  const { checkEveryMs, coachNextCheckAt } = state;
  let next = now + checkEveryMs;
  if (coachNextCheckAt !== null) {
    next = coachNextCheckAt + AFTER_NEXT_CHECK_MS;
    if (next <= now) next += (Math.floor((now - next) / checkEveryMs) + 1) * checkEveryMs;
  }
  state.nextFetchAt = Math.min(Math.max(next, now + MINUTE), now + MAX_WAIT_MS);
}

function publicEmployees(list: unknown[]): Map<string, AiEmployeeSummary> {
  const employees = new Map<string, AiEmployeeSummary>();
  for (const item of list) {
    const e = item as ApiEmployee | null;
    if (!e || typeof e.code !== 'string' || typeof e.name !== 'string') continue;
    if (e.internal?.maturity === 'Concept') continue; // not built yet: never present it as ready
    employees.set(e.code, {
      code: e.code,
      name: e.name,
      category: typeof e.category === 'string' ? e.category : '',
      tagline: typeof e.tagline === 'string' ? e.tagline : '',
      videoUrl: httpUrl(e.videoUrl),
    });
  }
  return employees;
}

function fromSnapshot(): Catalog {
  return { version: snapshot.catalogVersion, source: 'snapshot', employees: publicEmployees(snapshot.employees) };
}

/** Only plain web links make it into an href. */
function httpUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
}

function resolveLinks(c: Catalog): AiEmployeeLinks {
  const byFunction: Record<string, AiEmployeeSummary[]> = {};
  for (const [l2Code, codes] of Object.entries(AI_EMPLOYEE_MAP)) {
    byFunction[l2Code] = codes
      .map((code) => c.employees.get(code))
      .filter((e): e is AiEmployeeSummary => e !== undefined)
      .slice(0, MAX_AI_EMPLOYEES_PER_FUNCTION);
  }
  return { catalogVersion: c.version, source: c.source, byFunction };
}
