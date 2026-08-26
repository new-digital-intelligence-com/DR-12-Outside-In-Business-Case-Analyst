'use client';

import { useMemo, useState } from 'react';
import { seedFunctionAssumptions, computeAssessment } from '@/lib/calc';
import { DEFAULT_PARAMETERS } from '@/data/model';
import type { CompanyInput, FunctionAssumption, Parameters } from '@/lib/types';
import Stepper from '@/components/Stepper';
import CompanyStep from '@/components/CompanyStep';
import ResearchStep from '@/components/ResearchStep';
import FteMappingStep from '@/components/FteMappingStep';
import ResultsStep from '@/components/ResultsStep';

const EMPTY_INPUT: CompanyInput = {
  companyName: '',
  revenueEur: 0,
  profitEur: 0,
  totalFte: 0,
  avgRevenuePerFte: 0,
  industryL1: '',
  industrySegment: '',
  avgLoadedCostPerFte: 0,
  researched: false,
};

type Step = 0 | 1 | 2 | 3;

export default function AssessmentWizard() {
  const [step, setStep] = useState<Step>(0);
  const [input, setInput] = useState<CompanyInput>(EMPTY_INPUT);
  const [assumptions, setAssumptions] = useState<FunctionAssumption[]>([]);
  const [parameters, setParameters] = useState<Parameters>(DEFAULT_PARAMETERS);

  const result = useMemo(() => {
    if (step < 3 || assumptions.length === 0) return null;
    return computeAssessment(input, assumptions, parameters);
  }, [step, input, assumptions, parameters]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="print-hide border-b border-slate-200 bg-white">
        <Stepper current={step} />
      </div>

      <main className="flex-1 px-4 py-8">
        {step === 0 && (
          <CompanyStep
            initialName={input.companyName}
            onNext={(name) => {
              setInput({ ...input, companyName: name });
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
          <ResearchStep
            input={input}
            onBack={() => setStep(0)}
            onNext={(updated) => {
              setInput(updated);
              setAssumptions(seedFunctionAssumptions(updated));
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <FteMappingStep
            assumptions={assumptions}
            parameters={parameters}
            totalFte={input.totalFte || assumptions.reduce((a, f) => a + f.fteCount, 0)}
            onBack={() => setStep(1)}
            onNext={(rows, params) => {
              setAssumptions(rows);
              setParameters(params);
              setStep(3);
            }}
          />
        )}

        {step === 3 && result && (
          <ResultsStep
            input={input}
            result={result}
            onBack={() => setStep(2)}
            onRestart={() => {
              setInput(EMPTY_INPUT);
              setAssumptions([]);
              setParameters(DEFAULT_PARAMETERS);
              setStep(0);
            }}
          />
        )}
      </main>
    </div>
  );
}
