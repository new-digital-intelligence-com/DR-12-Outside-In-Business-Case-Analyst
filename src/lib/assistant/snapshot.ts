import { DEFAULT_PARAMETERS, FUNCTIONS, INDUSTRY_LIST, L1_INDUSTRIES, segmentsForIndustry } from '@/data/model';
import { computeAssessment, effectiveTotalFte, seedFunctionAssumptions, totalFteCalculated } from '@/lib/calc';
import type {
  AiEmployeeLinks,
  AiEmployeeSummary,
  AssessmentResult,
  CompanyCandidate,
  CompanyDataSource,
  CompanyInput,
  FunctionAssumption,
  Parameters,
} from '@/lib/types';

/*
 * The assessment the assistant is grounded on. The browser holds the wizard's state (nothing is
 * stored server-side), so it sends that state as `context`; this file checks and clamps every
 * field, then recomputes the business case with the app's own calc (computeAssessment) instead of
 * trusting numbers from the client, and adds the NDI AI Employees from getAiEmployeeLinks().
 */

export const MAX_SNAPSHOT_CHARS = 40_000;

export const VIEWS = ['company', 'research', 'fte', 'results'] as const;
export type AssistantView = (typeof VIEWS)[number];

const STEP_NAMES: Record<AssistantView, string> = {
  company: '1. Company',
  research: '2. Research (company profile)',
  fte: '3. FTE Mapping',
  results: '4. Results',
};

const RESEARCH_PHASES = ['choose', 'loading', 'candidates', 'form'] as const;
type ResearchPhase = (typeof RESEARCH_PHASES)[number];

const PHASE_MEANING: Record<ResearchPhase, string> = {
  choose: 'The user is choosing where the figures come from: saved research, a live web search, or example data.',
  loading: 'A research request is running (a live web search can take a minute or two).',
  candidates: 'The search found companies matching the name; the user must pick the right one.',
  form: 'The figures form is shown; the user can check and edit every figure before continuing.',
};

const SOURCE_LABEL: Record<CompanyDataSource['kind'], string> = {
  research: 'AI research (live web search)',
  saved: 'Saved research from an earlier search',
  example: 'Illustrative example data (a sample manufacturing company, NOT this company)',
  manual: 'Typed in manually by the user',
};

/** What the browser sends as `context` (every field optional and untrusted). */
export interface AssistantContext {
  path?: string;
  view?: AssistantView;
  company?: Partial<CompanyInput> | null;
  research?: { phase?: string; candidates?: CompanyCandidate[] } | null;
  assumptions?: FunctionAssumption[] | null;
  parameters?: Partial<Parameters> | null;
  /** true while the FTE mapping is an unconfirmed draft on the FTE Mapping step */
  draft?: boolean;
}

interface CleanContext {
  path: string;
  view: AssistantView;
  company: CompanyInput | null;
  research: { phase: ResearchPhase | null; candidates: CompanyCandidate[] } | null;
  assumptions: FunctionAssumption[] | null;
  parameters: Parameters;
  draft: boolean;
}

// ---------------------------------------------------------------------------------------------
// Sanitizing

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // Control characters (except tab/newline) never belong in these fields.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

function num(value: unknown, min: number, max: number, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function cleanCandidate(value: unknown): CompanyCandidate | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const c = value as Record<string, unknown>;
  const name = text(c.name, 200);
  if (!name) return undefined;
  const domain = text(c.domain, 200);
  return {
    name,
    location: text(c.location, 200),
    domain: domain || null,
    description: text(c.description, 500),
  };
}

function cleanSource(value: unknown): CompanyDataSource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const s = value as Record<string, unknown>;
  const kinds: CompanyDataSource['kind'][] = ['research', 'saved', 'example', 'manual'];
  if (!kinds.includes(s.kind as CompanyDataSource['kind'])) return undefined;
  const note = text(s.note, 1500);
  const savedAt = text(s.savedAt, 40);
  return {
    kind: s.kind as CompanyDataSource['kind'],
    note: note || null,
    ...(savedAt ? { savedAt } : {}),
    ...(cleanCandidate(s.candidate) ? { candidate: cleanCandidate(s.candidate) } : {}),
  };
}

