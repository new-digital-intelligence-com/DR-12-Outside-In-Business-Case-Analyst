'use client';

import { useState } from 'react';
import type { AiEmployeeLinks, FunctionResult } from '@/lib/types';
import { formatEur } from '@/lib/format';
import AiEmployeeTag from './AiEmployeeTag';

/** Rows shown on screen before "Show all"; a printed report always lists every row. */
const COLLAPSED_ROWS = 15;

/** Every sub-function by priority rank, with the NDI AI Employees that take on its work. */
export default function AiOpportunityTable({
  functions,
  aiEmployees,
}: {
  functions: FunctionResult[];
  aiEmployees: AiEmployeeLinks;
}) {
  const [showAll, setShowAll] = useState(false);
  const ranked = [...functions].sort((a, b) => a.priorityRank - b.priorityRank);

  return (
    <>
      <div className="overflow-x-auto print:overflow-visible">
        {/* On phones each row stacks (function, then its AI Employees) instead of scrolling sideways. */}
        <table className="w-full text-left text-sm max-sm:block sm:min-w-[720px] print:min-w-0 print:text-xs">
          <thead className="max-sm:hidden">
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-2 pr-3">Rank</th>
              <th className="py-2 pr-3">Function</th>
              <th className="py-2 pr-3">Wave</th>
              <th className="py-2 pr-3">Total value/yr</th>
              <th className="py-2 pr-3">NDI AI Employees</th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {ranked.map((f, i) => {
              const employees = aiEmployees.byFunction[f.l2Code] ?? [];
              const collapsed = !showAll && i >= COLLAPSED_ROWS;
              const value = formatEur(f.totalAnnualValueEur, { compact: true });
              return (
                <tr
                  key={f.l2Code}
                  className={`border-b border-slate-100 align-top ${
                    collapsed ? 'hidden print:table-row' : 'max-sm:grid max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:py-3'
                  }`}
                >
                  <td className="py-2 pr-3 text-slate-500 max-sm:row-span-2 max-sm:py-0">{f.priorityRank}</td>
                  <td className="py-2 pr-3 max-sm:py-0 max-sm:pr-0">
                    <span className="font-medium text-slate-800">{f.l2Name}</span>
                    <span className="block text-xs text-slate-400">{f.l1Name}</span>
                    <span className="mt-0.5 block text-xs text-slate-600 sm:hidden">
                      Wave {f.wave} · <span className="font-medium text-slate-800">{value}</span>/yr
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600 max-sm:hidden">{f.wave}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-medium text-slate-800 max-sm:hidden">{value}</td>
                  <td className="py-2 pr-3 max-sm:col-start-2 max-sm:pb-0 max-sm:pr-0 max-sm:pt-2">
                    {employees.length > 0 ? (
                      <ul className="space-y-1">
                        {employees.map((e) => (
                          <li key={e.code}>
                            <AiEmployeeTag employee={e} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ranked.length > COLLAPSED_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="print-hide mt-3 text-sm font-medium text-indigo-600 hover:underline"
        >
          {showAll ? `Show top ${COLLAPSED_ROWS} only` : `Show all ${ranked.length}`}
        </button>
      )}
    </>
  );
}
