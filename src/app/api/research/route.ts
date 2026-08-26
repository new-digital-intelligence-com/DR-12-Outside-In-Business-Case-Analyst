import { NextRequest, NextResponse } from 'next/server';
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

/**
 * Company research step. Two-call pattern: (1) let Claude research the company with the web
 * search tool and produce a free-text findings summary, (2) extract that summary into our
 * structured schema with a separate, tool-free call (Claude's structured-output mode doesn't mix
 * with an open-ended tool loop in a single call).
 */
export async function POST(req: NextRequest) {
  const { companyName } = (await req.json()) as { companyName: string };

  if (!companyName?.trim()) {
    return NextResponse.json({ error: 'companyName is required' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    const response: ResearchResponse = {
      live: false,
      companyName,
      revenueEur: null,
      profitEur: null,
      totalFte: null,
      avgRevenuePerFte: null,
      industryL1: null,
      industrySegment: null,
      avgLoadedCostPerFte: null,
      note: 'No research connector configured — enter the figures below yourself, or set ANTHROPIC_API_KEY to enable live research.',
    };
    return NextResponse.json(response);
  }

  try {
    const client = new Anthropic();

    const taxonomy = L1_INDUSTRIES.map(
      (l1) =>
        `${l1.name}: ${INDUSTRY_LIST.filter((s) => s.l1Name === l1.name)
          .map((s) => s.l2Name)
          .join(', ')}`
    ).join('\n');

    const researchMessages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          `Research the company "${companyName}" using web search.`,
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

    // Drain any pause_turn continuations from the server-side search tool.
    while (researchResponse.stop_reason === 'pause_turn') {
      researchMessages.push({ role: 'assistant', content: researchResponse.content });
      researchResponse = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
        messages: researchMessages,
      });
    }

    const findingsText = researchResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

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
      const response: ResearchResponse = {
        live: true,
        companyName,
        revenueEur: null,
        profitEur: null,
        totalFte: null,
        avgRevenuePerFte: null,
        industryL1: null,
        industrySegment: null,
        avgLoadedCostPerFte: null,
        note: `Couldn't confidently identify "${companyName}" — enter the figures below yourself.`,
      };
      return NextResponse.json(response);
    }

    // Only trust industry/segment values that exactly match our taxonomy — otherwise leave blank
    // rather than feeding the UI a value its dropdown doesn't recognize.
    const validL1 = L1_INDUSTRIES.some((l1) => l1.name === parsed.industryL1);
    const validSegment = INDUSTRY_LIST.some(
      (s) => s.l2Name === parsed.industrySegment && s.l1Name === parsed.industryL1
    );

    const response: ResearchResponse = {
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
    return NextResponse.json(response);
  } catch (error) {
    console.error('Research API error:', error);
    const message = error instanceof Anthropic.APIError ? error.message : 'Research request failed';
    const response: ResearchResponse = {
      live: false,
      companyName,
      revenueEur: null,
      profitEur: null,
      totalFte: null,
      avgRevenuePerFte: null,
      industryL1: null,
      industrySegment: null,
      avgLoadedCostPerFte: null,
      note: `Research connector error: ${message}. Enter the figures below yourself.`,
    };
    return NextResponse.json(response, { status: 200 });
  }
}
