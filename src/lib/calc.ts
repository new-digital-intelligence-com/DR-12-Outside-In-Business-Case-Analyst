import { FUNCTIONS, FTE_DEFAULTS, pctFteFor, DEFAULT_PARAMETERS } from '@/data/model';
import type {
  CompanyInput,
  Parameters,
  FunctionAssumption,
  FunctionResult,
  WaveSummary,
  MonthlyPoint,
  AssessmentResult,
} from './types';

const MONTHLY_HORIZON = 36;

export function totalFteCalculated(input: Pick<CompanyInput, 'revenueEur' | 'avgRevenuePerFte'>): number {
  if (!input.avgRevenuePerFte) return 0;
  return input.revenueEur / input.avgRevenuePerFte;
}

export function effectiveTotalFte(input: CompanyInput): number {
  return input.totalFte > 0 ? input.totalFte : totalFteCalculated(input);
}

/** Capped functions hold the absolute headcount of a scalingReferenceFte-sized company (growing
 * slowly with size); linear functions absorb whatever % FTE that frees up, so the total stays 100%. */
function scalingFactor(
  totalFte: number,
  scalingType: 'capped' | 'linear',
  cappedShareOfBasePct: number,
  parameters: Parameters
): number {
  if (totalFte <= 0) return 1;
  const cappedFactor =
    (Math.min(totalFte, parameters.scalingReferenceFte) / totalFte) *
    (1 +
      (parameters.scalingGrowthPerStepPct * Math.max(0, totalFte - parameters.scalingReferenceFte)) /
        parameters.scalingStepFte);
  if (scalingType === 'capped') return cappedFactor;
  if (cappedShareOfBasePct >= 1) return 1;
  return (1 - cappedFactor * cappedShareOfBasePct) / (1 - cappedShareOfBasePct);
}

/** Seeds the 65 editable per-function assumptions from industry benchmarks — this is what the
 * user then confirms or changes on the FTE Mapping step. */
export function seedFunctionAssumptions(
  input: CompanyInput,
  parameters: Parameters = DEFAULT_PARAMETERS
): FunctionAssumption[] {
  const totalFte = effectiveTotalFte(input);
  const cappedShareOfBasePct = sum(
    FUNCTIONS.filter((f) => FTE_DEFAULTS[f.l2Code]?.scalingType === 'capped'),
    (f) => pctFteFor(f.l2Code, input.industrySegment)
  );

  return FUNCTIONS.map((f) => {
    const defaults = FTE_DEFAULTS[f.l2Code];
    const basePctFte = pctFteFor(f.l2Code, input.industrySegment);
    const factor = scalingFactor(totalFte, defaults?.scalingType ?? 'linear', cappedShareOfBasePct, parameters);
    const pctFte = basePctFte * factor;
    return {
      l2Code: f.l2Code,
      pctFte,
      fteCount: totalFte * pctFte,
      aiCapabilityPct: defaults?.aiCapability ?? 0.5,
      strategicImportance: 0,
      revenueLeverageFactor: defaults?.revenueLeverageFactor ?? 0,
    };
  });
}

