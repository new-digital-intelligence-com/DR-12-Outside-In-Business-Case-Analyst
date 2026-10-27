export interface FunctionTaxonomy {
  l1Code: string;
  l1Name: string;
  l1Definition: string;
  l2Code: string;
  l2Name: string;
  l2Definition: string;
  exampleTitles: string;
}

export interface FteDefault {
  aiCapability: number;
  revenueLeverageFactor: number;
  genericFteShare: number;
  /** 'capped' functions hold the absolute headcount of a scalingReferenceFte-sized company (growing
   * slowly with size); 'linear' functions absorb the % FTE that scaling frees up, so the total stays 100%. */
  scalingType: 'capped' | 'linear';
}

export interface IndustrySegment {
  l1Code: string;
  l1Name: string;
  l2Code: string;
  l2Name: string;
}

export interface CompanyInput {
  companyName: string;
  revenueEur: number;
  profitEur: number;
  totalFte: number;
  avgRevenuePerFte: number;
  industryL1: string;
  industrySegment: string;
  avgLoadedCostPerFte: number;
  /** true once the AI research step has populated these fields */
  researched: boolean;
  /** Where the figures came from. Unset until the company profile step is done. */
  source?: CompanyDataSource;
}

export interface CompanyDataSource {
  /** 'research': a new web search. 'saved': research saved from an earlier search. 'example':
   * illustrative figures from a sample company. 'manual': typed in by the user. */
  kind: 'research' | 'saved' | 'example' | 'manual';
  /** What the profile step said about the figures: research notes, or why they're missing. */
  note: string | null;
  /** For 'saved': when that research ran (ISO date). */
  savedAt?: string;
  /** The company that was researched, so the search can be run again. */
  candidate?: CompanyCandidate;
}

/** A real company that matches the typed name, found by the identification search. */
export interface CompanyCandidate {
  name: string;
  location: string;
  domain: string | null;
  description: string;
}

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
  /** Set when this is saved research rather than a new web search: when that research ran (ISO). */
  savedAt?: string;
}

/** One line of /api/research's newline-delimited JSON stream. */
export type ResearchStreamEvent =
  | { type: 'heartbeat'; elapsedMs: number }
  /** savedAt: set when these matches come from an earlier, saved search. */
  | { type: 'candidates'; data: CompanyCandidate[]; savedAt?: string }
  | { type: 'result'; data: ResearchResponse };

/** A company with saved research, as suggested while typing a company name (/api/research/saved). */
export interface SavedCompany {
  candidate: CompanyCandidate;
  /** When its research ran (ISO). */
  savedAt: string;
  /** True when one of its names is the searched name, not just a name starting with it. */
  exact: boolean;
}

export interface Parameters {
  totalCostPerAiEmployeeEur: number;
  implementationCostPctOfEmployeeCost: number;
  contributionMarginOnIncrementalRevenuePct: number;
  strategicImportanceWeightingPct: number;
  implementationWindowMonths: number;
  implementationDurationPerWaveMonths: number;
  numberOfWaves: number;
  /** Company size (FTE) below which no scaling is applied. */
  scalingReferenceFte: number;
  /** Capped functions' absolute headcount grows by scalingGrowthPerStepPct per this many FTE past scalingReferenceFte. */
  scalingStepFte: number;
  scalingGrowthPerStepPct: number;
}

/** Per-function editable assumptions, seeded from benchmarks, confirmable/changeable by the user. */
export interface FunctionAssumption {
  l2Code: string;
  fteCount: number;
  pctFte: number;
  aiCapabilityPct: number;
  strategicImportance: number; // -1..1
  revenueLeverageFactor: number;
}

export interface FunctionResult extends FunctionTaxonomy, FunctionAssumption {
  targetAiFte: number;
  grossAnnualSavingEur: number;
  aiEmployeeCostEur: number;
  implementationCostEur: number;
  netAnnualValueEur: number;
  revenueUpliftEur: number;
  marginOnRevenueUpliftEur: number;
  totalAnnualValueEur: number;
  priorityScore: number;
  priorityRank: number;
  wave: number;
  implStartMonth: number;
  goLiveMonth: number;
}

export interface WaveSummary {
  wave: number;
  functionCount: number;
  targetAiFte: number;
  grossAnnualSavingEur: number;
  aiEmployeeCostEur: number;
  netAnnualValueEur: number;
  implementationCostEur: number;
  startMonth: number;
  goLiveMonth: number;
  revenueUpliftEur: number;
  marginOnRevenueUpliftEur: number;
  totalAnnualValueEur: number;
}

export interface MonthlyPoint {
  month: number;
  functionsLive: number;
  revenueUpliftEur: number;
  marginOnRevenueUpliftEur: number;
  grossCostSavingsEur: number;
  aiRunningCostEur: number;
  implementationCostEur: number;
  netPnLEur: number;
  cumulativeNetPnLEur: number;
}

export interface AssessmentResult {
  totalFteCalculated: number;
  costCalculatedEur: number;
  functions: FunctionResult[];
  waves: WaveSummary[];
  monthly: MonthlyPoint[];
  totals: {
    fteCount: number;
    targetAiFte: number;
    grossAnnualSavingEur: number;
    aiEmployeeCostEur: number;
    implementationCostEur: number;
    netAnnualValueEur: number;
    revenueUpliftEur: number;
    marginOnRevenueUpliftEur: number;
    totalAnnualValueEur: number;
  };
}

/** The public face of an NDI AI Employee — safe to send to the browser and print in a report. */
export interface AiEmployeeSummary {
  code: string;
  name: string;
  category: string;
  tagline: string;
  /** Demo video, when NDI has published one. */
  videoUrl: string | null;
}

/** NDI AI Employees matched to each sub-function, as served by /api/ai-employee-links. */
export interface AiEmployeeLinks {
  /** Version of NDI's AI Employees catalogue the links were resolved against. */
  catalogVersion: string;
  /** 'live': from the AI Employees API. 'snapshot': from the copy bundled with the app. */
  source: 'live' | 'snapshot';
  /** Sub-function code (l2Code) → matching AI Employees, best fit first. */
  byFunction: Record<string, AiEmployeeSummary[]>;
}
