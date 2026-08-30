'use client';

import type { AssessmentResult, CompanyInput } from '@/lib/types';
import ReportContent from './ReportContent';
import ExportPdfButton from './ExportPdfButton';
import { formatEur } from '@/lib/format';

export default function ResultsStep({
  input,
  result,
  onBack,
  onRestart,
}: {
  input: CompanyInput;
  result: AssessmentResult;
  onBack: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4 print-hide">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{input.companyName} — AI Opportunity Assessment</h2>
          <p className="mt-1 text-sm text-slate-500">
            {input.industryL1} · {input.industrySegment} · {formatEur(input.revenueEur, { compact: true })} revenue
          </p>
        </div>
        <div className="flex gap-3">
          <ExportPdfButton input={input} result={result} />
        </div>
      </div>

      <div className="mt-6">
        <ReportContent input={input} result={result} />
      </div>

      <div className="mt-8 flex gap-3 print-hide">
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to FTE mapping
        </button>
        <button
          onClick={onRestart}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Start a new assessment
        </button>
      </div>
    </div>
  );
}
