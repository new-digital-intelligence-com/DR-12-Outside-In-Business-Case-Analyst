import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { L1_INDUSTRIES, INDUSTRY_LIST } from '@/data/model';

export interface ResearchResponse {
  live: boolean;
  companyName: string;
  revenueEur: number | null;
  profitEur: number | null;
  totalFte: number | null;
  avgRevenuePerFte: number | null;
  industryL1: string | null;
  industrySegment: string | null;
  avgLoadedCostPerFte: number | null;
  note: string;
}

export interface CompanyCandidate {
  name: string;
  location: string;
  domain: string | null;
  description: string;
}

export type ResearchStreamEvent =
  | { type: 'heartbeat'; elapsedMs: number }
  | { type: 'candidates'; data: CompanyCandidate[] }
  | { type: 'result'; data: ResearchResponse };

// Custom "report" tools the model calls directly (as a normal tool_use, alongside web_search) to
// hand back structured results as its final action — this is the same pattern a native multi-tool
// Claude conversation uses. It replaces a separate extraction call in the common case: no second
// round-trip, no separate model, just one agentic turn. Fallback below still exists for the rare
// case the model doesn't call it.
const CANDIDATE_REPORT_TOOL: Anthropic.Tool = {
  name: 'report_candidates',
  description:
    'Report the distinct real companies you found matching the search name. Call this once, as your final action, with your best findings so far — do not wait until you are exhaustively certain.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full/legal company name' },
            location: { type: 'string', description: 'HQ city and country, or "Unknown"' },
            domain: { type: 'string', description: 'Primary website domain (e.g. example.com), or "" if unknown' },
            description: {
              type: 'string',
              description: 'One short sentence on what the company does — enough to distinguish it from similarly-named companies',
            },
          },
          required: ['name', 'location', 'domain', 'description'],
        },
        description: 'Up to 5 distinct real companies that could plausibly match the given name. Empty array if none found — never invent one.',
      },
    },
    required: ['candidates'],
  },
};

const RESEARCH_REPORT_TOOL: Anthropic.Tool = {
  name: 'report_research',
  description: 'Report your structured research findings about the company. Call this once, as your final action.',
  input_schema: {
    type: 'object',
    properties: {
      companyFound: { type: 'boolean', description: 'Whether you found a real, identifiable company matching this name' },
      revenueEur: { type: ['number', 'null'], description: 'Most recent annual revenue in EUR, or null if unknown/private' },
      profitEur: { type: ['number', 'null'], description: 'Most recent annual net profit in EUR, or null if unknown' },
      totalFte: { type: ['number', 'null'], description: 'Total headcount (FTE), or null if unknown' },
      avgRevenuePerFte: { type: ['number', 'null'], description: 'Revenue divided by FTE, in EUR, or null if either is unknown' },
      industryL1: { type: ['string', 'null'], description: 'Best-matching top-level industry from the provided list, or null' },
      industrySegment: {
        type: ['string', 'null'],
        description: 'Best-matching industry segment from the provided list (must belong to industryL1), or null',
      },
      avgLoadedCostPerFte: {
        type: ['number', 'null'],
        description: 'Estimated fully-loaded annual cost per employee in EUR (salary + overhead), or null',
      },
      researchNotes: {
        type: 'string',
        description:
          'Brief note on sources and confidence — say plainly which figures are reported/sourced vs. estimated, and why (e.g. private company, no disclosed financials).',
      },
    },
    required: [
      'companyFound',
      'revenueEur',
      'profitEur',
      'totalFte',
      'avgRevenuePerFte',
      'industryL1',
      'industrySegment',
      'avgLoadedCostPerFte',
      'researchNotes',
    ],
  },
};

// Fallback-path schemas — only used on the rare turn where the model answers in plain text
// instead of calling the report tool, extracted with a fast, cheap model (no search needed).
const CandidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string(),
        location: z.string(),
        domain: z.string().nullable(),
        description: z.string(),
      })
    )
    .max(5),
});

const ResearchSchema = z.object({
  companyFound: z.boolean(),
  revenueEur: z.number().nullable(),
  profitEur: z.number().nullable(),
  totalFte: z.number().nullable(),
  avgRevenuePerFte: z.number().nullable(),
  industryL1: z.string().nullable(),
  industrySegment: z.string().nullable(),
  avgLoadedCostPerFte: z.number().nullable(),
  researchNotes: z.string(),
});

const ANTHROPIC_CLIENT_OPTS = { maxRetries: 2, timeout: 90_000 } as const;

