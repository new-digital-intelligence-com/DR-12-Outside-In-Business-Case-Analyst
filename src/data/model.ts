import raw from './model-data.json';
import type { FunctionTaxonomy, FteDefault, IndustrySegment, Parameters } from '@/lib/types';

interface ModelData {
  functions: FunctionTaxonomy[];
  fteDefaults: Record<string, FteDefault>;
  industryList: { l1Code: string | number; l1Name: string; l2Code: string | number; l2Name: string }[];
  industryFteProfile: Record<string, Record<string, number>>;
  sampleInput: {
    revenueEur: number;
    profitEur: number;
    totalFte: number;
    avgRevenuePerFte: number;
    industry: string;
    industrySegment: string;
    avgLoadedCostPerFte: number;
  };
  parameters: {
    totalCostPerAiEmployeeEur: number;
    implementationCostPctOfEmployeeCost: number;
    contributionMarginOnIncrementalRevenuePct: number;
    strategicImportanceWeightingPct: number;
  };
  implementationParameters: {
    implementationWindowMonths: number;
    implementationDurationPerWaveMonths: number;
    numberOfWaves: number;
  };
}

const data = raw as ModelData;

export const FUNCTIONS: FunctionTaxonomy[] = data.functions;
export const FTE_DEFAULTS: Record<string, FteDefault> = data.fteDefaults;
export const INDUSTRY_LIST: IndustrySegment[] = data.industryList.map((s) => ({
  l1Code: String(s.l1Code),
  l1Name: s.l1Name,
  l2Code: String(s.l2Code),
  l2Name: s.l2Name,
}));
export const INDUSTRY_FTE_PROFILE: Record<string, Record<string, number>> = data.industryFteProfile;
export const SAMPLE_INPUT = data.sampleInput;

export const DEFAULT_PARAMETERS: Parameters = {
  totalCostPerAiEmployeeEur: data.parameters.totalCostPerAiEmployeeEur,
  implementationCostPctOfEmployeeCost: data.parameters.implementationCostPctOfEmployeeCost,
  contributionMarginOnIncrementalRevenuePct: data.parameters.contributionMarginOnIncrementalRevenuePct,
  strategicImportanceWeightingPct: data.parameters.strategicImportanceWeightingPct,
  implementationWindowMonths: data.implementationParameters.implementationWindowMonths,
  implementationDurationPerWaveMonths: data.implementationParameters.implementationDurationPerWaveMonths,
  numberOfWaves: data.implementationParameters.numberOfWaves,
};

export const L1_INDUSTRIES: { code: string; name: string }[] = Array.from(
  new Map(INDUSTRY_LIST.map((s) => [s.l1Code, { code: s.l1Code, name: s.l1Name }])).values()
);

export function segmentsForIndustry(l1Name: string): IndustrySegment[] {
  return INDUSTRY_LIST.filter((s) => s.l1Name === l1Name);
}

export function pctFteFor(l2Code: string, industrySegment: string): number {
  const fromProfile = INDUSTRY_FTE_PROFILE[industrySegment]?.[l2Code];
  if (fromProfile !== undefined) return fromProfile;
  return FTE_DEFAULTS[l2Code]?.genericFteShare ?? 0;
}
