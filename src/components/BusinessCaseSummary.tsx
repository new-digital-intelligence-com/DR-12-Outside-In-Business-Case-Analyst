'use client';

import type { AssessmentResult } from '@/lib/types';
import { formatEur, formatFte } from '@/lib/format';

export default function BusinessCaseSummary({ result }: { result: AssessmentResult }) {
  const { totals } = result;
  const paybackMonths = totals.implementationCostEur / (totals.totalAnnualValueEur / 12 || 1);

  const tiles = [
    { label: 'Total annual value', value: formatEur(totals.totalAnnualValueEur, { compact: true }) },
    { label: 'Net cost savings / yr', value: formatEur(totals.netAnnualValueEur, { compact: true }) },
    { label: 'Revenue uplift / yr', value: formatEur(totals.revenueUpliftEur, { compact: true }) },
    { label: 'Target AI FTE', value: formatFte(totals.targetAiFte) },
    { label: 'One-time implementation cost', value: formatEur(totals.implementationCostEur, { compact: true }) },
    { label: 'Approx. payback', value: `${paybackMonths.toFixed(1)} months` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{t.label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{t.value}</p>
        </div>
      ))}
    </div>
  );
}
