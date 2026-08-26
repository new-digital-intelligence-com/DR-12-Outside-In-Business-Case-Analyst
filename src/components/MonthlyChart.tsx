'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { MonthlyPoint } from '@/lib/types';
import { formatEur } from '@/lib/format';

export default function MonthlyChart({ monthly }: { monthly: MonthlyPoint[] }) {
  const data = monthly.map((m) => ({
    month: `M${m.month}`,
    'Gross savings': m.grossCostSavingsEur,
    'Margin on revenue uplift': m.marginOnRevenueUpliftEur,
    'AI running cost': m.aiRunningCostEur,
    'Implementation cost': m.implementationCostEur,
    'Cumulative net P&L': m.cumulativeNetPnLEur,
  }));

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
        <YAxis tickFormatter={(v) => formatEur(v, { compact: true })} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => formatEur(v, { compact: true })} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Gross savings" stackId="flow" fill="#059669" />
        <Bar dataKey="Margin on revenue uplift" stackId="flow" fill="#0891b2" />
        <Bar dataKey="AI running cost" stackId="flow" fill="#f97316" />
        <Bar dataKey="Implementation cost" stackId="flow" fill="#dc2626" />
        <Line type="monotone" dataKey="Cumulative net P&L" stroke="#4f46e5" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