function cleanCompany(value: unknown): CompanyInput | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  const industryL1 = L1_INDUSTRIES.some((i) => i.name === c.industryL1) ? (c.industryL1 as string) : '';
  const industrySegment =
    industryL1 && segmentsForIndustry(industryL1).some((s) => s.l2Name === c.industrySegment)
      ? (c.industrySegment as string)
      : '';
  const company: CompanyInput = {
    companyName: text(c.companyName, 120),
    revenueEur: num(c.revenueEur, 0, 1e13),
    profitEur: num(c.profitEur, -1e13, 1e13),
    totalFte: num(c.totalFte, 0, 1e8),
    avgRevenuePerFte: num(c.avgRevenuePerFte, 0, 1e9),
    industryL1,
    industrySegment,
    avgLoadedCostPerFte: num(c.avgLoadedCostPerFte, 0, 1e8),
    researched: c.researched === true,
  };
  const source = cleanSource(c.source);
  if (source) company.source = source;
  return company.companyName || company.revenueEur > 0 || source ? company : null;
}

function cleanParameters(value: unknown): Parameters {
  const p = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_PARAMETERS;
  return {
    totalCostPerAiEmployeeEur: num(p.totalCostPerAiEmployeeEur, 0, 1e7, d.totalCostPerAiEmployeeEur),
    implementationCostPctOfEmployeeCost: num(
      p.implementationCostPctOfEmployeeCost,
      0,
      10,
      d.implementationCostPctOfEmployeeCost,
    ),
    contributionMarginOnIncrementalRevenuePct: num(
      p.contributionMarginOnIncrementalRevenuePct,
      0,
      1,
      d.contributionMarginOnIncrementalRevenuePct,
    ),
    strategicImportanceWeightingPct: num(p.strategicImportanceWeightingPct, 0, 1, d.strategicImportanceWeightingPct),
    implementationWindowMonths: Math.round(num(p.implementationWindowMonths, 1, 120, d.implementationWindowMonths)),
    implementationDurationPerWaveMonths: Math.round(
      num(p.implementationDurationPerWaveMonths, 1, 60, d.implementationDurationPerWaveMonths),
    ),
    numberOfWaves: Math.round(num(p.numberOfWaves, 1, 12, d.numberOfWaves)),
    scalingReferenceFte: num(p.scalingReferenceFte, 1, 1e7, d.scalingReferenceFte),
    scalingStepFte: num(p.scalingStepFte, 1, 1e7, d.scalingStepFte),
    scalingGrowthPerStepPct: num(p.scalingGrowthPerStepPct, 0, 1, d.scalingGrowthPerStepPct),
  };
}

/** One row per sub-function, in the app's order; rows the client left out get the benchmark seed. */
function cleanAssumptions(value: unknown, company: CompanyInput, parameters: Parameters): FunctionAssumption[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sent = new Map<string, Record<string, unknown>>();
  for (const item of value.slice(0, FUNCTIONS.length * 2)) {
    if (item && typeof item === 'object' && typeof (item as { l2Code?: unknown }).l2Code === 'string') {
      sent.set((item as { l2Code: string }).l2Code, item as Record<string, unknown>);
    }
  }
  if (!FUNCTIONS.some((f) => sent.has(f.l2Code))) return null;
  const seeded = new Map(seedFunctionAssumptions(company, parameters).map((a) => [a.l2Code, a]));
  return FUNCTIONS.map((f) => {
    const seed = seeded.get(f.l2Code)!;
    const row = sent.get(f.l2Code);
    if (!row) return seed;
    return {
      l2Code: f.l2Code,
      fteCount: num(row.fteCount, 0, 1e7, seed.fteCount),
      pctFte: num(row.pctFte, 0, 1, seed.pctFte),
      aiCapabilityPct: num(row.aiCapabilityPct, 0, 1, seed.aiCapabilityPct),
      strategicImportance: num(row.strategicImportance, -1, 1, seed.strategicImportance),
      revenueLeverageFactor: num(row.revenueLeverageFactor, 0, 10, seed.revenueLeverageFactor),
    };
  });
}

export function sanitizeContext(value: unknown): CleanContext {
  const c = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const view = VIEWS.includes(c.view as AssistantView) ? (c.view as AssistantView) : 'company';
  const company = cleanCompany(c.company);
  const parameters = cleanParameters(c.parameters);
  let research: CleanContext['research'] = null;
  if (c.research && typeof c.research === 'object') {
    const r = c.research as Record<string, unknown>;
    const phase = RESEARCH_PHASES.includes(r.phase as ResearchPhase) ? (r.phase as ResearchPhase) : null;
    const candidates = Array.isArray(r.candidates)
      ? r.candidates.slice(0, 5).map(cleanCandidate).filter((x): x is CompanyCandidate => x !== undefined)
      : [];
    research = { phase, candidates };
  }
  const assumptions =
    company && (view === 'fte' || view === 'results') ? cleanAssumptions(c.assumptions, company, parameters) : null;
  return {
    path: text(c.path, 200) || '/',
    view,
    company,
    research,
    assumptions,
    parameters,
    draft: c.draft === true,
  };
}

