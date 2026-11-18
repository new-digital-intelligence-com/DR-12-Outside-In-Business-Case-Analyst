import Anthropic from '@anthropic-ai/sdk';
import type { AiEmployeeLinks } from '@/lib/types';
import { AttachmentError, userContent, validateFiles } from './files';
import { buildSnapshot } from './snapshot';
import { systemPrompt } from './prompt';

/*
 * POST /api/assistant — the read-only assessment assistant in the sidebar.
 * GET  /api/assistant — {configured, provider, model}, never a secret.
 *
 * The app is public (nothing is stored per user and sign-in is optional), so guests may use the
 * assistant too, limited per IP. Requests must come from the app's own pages (same origin), be JSON
 * and stay under 12 MB. Prompts, files and keys are never logged.
 */

export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_HISTORY_TURNS = 10;
export const MAX_HISTORY_CHARS = 2_400;
export const MAX_BODY_BYTES = 12 * 1024 * 1024;
export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 60_000;
export const ANTHROPIC_TIMEOUT_MS = 55_000;
/** The model the rest of the app already uses (src/app/api/research/route.ts). */
export const REPO_MODEL = 'claude-opus-5';
export const FALLBACK_MODEL = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 12_000;

type Env = Record<string, string | undefined>;

export interface AssistantDeps {
  /** Defaults to process.env, read on every request. */
  env?: Env;
  /** Passed to the Anthropic SDK; tests use a mock. */
  fetch?: typeof fetch;
  getAiEmployeeLinks: () => Promise<AiEmployeeLinks>;
  now?: () => number;
  maxRetries?: number;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function assistantModel(env: Env): string {
  const chain = [env.ASSISTANT_MODEL, env.ANTHROPIC_MODEL, REPO_MODEL, FALLBACK_MODEL];
  return chain.map((m) => m?.trim()).find((m): m is string => Boolean(m)) ?? FALLBACK_MODEL;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function fail(status: number, code: string, error: string, headers: Record<string, string> = {}): Response {
  return json({ error, code }, status, headers);
}

/** Origins this request may come from: its own URL, the proxy's public host, and APP_URL. */
function allowedOrigins(request: Request, env: Env): Set<string> {
  const origins = new Set<string>();
  const url = new URL(request.url);
  origins.add(url.origin);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  if (host) {
    const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '');
    origins.add(`${proto}://${host}`);
  }
  for (const value of [env.APP_URL, env.NEXT_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // not a URL: ignored
    }
  }
  return origins;
}

export function isSameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin');
  if (origin) return allowedOrigins(request, env).has(origin);
  // Browsers send Origin on every cross-site POST; without it, accept only an explicit same-origin fetch.
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
}

/** Sliding-window limit per client IP, kept per server process. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit = RATE_LIMIT,
    private readonly windowMs = RATE_WINDOW_MS,
  ) {}

  /** Seconds to wait, or 0 when this request may go ahead (and is counted). */
  take(key: string, now: number): number {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5_000) {
      for (const [k, times] of this.hits) if (!times.some((t) => t > since)) this.hits.delete(k);
    }
    return 0;
  }
}

class BodyTooLarge extends Error {}

/** Reads the body as text, stopping as soon as it passes the limit. */
async function readBody(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLarge();
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

export class InputError extends Error {}

export interface ValidRequest {
  message: string;
  history: HistoryTurn[];
  attachments: ReturnType<typeof validateFiles>;
  context: unknown;
}

/** Checks the request body; throws InputError / AttachmentError with a message fit for the user. */
export function validateRequest(body: unknown): ValidRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Send a JSON object.');
  const b = body as Record<string, unknown>;
  if (typeof b.message !== 'string') throw new InputError('The message must be text.');
  const message = b.message.trim();
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new InputError(`Messages can be at most ${MAX_MESSAGE_CHARS.toLocaleString('en')} characters.`);
  }
  const attachments = validateFiles(b.attachments);
  if (!message && !attachments.length) throw new InputError('Type a question first.');

  const rawHistory = b.history ?? [];
  if (!Array.isArray(rawHistory) || rawHistory.length > MAX_HISTORY_TURNS) {
    throw new InputError(`History can hold at most ${MAX_HISTORY_TURNS} messages.`);
  }
  const history = rawHistory.map((turn): HistoryTurn => {
    const t = turn as { role?: unknown; content?: unknown } | null;
    if (!t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.content !== 'string') {
      throw new InputError('Invalid conversation history.');
    }
    if (t.content.length > MAX_HISTORY_CHARS) {
      throw new InputError(`History messages can be at most ${MAX_HISTORY_CHARS.toLocaleString('en')} characters.`);
    }
    return { role: t.role, content: t.content };
  });

  if (b.context !== undefined && b.context !== null && (typeof b.context !== 'object' || Array.isArray(b.context))) {
    throw new InputError('Invalid context.');
  }
  return { message, history, attachments, context: b.context ?? null };
}

