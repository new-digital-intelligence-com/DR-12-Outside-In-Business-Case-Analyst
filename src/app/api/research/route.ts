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

const CandidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string().describe('Full/legal company name'),
        location: z.string().describe('HQ city and country, or "Unknown"'),
        domain: z.string().nullable().describe('Primary website domain (e.g. example.com), or null if unknown'),
        description: z
          .string()
          .describe('One short sentence on what the company does — enough to distinguish it from similarly-named companies'),
      })
    )
    .max(5)
    .describe('Up to 5 distinct real companies that could plausibly match the given name. Empty if none found — never invent one.'),
});

const ResearchSchema = z.object({
  companyFound: z.boolean().describe('Whether you found a real, identifiable company matching this name'),
  revenueEur: z.number().nullable().describe('Most recent annual revenue in EUR, or null if unknown/private'),
  profitEur: z.number().nullable().describe('Most recent annual net profit in EUR, or null if unknown'),
  totalFte: z.number().nullable().describe('Total headcount (FTE), or null if unknown'),
  avgRevenuePerFte: z.number().nullable().describe('Revenue divided by FTE, in EUR, or null if either is unknown'),
  industryL1: z.string().nullable().describe('Best-matching top-level industry from the provided list, or null'),
  industrySegment: z
    .string()
    .nullable()
    .describe('Best-matching industry segment from the provided list (must belong to industryL1), or null'),
  avgLoadedCostPerFte: z
    .number()
    .nullable()
    .describe('Estimated fully-loaded annual cost per employee in EUR (salary + overhead), or null'),
  researchNotes: z
    .string()
    .describe(
      'Brief note on sources and confidence — say plainly which figures are reported/sourced vs. estimated, and why (e.g. private company, no disclosed financials).'
    ),
});

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

/** Drains pause_turn continuations from a server-tool turn, up to a hard cap, then forces a
 * final no-tools wrap-up call if it still hasn't converged. max_uses on a tool only bounds ONE
 * call's search budget — it resets on every re-call after a pause_turn, so without this cap an
 * ambiguous/hard-to-resolve query can make the model loop for many minutes instead of ever
 * settling on "I don't have enough to be confident." */
async function resolveWithCap(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  response: Anthropic.Message,
  maxTokens: number,
  maxUses: number,
  maxIterations: number
): Promise<Anthropic.Message> {
  let iterations = 0;
  while (response.stop_reason === 'pause_turn' && iterations < maxIterations) {
    iterations++;
    messages.push({ role: 'assistant', content: response.content });
    response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: maxTokens,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses }],
      messages,
    });
  }
  if (response.stop_reason === 'pause_turn') {
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: 'Stop searching now and summarize your best findings so far, being explicit about what remains uncertain.',
    });
    response = await client.messages.create({ model: 'claude-opus-5', max_tokens: maxTokens, messages });
  }
  return response;
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** Step 1: find candidate real companies matching a (possibly ambiguous) name, so the user can
 * confirm which one they mean before we spend a full research pass on the wrong company. */
async function identifyCompany(companyName: string): Promise<CompanyCandidate[]> {
  const client = new Anthropic({ maxRetries: 5 });
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Search the web to find real, identifiable companies matching the name "${companyName}". There may be multiple distinct companies with this or a similar name (different countries, industries, or legal entities) — list up to 5 of the most plausible distinct matches, each with enough detail (full name, HQ location, website domain, one-line description) to tell them apart. If you find no real company matching this name at all, return an empty list — do not invent one.`,
    },
  ];

  let response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    messages,
  });
  response = await resolveWithCap(client, messages, response, 2048, 3, 2);

  const extraction = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `From this research, list the distinct candidate companies matching "${companyName}":\n\n${textOf(response)}`,
      },
    ],
    output_config: { format: zodOutputFormat(CandidateSchema) },
  });

  return extraction.parsed_output?.candidates ?? [];
}

/**
 * Step 2: full financial/industry research on a specific, already-identified company. Two-call
 * pattern: (1) let Claude research with the web search tool and produce a free-text findings
 * summary, (2) extract that summary into our structured schema with a separate, tool-free call
 * (Claude's structured-output mode doesn't mix with an open-ended tool loop in a single call).
 * This routinely takes 1-3 minutes, which exceeds Cloudflare's ~100s "time to first response
 * byte" proxy timeout (HTTP 524) if we just block and return JSON at the end — so the caller
 * streams newline-delimited JSON (see POST below).
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
    // Higher than the SDK default (2) — the research call is expensive enough in latency that
    // it's worth riding out brief upstream overload (429/5xx) rather than failing fast.
    const client = new Anthropic({ maxRetries: 5 });

    const taxonomy = L1_INDUSTRIES.map(
      (l1) =>
        `${l1.name}: ${INDUSTRY_LIST.filter((s) => s.l1Name === l1.name)
          .map((s) => s.l2Name)
          .join(', ')}`
    ).join('\n');

    const subject = identityHint ? `"${companyName}" (${identityHint})` : `"${companyName}"`;

    const researchMessages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          `Research the company ${subject} using web search.`,
          'Find (as of the most recent publicly available data): annual revenue, annual net profit, total employee headcount (FTE), and a fully-loaded annual cost per employee estimate appropriate for its country/industry.',
          'Also classify it into exactly one industry and one industry segment from this fixed taxonomy (use the exact spelling given):',
          taxonomy,
          '',
          'If the company is private and does not disclose financials, say so explicitly and give your best order-of-magnitude estimate only where you have a reasonable basis (e.g. from employee count, industry benchmarks, or press coverage) — do not invent precise-looking figures. Cite what you found and what is estimated.',
        ].join('\n'),
      },
    ];

    let researchResponse = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      messages: researchMessages,
    });
    researchResponse = await resolveWithCap(client, researchMessages, researchResponse, 4096, 5, 4);

    const findingsText = textOf(researchResponse);

    const extraction = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Extract structured data from this research summary about "${companyName}":\n\n${findingsText}`,
        },
      ],
      output_config: { format: zodOutputFormat(ResearchSchema) },
    });

    const parsed = extraction.parsed_output;
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
    const message = error instanceof Anthropic.APIError ? error.message : 'Research request failed';
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
          const data = await runResearch(companyName, hint);
          send({ type: 'result', data });
        } else {
          const candidates = await identifyCompany(companyName);
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
        const message = error instanceof Anthropic.APIError ? error.message : 'Research request failed';
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