// ---------------------------------------------------------------------------------------------
// Building the snapshot

const eur = (v: number) => Math.round(v);
const fte = (v: number) => Math.round(v * 10) / 10;
/** Fractions (0.35) become percentages (35), one decimal. */
const pct = (v: number) => Math.round(v * 1000) / 10;

function paybackMonths(result: AssessmentResult): number | null {
  const { totals } = result;
  if (!(totals.totalAnnualValueEur > 0)) return null;
  return Math.round((totals.implementationCostEur / (totals.totalAnnualValueEur / 12)) * 10) / 10;
}

function monthlySummary(result: AssessmentResult) {
  const m = result.monthly;
  let trough = { month: 0, cumulativeEur: 0 };
  for (const p of m) if (p.cumulativeNetPnLEur < trough.cumulativeEur) trough = { month: p.month, cumulativeEur: p.cumulativeNetPnLEur };
  const firstPositive = m.find((p) => p.month > trough.month && p.cumulativeNetPnLEur > 0);
  const at = (month: number) => m.find((p) => p.month === month);
  return {
    horizonMonths: m.length,
    firstMonthWithFunctionsLive: m.find((p) => p.functionsLive > 0)?.month ?? null,
    deepestCumulativeInvestment: { month: trough.month, cumulativeNetPnLEur: eur(trough.cumulativeEur) },
    cumulativeBreakEvenMonth: firstPositive?.month ?? null,
    cumulativeNetPnLEurAt: {
      month12: eur(at(12)?.cumulativeNetPnLEur ?? 0),
      month24: eur(at(24)?.cumulativeNetPnLEur ?? 0),
      month36: eur(at(36)?.cumulativeNetPnLEur ?? 0),
    },
    month36RunRate: at(36)
      ? {
          grossCostSavingsEur: eur(at(36)!.grossCostSavingsEur),
          marginOnRevenueUpliftEur: eur(at(36)!.marginOnRevenueUpliftEur),
          aiRunningCostEur: eur(at(36)!.aiRunningCostEur),
          netPnLEur: eur(at(36)!.netPnLEur),
        }
      : null,
    netPnLEurByMonth: m.map((p) => eur(p.netPnLEur)),
    cumulativeNetPnLEurByMonth: m.map((p) => eur(p.cumulativeNetPnLEur)),
  };
}

function employeeRef(e: AiEmployeeSummary) {
  return { code: e.code, name: e.name };
}

export interface SnapshotOptions {
  maxChars?: number;
}