/** Races a promise against a hard deadline so the user is never left waiting indefinitely. This
 * only stops *waiting* — it doesn't cancel the underlying call — but giving up just closes the
 * stream and the Worker invocation ends shortly after, so that's fine. */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  console.log(`[withDeadline] arming ${label} for ${ms}ms at t=${Date.now()}`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.log(`[withDeadline] FIRED ${label} at t=${Date.now()}`);
      reject(new Error(`${label} took too long (over ${Math.round(ms / 1000)}s)`));
    }, ms);
    promise.then(
      (value) => {
        console.log(`[withDeadline] ${label} settled (resolved) before deadline at t=${Date.now()}`);
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        console.log(`[withDeadline] ${label} settled (rejected) before deadline at t=${Date.now()}`);
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function nullFields() {
  return {
    revenueEur: null,
    profitEur: null,
    totalFte: null,
    avgRevenuePerFte: null,
    industryL1: null,
    industrySegment: null,
    avgLoadedCostPerFte: null,
  } as const;
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Runs one agentic turn with web_search plus a custom "report" tool, the same shape a native
 * multi-tool Claude conversation uses — search as needed, then call the report tool as the final
 * action. No output_config.effort override: this mirrors default conversational behavior rather
 * than artificially throttling quality/depth. Drains pause_turn (the server-tool loop needing a
 * fresh call to continue) up to a hard cap so an unresolved search can't run away.
 */
async function runAgenticReport(
  client: Anthropic,
  userPrompt: string,
  reportTool: Anthropic.Tool,
  maxTokens: number,
  maxUses: number,
  maxIterations: number
): Promise<{ toolInput: unknown; findingsText: string }> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: maxUses },
    reportTool,
  ];

  // Streaming, not .create() — a long non-streaming call that sits silent while Anthropic's
  // server does multiple searches internally is far more exposed to an intermediate connection
  // timeout (Cloudflare Worker <-> Anthropic) than one that's actively streaming bytes the whole
  // time. This matches the same fix already applied to our own outbound stream to the browser.
  let response = await client.messages.stream({ model: 'claude-opus-5', max_tokens: maxTokens, tools, messages }).finalMessage();

  let iterations = 0;
  while (response.stop_reason === 'pause_turn' && iterations < maxIterations) {
    iterations++;
    messages.push({ role: 'assistant', content: response.content });
    response = await client.messages.stream({ model: 'claude-opus-5', max_tokens: maxTokens, tools, messages }).finalMessage();
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === reportTool.name
  );

  return { toolInput: toolUse?.input, findingsText: textOf(response) };
}

/** Step 1: find candidate real companies matching a (possibly ambiguous) name, so the user can
 * confirm which one they mean before we spend a full research pass on the wrong company. */
async function identifyCompany(companyName: string): Promise<CompanyCandidate[]> {
  const client = new Anthropic(ANTHROPIC_CLIENT_OPTS);
  const prompt = `Search the web to find real, identifiable companies matching the name "${companyName}". There may be multiple distinct companies with this or a similar name (different countries, industries, or legal entities) — call report_candidates with up to 5 of the most plausible distinct matches, each with enough detail (full name, HQ location, website domain, one-line description) to tell them apart. If you find no real company matching this name at all, call report_candidates with an empty list — do not invent one.`;

  const { toolInput, findingsText } = await runAgenticReport(client, prompt, CANDIDATE_REPORT_TOOL, 2048, 3, 3);

  const direct = toolInput as { candidates?: CompanyCandidate[] } | undefined;
  if (direct?.candidates) return direct.candidates;

  // Fallback: the model answered in plain text instead of calling the tool. Extract with a fast,
  // cheap model from what it already found — no new search needed.
  const extraction = await client.messages.parse({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: `From this research, list the distinct candidate companies matching "${companyName}":\n\n${findingsText}` },
    ],
    output_config: { format: zodOutputFormat(CandidateSchema) },
  });
  return extraction.parsed_output?.candidates ?? [];
}

/**
 * Step 2: full financial/industry research on a specific, already-identified company. This
 * routinely takes 30-100s+, which can exceed Cloudflare's ~100s "time to first response byte"
 * proxy timeout (HTTP 524) if we just block and return JSON at the end — so the caller streams
 * newline-delimited JSON (see POST below).
 */
