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
}

export interface Parameters {
  totalCostPerAiEmployeeEur: number;
  implementationCostPctOfEmployeeCost: number;
  contributionMarginOnIncrementalRevenuePct: number;
  strategicImportanceWeightingPct: number;
  implementationWindowMonths: number;
  implementationDurationPerWaveMonths: number;
  numberOfWaves: number;
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