export function computeAssessment(
  input: CompanyInput,
  assumptions: FunctionAssumption[],
  parameters: Parameters = DEFAULT_PARAMETERS
): AssessmentResult {
  const byCode = new Map(assumptions.map((a) => [a.l2Code, a]));

  const partial = FUNCTIONS.map((f) => {
    const a = byCode.get(f.l2Code)!;
    const targetAiFte = a.fteCount * a.aiCapabilityPct;
    const grossAnnualSavingEur = targetAiFte * input.avgLoadedCostPerFte;
    const aiEmployeeCostEur = targetAiFte * parameters.totalCostPerAiEmployeeEur;
    const implementationCostEur = aiEmployeeCostEur * parameters.implementationCostPctOfEmployeeCost;
    const netAnnualValueEur = grossAnnualSavingEur - aiEmployeeCostEur;
    const revenueImpactShare = a.pctFte * a.aiCapabilityPct * a.revenueLeverageFactor;
    const revenueUpliftEur = revenueImpactShare * input.revenueEur;
    const marginOnRevenueUpliftEur = revenueUpliftEur * parameters.contributionMarginOnIncrementalRevenuePct;
    const totalAnnualValueEur = netAnnualValueEur + marginOnRevenueUpliftEur;
    const priorityScore = totalAnnualValueEur * (1 + parameters.strategicImportanceWeightingPct * a.strategicImportance);
    return { f, a, targetAiFte, grossAnnualSavingEur, aiEmployeeCostEur, implementationCostEur, netAnnualValueEur, revenueUpliftEur, marginOnRevenueUpliftEur, totalAnnualValueEur, priorityScore };
  });

  // Rank by priority score, descending (ties broken by original order, matching Excel's RANK+COUNTIF tie-break)
  const ranked = [...partial].sort((x, y) => y.priorityScore - x.priorityScore);
  const rankByCode = new Map<string, number>();
  ranked.forEach((p, i) => rankByCode.set(p.f.l2Code, i + 1));

  const n = FUNCTIONS.length;
  const functions: FunctionResult[] = partial.map((p) => {
    const priorityRank = rankByCode.get(p.f.l2Code)!;
    const wave = Math.ceil((priorityRank * parameters.numberOfWaves) / n);
    const implStartMonth = (wave - 1) * parameters.implementationDurationPerWaveMonths + 1;
    const goLiveMonth = wave * parameters.implementationDurationPerWaveMonths;
    return {
      ...p.f,
      ...p.a,
      targetAiFte: p.targetAiFte,
      grossAnnualSavingEur: p.grossAnnualSavingEur,
      aiEmployeeCostEur: p.aiEmployeeCostEur,
      implementationCostEur: p.implementationCostEur,
      netAnnualValueEur: p.netAnnualValueEur,
      revenueUpliftEur: p.revenueUpliftEur,
      marginOnRevenueUpliftEur: p.marginOnRevenueUpliftEur,
      totalAnnualValueEur: p.totalAnnualValueEur,
      priorityScore: p.priorityScore,
      priorityRank,
      wave,
      implStartMonth,
      goLiveMonth,
    };
  });

  const waves: WaveSummary[] = [];
  for (let w = 1; w <= parameters.numberOfWaves; w++) {
    const inWave = functions.filter((f) => f.wave === w);
    if (inWave.length === 0) continue;
    waves.push({
      wave: w,
      functionCount: inWave.length,
      targetAiFte: sum(inWave, (f) => f.targetAiFte),
      grossAnnualSavingEur: sum(inWave, (f) => f.grossAnnualSavingEur),
      aiEmployeeCostEur: sum(inWave, (f) => f.aiEmployeeCostEur),
      netAnnualValueEur: sum(inWave, (f) => f.netAnnualValueEur),
      implementationCostEur: sum(inWave, (f) => f.implementationCostEur),
      startMonth: (w - 1) * parameters.implementationDurationPerWaveMonths + 1,
      goLiveMonth: w * parameters.implementationDurationPerWaveMonths,
      revenueUpliftEur: sum(inWave, (f) => f.revenueUpliftEur),
      marginOnRevenueUpliftEur: sum(inWave, (f) => f.marginOnRevenueUpliftEur),
      totalAnnualValueEur: sum(inWave, (f) => f.totalAnnualValueEur),
    });
  }

  const monthly: MonthlyPoint[] = [];
  let cumulative = 0;
  for (let month = 1; month <= MONTHLY_HORIZON; month++) {
    const live = waves.filter((w) => w.goLiveMonth < month);
    const inProgress = waves.filter((w) => w.startMonth <= month && month <= w.goLiveMonth);

    const functionsLive = sum(live, (w) => w.functionCount);
    const revenueUpliftEur = sum(live, (w) => w.revenueUpliftEur) / 12;
    const marginOnRevenueUpliftEur = sum(live, (w) => w.marginOnRevenueUpliftEur) / 12;
    const grossCostSavingsEur = sum(live, (w) => w.grossAnnualSavingEur) / 12;
    const aiRunningCostEur = -sum(live, (w) => w.aiEmployeeCostEur) / 12;
    const implementationCostEur =
      -sum(inProgress, (w) => w.implementationCostEur) / parameters.implementationDurationPerWaveMonths;
    const netPnLEur = marginOnRevenueUpliftEur + grossCostSavingsEur + aiRunningCostEur + implementationCostEur;
    cumulative += netPnLEur;

    monthly.push({
      month,
      functionsLive,
      revenueUpliftEur,
      marginOnRevenueUpliftEur,
      grossCostSavingsEur,
      aiRunningCostEur,
      implementationCostEur,
      netPnLEur,
      cumulativeNetPnLEur: cumulative,
    });
  }

  const totals = {
    fteCount: sum(functions, (f) => f.fteCount),
    targetAiFte: sum(functions, (f) => f.targetAiFte),
    grossAnnualSavingEur: sum(functions, (f) => f.grossAnnualSavingEur),
    aiEmployeeCostEur: sum(functions, (f) => f.aiEmployeeCostEur),
    implementationCostEur: sum(functions, (f) => f.implementationCostEur),
    netAnnualValueEur: sum(functions, (f) => f.netAnnualValueEur),
    revenueUpliftEur: sum(functions, (f) => f.revenueUpliftEur),
    marginOnRevenueUpliftEur: sum(functions, (f) => f.marginOnRevenueUpliftEur),
    totalAnnualValueEur: sum(functions, (f) => f.totalAnnualValueEur),
  };

  return {
    totalFteCalculated: totalFteCalculated(input),
    costCalculatedEur: input.revenueEur - input.profitEur,
    functions,
    waves,
    monthly,
    totals,
  };
}

function sum<T>(arr: T[], f: (t: T) => number): number {
  return arr.reduce((acc, t) => acc + f(t), 0);
}
