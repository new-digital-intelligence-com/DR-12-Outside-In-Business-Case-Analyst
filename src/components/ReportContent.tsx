import type { AiEmployeeLinks, AssessmentResult, CompanyInput } from '@/lib/types';
import BusinessCaseSummary from './BusinessCaseSummary';
import PriorityMatrix from './PriorityMatrix';
import WaveTimeline from './WaveTimeline';
import MonthlyChart from './MonthlyChart';
import AiEmployeeTag from './AiEmployeeTag';
import AiOpportunityTable from './AiOpportunityTable';
import { formatEur, formatFte, formatPct } from '@/lib/format';

export default function ReportContent({
  input,
  result,
  aiEmployees,
}: {
  input: CompanyInput;
  result: AssessmentResult;
  /** NDI AI Employees per sub-function; their column and section are left out until these arrive. */
  aiEmployees?: AiEmployeeLinks | null;
}) {
  const topFunctions = [...result.functions].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, 10);

  return (
    <div id="report-root" className="space-y-8 bg-slate-50 p-1">
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
          All {result.functions.length} sub-functions, positioned by size × strategic importance against AI
          capability.
        </p>
        {/* The chart keeps a readable minimum width, so on phones it scrolls inside the card. */}
        <p className="mt-1 text-xs text-slate-400 md:hidden print:hidden">Swipe sideways to see the whole chart.</p>
        <div className="mt-4">
          <PriorityMatrix functions={result.functions} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-800">Sequencing &amp; phasing</h3>
        <p className="mt-1 text-xs text-slate-500">
          {result.waves.length} waves over {Math.max(...result.waves.map((w) => w.goLiveMonth))} months, highest
          priority score first.
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
        <div className="mt-4 overflow-x-auto print:overflow-visible">
          {/* On phones each row stacks into a short card instead of scrolling sideways. */}
          <table
            className={`w-full text-left text-sm max-sm:block print:min-w-0 print:text-xs ${aiEmployees ? 'sm:min-w-[860px]' : 'sm:min-w-[640px]'}`}
          >
            <thead className="max-sm:hidden">
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 pr-3">Rank</th>
                <th className="py-2 pr-3">Function</th>
                <th className="py-2 pr-3">Wave</th>
                <th className="py-2 pr-3">AI capability</th>
                <th className="py-2 pr-3">Target AI FTE</th>
                <th className="py-2 pr-3">Total value/yr</th>
                {aiEmployees && <th className="py-2 pr-3">NDI AI Employee</th>}
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {topFunctions.map((f) => {
                const bestFit = aiEmployees?.byFunction[f.l2Code]?.[0];
                const value = formatEur(f.totalAnnualValueEur, { compact: true });
                return (
                  <tr
                    key={f.l2Code}
                    className="border-b border-slate-100 max-sm:grid max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:py-3"
                  >
                    <td className="py-2 pr-3 text-slate-500 max-sm:row-span-2 max-sm:py-0">{f.priorityRank}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800 max-sm:py-0 max-sm:pr-0">
                      {f.l2Name}
                      <span className="mt-0.5 block text-xs font-normal text-slate-600 sm:hidden">
                        Wave {f.wave} · {formatPct(f.aiCapabilityPct)} AI capability · {formatFte(f.targetAiFte)} AI FTE
                        · <span className="font-medium text-slate-800">{value}</span>/yr
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600 max-sm:hidden">{f.wave}</td>
                    <td className="py-2 pr-3 text-slate-600 max-sm:hidden">{formatPct(f.aiCapabilityPct)}</td>
                    <td className="py-2 pr-3 text-slate-600 max-sm:hidden">{formatFte(f.targetAiFte)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-medium text-slate-800 max-sm:hidden">{value}</td>
                    {aiEmployees && (
                      <td className="py-2 pr-3 max-sm:col-start-2 max-sm:pb-0 max-sm:pr-0 max-sm:pt-2">
                        {bestFit ? <AiEmployeeTag employee={bestFit} /> : <span className="text-slate-400">-</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {aiEmployees && (
        <section
          className="print-breakable rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
          data-ai-employees-source={aiEmployees.source}
          data-ai-employees-version={aiEmployees.catalogVersion}
        >
          {/* In print, the heading moves to the next page with the table rather than ending a page alone. */}
          <div className="print:break-inside-avoid print:break-after-avoid">
            <h3 className="text-sm font-semibold text-slate-800">NDI AI Employees for every opportunity</h3>
            <p className="mt-1 text-xs text-slate-500">
              All {result.functions.length} sub-functions by priority, each with the NDI AI Employees that take on
              its work, best fit first.
            </p>
          </div>
          <div className="mt-4">
            <AiOpportunityTable functions={result.functions} aiEmployees={aiEmployees} />
          </div>
        </section>
      )}
    </div>
  );
}