/** The grounding data as a JSON string of at most maxChars characters. */
export function buildSnapshot(
  rawContext: unknown,
  links: AiEmployeeLinks | null,
  { maxChars = MAX_SNAPSHOT_CHARS }: SnapshotOptions = {},
): string {
  const ctx = sanitizeContext(rawContext);
  const { company, assumptions, parameters } = ctx;
  const byFunction = links?.byFunction ?? {};
  const l1Names = new Map(FUNCTIONS.map((f) => [f.l1Code, f.l1Name]));

  const snapshot: Record<string, unknown> = {
    units:
      'EUR amounts are euros (per year unless a field says otherwise). Fields ending in Pct are percentages ' +
      '(35 = 35%). FTE = full-time equivalents. strategicImportancePct runs from -100 to +100.',
    app: {
      currentStep: STEP_NAMES[ctx.view],
      path: ctx.path,
    },
  };

  if (company) {
    const usedFte = effectiveTotalFte(company);
    snapshot.company = {
      companyName: company.companyName || null,
      revenueEur: eur(company.revenueEur),
      profitEur: eur(company.profitEur),
      totalFteEntered: fte(company.totalFte),
      avgRevenuePerFteEur: eur(company.avgRevenuePerFte),
      totalFteCalculatedFromRevenue: fte(totalFteCalculated(company)),
      totalFteUsedForMapping: fte(usedFte),
      costCalculatedEur: eur(company.revenueEur - company.profitEur),
      avgLoadedCostPerFteEur: eur(company.avgLoadedCostPerFte),
      industry: company.industryL1 || null,
      industrySegment: company.industrySegment || null,
      figuresConfirmed: ctx.view === 'research' ? false : company.researched,
      dataSource: company.source
        ? {
            kind: company.source.kind,
            meaning: SOURCE_LABEL[company.source.kind],
            note: company.source.note,
            savedAt: company.source.savedAt ?? null,
            researchedCompany: company.source.candidate ?? null,
          }
        : null,
      ...(ctx.view === 'research'
        ? { status: 'Draft figures on the Research step; not confirmed until the user continues to FTE Mapping.' }
        : {}),
    };
  }

  if (ctx.view === 'research' && ctx.research) {
    snapshot.research = {
      phase: ctx.research.phase,
      phaseMeaning: ctx.research.phase ? PHASE_MEANING[ctx.research.phase] : null,
      candidates: ctx.research.candidates,
    };
  }

  let result: AssessmentResult | null = null;
  if (company && assumptions && company.revenueEur > 0 && company.avgLoadedCostPerFte > 0) {
    result = computeAssessment(company, assumptions, parameters);
  }

  if (assumptions) {
    snapshot.parameters = {
      totalCostPerAiEmployeeEurPerYear: eur(parameters.totalCostPerAiEmployeeEur),
      implementationCostPctOfAiEmployeeCost: pct(parameters.implementationCostPctOfEmployeeCost),
      contributionMarginOnIncrementalRevenuePct: pct(parameters.contributionMarginOnIncrementalRevenuePct),
      strategicImportanceWeightingPct: pct(parameters.strategicImportanceWeightingPct),
      numberOfWaves: parameters.numberOfWaves,
      implementationDurationPerWaveMonths: parameters.implementationDurationPerWaveMonths,
      implementationWindowMonths: parameters.implementationWindowMonths,
    };
  }

  const usedEmployees = new Map<string, AiEmployeeSummary>();
  /** The AI Employees for a sub-function, remembered for the catalogue section. */
  const employeesFor = (l2Code: string): AiEmployeeSummary[] => {
    const list = byFunction[l2Code] ?? [];
    for (const e of list) usedEmployees.set(e.code, e);
    return list;
  };
  const codesFor = (l2Code: string) => employeesFor(l2Code).map((e) => e.code);

  if (result) {
    const ranked = [...result.functions].sort((a, b) => a.priorityRank - b.priorityRank);
    snapshot.results = {
      status:
        ctx.view === 'results'
          ? 'Calculated: this is what the Results step shows.'
          : 'Preview from the FTE mapping as currently edited; the app shows it after "Calculate business case".',
      totals: {
        totalAnnualValueEur: eur(result.totals.totalAnnualValueEur),
        netCostSavingsEur: eur(result.totals.netAnnualValueEur),
        grossAnnualSavingEur: eur(result.totals.grossAnnualSavingEur),
        aiEmployeeCostEur: eur(result.totals.aiEmployeeCostEur),
        revenueUpliftEur: eur(result.totals.revenueUpliftEur),
        marginOnRevenueUpliftEur: eur(result.totals.marginOnRevenueUpliftEur),
        oneTimeImplementationCostEur: eur(result.totals.implementationCostEur),
        approxPaybackMonths: paybackMonths(result),
        mappedFte: fte(result.totals.fteCount),
        targetAiFte: fte(result.totals.targetAiFte),
      },
      waves: result.waves.map((w) => ({
        wave: w.wave,
        functions: w.functionCount,
        startMonth: w.startMonth,
        goLiveMonth: w.goLiveMonth,
        targetAiFte: fte(w.targetAiFte),
        totalAnnualValueEur: eur(w.totalAnnualValueEur),
        netCostSavingsEur: eur(w.netAnnualValueEur),
        marginOnRevenueUpliftEur: eur(w.marginOnRevenueUpliftEur),
        implementationCostEur: eur(w.implementationCostEur),
        topFunctions: ranked.filter((f) => f.wave === w.wave).slice(0, 3).map((f) => f.l2Name),
      })),
      monthly: monthlySummary(result),
      top10PriorityFunctions: ranked.slice(0, 10).map((f) => ({
        rank: f.priorityRank,
        l2Code: f.l2Code,
        function: f.l2Name,
        l1Function: f.l1Name,
        wave: f.wave,
        implStartMonth: f.implStartMonth,
        goLiveMonth: f.goLiveMonth,
        fte: fte(f.fteCount),
        aiCapabilityPct: pct(f.aiCapabilityPct),
        strategicImportancePct: pct(f.strategicImportance),
        targetAiFte: fte(f.targetAiFte),
        grossAnnualSavingEur: eur(f.grossAnnualSavingEur),
        aiEmployeeCostEur: eur(f.aiEmployeeCostEur),
        netCostSavingsEur: eur(f.netAnnualValueEur),
        revenueUpliftEur: eur(f.revenueUpliftEur),
        marginOnRevenueUpliftEur: eur(f.marginOnRevenueUpliftEur),
        totalAnnualValueEur: eur(f.totalAnnualValueEur),
        priorityScore: eur(f.priorityScore),
        implementationCostEur: eur(f.implementationCostEur),
        ndiAiEmployees: employeesFor(f.l2Code).map(employeeRef),
      })),
      fteMappingByL1: [...new Map(FUNCTIONS.map((f) => [f.l1Code, f.l1Name]))].map(([l1Code, l1Name]) => {
        const fns = result!.functions.filter((f) => f.l1Code === l1Code);
        return {
          l1Code,
          l1Function: l1Name,
          subFunctions: fns.length,
          fte: fte(fns.reduce((a, f) => a + f.fteCount, 0)),
          targetAiFte: fte(fns.reduce((a, f) => a + f.targetAiFte, 0)),
          totalAnnualValueEur: eur(fns.reduce((a, f) => a + f.totalAnnualValueEur, 0)),
        };
      }),
      allSubFunctions: {
        columns: [
          'rank',
          'l2Code',
          'function',
          'l1Code',
          'fte',
          'aiCapabilityPct',
          'strategicImportancePct',
          'targetAiFte',
          'totalAnnualValueEur',
          'wave',
          'ndiAiEmployeeCodes',
        ],
        rows: ranked.map((f) => [
          f.priorityRank,
          f.l2Code,
          f.l2Name,
          f.l1Code,
          fte(f.fteCount),
          pct(f.aiCapabilityPct),
          pct(f.strategicImportance),
          fte(f.targetAiFte),
          eur(f.totalAnnualValueEur),
          f.wave,
          codesFor(f.l2Code),
        ]),
      },
    };
  } else {
    // Before the business case: the 65 sub-functions the FTE mapping will cover, and their NDI AI Employees.
    snapshot.subFunctionsAndNdiAiEmployees = {
      note: 'No business case yet: it is calculated after the Research and FTE Mapping steps.',
      columns: ['l2Code', 'function', 'l1Code', 'ndiAiEmployeeCodes'],
      rows: FUNCTIONS.map((f) => [f.l2Code, f.l2Name, f.l1Code, codesFor(f.l2Code)]),
    };
  }

  snapshot.ndiAiEmployeeCatalogue = links
    ? {
        catalogVersion: links.catalogVersion,
        source: links.source,
        note: 'NDI AI Employees matched to the sub-functions, best fit first (public fields only).',
        employees: [...usedEmployees.values()]
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((e) => ({ code: e.code, name: e.name, category: e.category, tagline: e.tagline })),
      }
    : { note: 'The NDI AI Employee catalogue could not be loaded for this answer.' };

  snapshot.reference = {
    l1Functions: [...l1Names].map(([code, name]) => ({ code, name })),
    industries: L1_INDUSTRIES.map((i) => ({
      industry: i.name,
      segments: INDUSTRY_LIST.filter((s) => s.l1Code === i.code).map((s) => s.l2Name),
    })),
  };

  return fit(snapshot, maxChars);
}

