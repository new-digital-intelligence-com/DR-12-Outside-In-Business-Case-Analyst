'use client';

import type { AssessmentResult, CompanyInput } from '@/lib/types';
import BusinessCaseSummary from './BusinessCaseSummary';
import PriorityMatrix from './PriorityMatrix';
import WaveTimeline from './WaveTimeline';
import MonthlyChart from './MonthlyChart';
import ExportPdfButton from './ExportPdfButton';
import { formatEur, formatFte, formatPct } from '@/lib/format';

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
  const topFunctions = [...result.functions].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, 10);

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
          <ExportPdfButton />
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-400 print-hide">
        Emailing this PDF isn&apos;t wired up yet — use &quot;Download PDF&quot; (choose &quot;Save as PDF&quot; in
        the print dialog) and send it yourself for now.
      </p>

      <div id="report-root" className="mt-6 space-y-8 bg-slate-50 p-1">
        <div className="hidden print:block">
          <h2 className="text-lg font-semibold text-slate-900">{input.companyName} — AI Opportunity Assessment</h2>
          <p className="mt-1 text-sm text-slate-500">
            {input.industryL1} · {input.industrySegment} · {formatEur(input.revenueEur, { compact: true })} revenue
          </p>
        </div>
        <section>
          <BusinessCaseSummary result={result} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-800">Function prioritization matrix</h3>
          <p className="mt-1 text-xs text-slate-500">
            All {result.functions.length} sub-functions, positioned by function rank (size × strategic
            importance) against AI capability.
          </p>
          <div className="mt-4">
            <PriorityMatrix functions={result.functions} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-800">Sequencing &amp; phasing</h3>
          <p className="mt-1 text-xs text-slate-500">
            {result.waves.length} waves over {Math.max(...result.waves.map((w) => w.goLiveMonth))} months,
            highest priority score first.
          </p>
          <div className="mt-4">
            <WaveTimeline waves={result.waves} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-800">Month-by-month cost &amp; savings</h3>
          <p className="mt-1 text-xs text-slate-500">
            36-month view of gross savings, margin on revenue uplift, AI running cost, implementation cost and
            cumulative net P&amp;L.
          </p>
          <div className="mt-4">
            <MonthlyChart monthly={result.monthly} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-800">Top 10 priority functions</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-3">Rank</th>
                  <th className="py-2 pr-3">Function</th>
                  <th className="py-2 pr-3">Wave</th>
                  <th className="py-2 pr-3">AI capability</th>
                  <th className="py-2 pr-3">Target AI FTE</th>
                  <th className="py-2 pr-3">Total value/yr</th>
                </tr>
              </thead>
              <tbody>
                {topFunctions.map((f) => (
                  <tr key={f.l2Code} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-500">{f.priorityRank}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{f.l2Name}</td>
                    <td className="py-2 pr-3 text-slate-600">{f.wave}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatPct(f.aiCapabilityPct)}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatFte(f.targetAiFte)}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {formatEur(f.totalAnnualValueEur, { compact: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