async function runResearch(companyName: string, identityHint: string | undefined): Promise<ResearchResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      live: false,
      companyName,
      ...nullFields(),
      note: 'No research connector configured — enter the figures below yourself, or set ANTHROPIC_API_KEY to enable live research.',
    };
  }

  try {
    const client = new Anthropic(ANTHROPIC_CLIENT_OPTS);

    const taxonomy = L1_INDUSTRIES.map(
      (l1) =>
        `${l1.name}: ${INDUSTRY_LIST.filter((s) => s.l1Name === l1.name)
          .map((s) => s.l2Name)
          .join(', ')}`
    ).join('\n');

    const subject = identityHint ? `"${companyName}" (${identityHint})` : `"${companyName}"`;

    const prompt = [
      `Research the company ${subject} using web search.`,
      'Find (as of the most recent publicly available data): annual revenue, annual net profit, total employee headcount (FTE), and a fully-loaded annual cost per employee estimate appropriate for its country/industry.',
      'Also classify it into exactly one industry and one industry segment from this fixed taxonomy (use the exact spelling given):',
      taxonomy,
      '',
      'If the company is private and does not disclose financials, say so explicitly and give your best order-of-magnitude estimate only where you have a reasonable basis (e.g. from employee count, industry benchmarks, or press coverage) — do not invent precise-looking figures.',
      'When you are done, call report_research with your findings, citing in researchNotes what is reported/sourced vs. estimated.',
    ].join('\n');

    const { toolInput, findingsText } = await runAgenticReport(client, prompt, RESEARCH_REPORT_TOOL, 4096, 5, 4);

    let parsed = toolInput as z.infer<typeof ResearchSchema> | undefined;

    if (!parsed) {
      // Fallback: the model answered in plain text instead of calling the tool.
      const extraction = await client.messages.parse({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: `Extract structured data from this research summary about "${companyName}":\n\n${findingsText}` }],
        output_config: { format: zodOutputFormat(ResearchSchema) },
      });
      parsed = extraction.parsed_output ?? undefined;
    }

    if (!parsed || !parsed.companyFound) {
      return {
        live: true,
        companyName,
        ...nullFields(),
        note: `Couldn't confidently identify "${companyName}" — enter the figures below yourself.`,
      };
    }

    // Only trust industry/segment values that exactly match our taxonomy — otherwise leave blank
    // rather than feeding the UI a value its dropdown doesn't recognize.
    const validL1 = L1_INDUSTRIES.some((l1) => l1.name === parsed.industryL1);
    const validSegment = INDUSTRY_LIST.some(
      (s) => s.l2Name === parsed.industrySegment && s.l1Name === parsed.industryL1
    );

    return {
      live: true,
      companyName,
      revenueEur: parsed.revenueEur,
      profitEur: parsed.profitEur,
      totalFte: parsed.totalFte,
      avgRevenuePerFte: parsed.avgRevenuePerFte,
      industryL1: validL1 ? parsed.industryL1 : null,
      industrySegment: validL1 && validSegment ? parsed.industrySegment : null,
      avgLoadedCostPerFte: parsed.avgLoadedCostPerFte,
      note: parsed.researchNotes,
    };
  } catch (error) {
    console.error('Research API error:', error);
    const message = error instanceof Error ? error.message : 'Research request failed';
    return {
      live: false,
      companyName,
      ...nullFields(),
      note: `Research connector error: ${message}. Enter the figures below yourself.`,
    };
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { companyName: string; confirmedCandidate?: CompanyCandidate };
  const { companyName, confirmedCandidate } = body;

  if (!companyName?.trim()) {
    return new Response(JSON.stringify({ error: 'companyName is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ResearchStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // Controller already closed (client disconnected) — stop trying.
          closed = true;
        }
      };
      heartbeat = setInterval(() => {
        send({ type: 'heartbeat', elapsedMs: Date.now() - startedAt });
      }, 8000);

      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          send({
            type: 'result',
            data: {
              live: false,
              companyName,
              ...nullFields(),
              note: 'No research connector configured — enter the figures below yourself, or set ANTHROPIC_API_KEY to enable live research.',
            },
          });
        } else if (confirmedCandidate) {
          const hint = `full legal name: ${confirmedCandidate.name}; HQ: ${confirmedCandidate.location}; website: ${
            confirmedCandidate.domain ?? 'unknown'
          }; ${confirmedCandidate.description}`;
          const data = await withDeadline(runResearch(companyName, hint), 200_000, 'Research');
          send({ type: 'result', data });
        } else {
          const candidates = await withDeadline(identifyCompany(companyName), 200_000, 'Company identification');
          if (candidates.length === 0) {
            send({
              type: 'result',
              data: {
                live: true,
                companyName,
                ...nullFields(),
                note: `Couldn't confidently identify "${companyName}" — enter the figures below yourself.`,
              },
            });
          } else {
            send({ type: 'candidates', data: candidates });
          }
        }
      } catch (error) {
        console.error('Research API error:', error);
        const message = error instanceof Error ? error.message : 'Research request failed';
        send({
          type: 'result',
          data: {
            live: false,
            companyName,
            ...nullFields(),
            note: `Research connector error: ${message}. Enter the figures below yourself.`,
          },
        });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    // Fires if the client disconnects mid-stream — stop the heartbeat so it doesn't keep
    // trying to write to a dead controller until the (still-running) research call resolves.
    cancel() {
      closed = true;
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