/** JSON with "<" escaped, so no text inside can close the <assessment_data> tag in the prompt. */
function stringify(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Drops the least important detail until the JSON fits the budget. */
function fit(snapshot: Record<string, unknown>, maxChars: number): string {
  const steps: ((s: Record<string, unknown>) => void)[] = [
    (s) => delete (s.reference as Record<string, unknown> | undefined)?.industries,
    (s) => {
      const cat = s.ndiAiEmployeeCatalogue as { employees?: { tagline?: string }[] } | undefined;
      cat?.employees?.forEach((e) => delete e.tagline);
    },
    (s) => {
      const r = s.results as { monthly?: Record<string, unknown> } | undefined;
      if (r?.monthly) delete r.monthly.netPnLEurByMonth;
    },
    (s) => {
      const r = s.results as { allSubFunctions?: { rows: unknown[] } } | undefined;
      if (r?.allSubFunctions) r.allSubFunctions.rows = r.allSubFunctions.rows.slice(0, 30);
    },
    (s) => delete s.subFunctionsAndNdiAiEmployees,
    (s) => delete (s.results as Record<string, unknown> | undefined)?.allSubFunctions,
    (s) => delete s.ndiAiEmployeeCatalogue,
    (s) => delete s.reference,
    (s) => {
      const c = s.company as { dataSource?: { note?: string | null } } | undefined;
      if (c?.dataSource?.note) c.dataSource.note = c.dataSource.note.slice(0, 300);
    },
  ];
  let json = stringify(snapshot);
  for (const step of steps) {
    if (json.length <= maxChars) break;
    step(snapshot);
    json = stringify(snapshot);
  }
  if (json.length > maxChars) {
    json = stringify({ units: snapshot.units, app: snapshot.app, note: 'Assessment data too large to include.' });
  }
  return json;
}