/** Earlier turns as Messages API turns: starting with the user, alternating, no empty turns. */
export function historyMessages(history: HistoryTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    const content = turn.content.trim();
    if (!content) continue;
    if (!out.length && turn.role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content as string}\n\n${content}`;
    } else {
      out.push({ role: turn.role, content });
    }
  }
  // The new message is a user turn, so the history must end with the assistant.
  if (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}

function upstreamError(err: unknown): Response {
  if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) {
    return fail(504, 'upstream_timeout', 'The assistant took too long to answer. Please try again.');
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    if (status === 429) {
      return fail(503, 'upstream_limit', 'The assistant is busy right now. Please try again in a minute.', {
        'Retry-After': '30',
      });
    }
    if (status === 401 || status === 403) {
      return fail(503, 'upstream_auth', 'The assistant is not available right now (AI provider access).');
    }
    if (status === 400 || status === 413 || status === 422) {
      return fail(502, 'upstream_rejected', 'The AI provider could not process this request. Try a shorter message or other files.');
    }
    if (status >= 500 || status === 0) {
      return fail(503, 'upstream_unavailable', 'The AI provider is temporarily unavailable. Please try again shortly.');
    }
  }
  return fail(502, 'upstream_error', 'The assistant could not answer right now. Please try again.');
}

export function createAssistantHandler(deps: AssistantDeps) {
  const limiter = new RateLimiter();
  const env = () => deps.env ?? (process.env as Env);
  const now = deps.now ?? Date.now;

  async function GET(): Promise<Response> {
    const e = env();
    return json({ configured: Boolean(e.ANTHROPIC_API_KEY?.trim()), provider: 'anthropic', model: assistantModel(e) });
  }

  async function POST(request: Request): Promise<Response> {
    const e = env();
    if (!isSameOrigin(request, e)) {
      return fail(403, 'forbidden_origin', 'Requests must come from this app.');
    }
    const contentType = request.headers.get('content-type') ?? '';
    if (!/^application\/json\b/i.test(contentType)) {
      return fail(415, 'unsupported_media_type', 'Send the request as JSON.');
    }
    const apiKey = e.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return fail(503, 'not_configured', 'The assistant is not configured on this server yet.');
    }
    const wait = limiter.take(clientIp(request), now());
    if (wait > 0) {
      return fail(429, 'rate_limited', `Too many questions in a short time. Try again in ${wait} s.`, {
        'Retry-After': String(wait),
      });
    }

    let body: unknown;
    try {
      body = JSON.parse(await readBody(request, MAX_BODY_BYTES));
    } catch (err) {
      if (err instanceof BodyTooLarge) return fail(413, 'payload_too_large', 'The request is larger than 12 MB.');
      return fail(400, 'invalid_json', 'The request is not valid JSON.');
    }

    let input: ValidRequest;
    try {
      input = validateRequest(body);
    } catch (err) {
      if (err instanceof AttachmentError) return fail(400, 'invalid_attachment', err.message);
      if (err instanceof InputError) return fail(400, 'invalid_input', err.message);
      throw err;
    }

    let links: AiEmployeeLinks | null = null;
    try {
      links = await deps.getAiEmployeeLinks();
    } catch {
      links = null; // the snapshot says the catalogue is unavailable
    }
    const snapshot = buildSnapshot(input.context, links);
    const model = assistantModel(e);
    const message = input.message || 'Please review the attached file(s) in the context of this assessment.';

    const client = new Anthropic({
      apiKey,
      maxRetries: deps.maxRetries ?? 1,
      timeout: ANTHROPIC_TIMEOUT_MS,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });

    try {
      const response = await client.messages.create(
        {
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: [{ type: 'text', text: systemPrompt(snapshot), cache_control: { type: 'ephemeral' } }],
          messages: [
            ...historyMessages(input.history),
            { role: 'user', content: userContent(message, input.attachments) },
          ],
          output_config: { effort: 'medium' },
        },
        { signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS) },
      );

      if (response.stop_reason === 'refusal') {
        return fail(422, 'refused', 'The assistant cannot help with that request. Try rephrasing it.');
      }
      const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n')
        .trim();
      if (!answer) {
        return fail(502, 'empty_answer', 'The assistant returned no answer. Please try again.');
      }
      return json({ answer, model: response.model, truncated: response.stop_reason === 'max_tokens' });
    } catch (err) {
      // Status and error type only: never the prompt, files or key.
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      console.warn(`Assistant request failed: ${err instanceof Error ? err.name : 'unknown'}${status ? ` ${status}` : ''}`);
      return upstreamError(err);
    }
  }

  return { GET, POST };
}
