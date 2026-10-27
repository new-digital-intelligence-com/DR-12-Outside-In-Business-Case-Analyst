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

const TICK_INTERVALS = 6;

/** Smallest round step (1, 2, 2.5 or 5 × 10ⁿ) of at least `x`. */
function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const base = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5]) if (m * base >= x * (1 - 1e-9)) return m * base;
  return 10 * base;
}

/**
 * Ticks for value axes that all put zero at the same height, so the monthly bars (left axis) and
 * the cumulative line (right axis, often 30× larger) share one baseline.
 */
function zeroAlignedTicks(ranges: [number, number][]): number[][] {
  let best: { ticks: number[][]; spread: number } | null = null;
  for (let below = 0; below <= TICK_INTERVALS; below++) {
    const above = TICK_INTERVALS - below;
    if (ranges.some(([lo, hi]) => (lo < 0 && below === 0) || (hi > 0 && above === 0))) continue;
    const steps = ranges.map(([lo, hi]) => niceStep(Math.max(below ? -lo / below : 0, above ? hi / above : 0)));
    // Lower is better: how much taller than its data each axis ends up.
    const spread = ranges.reduce((sum, [lo, hi], i) => sum + (TICK_INTERVALS * steps[i]) / Math.max(hi - lo, 1), 0);
    if (!best || spread < best.spread) {
      best = {
        ticks: steps.map((s) => Array.from({ length: TICK_INTERVALS + 1 }, (_, k) => (k - below) * s)),
        spread,
      };
    }
  }
  return best?.ticks ?? ranges.map(() => [0]);
}

export default function MonthlyChart({ monthly }: { monthly: MonthlyPoint[] }) {
  const data = monthly.map((m) => ({
    month: `M${m.month}`,
    'Gross savings': m.grossCostSavingsEur,
    'Margin on revenue uplift': m.marginOnRevenueUpliftEur,
    'AI running cost': m.aiRunningCostEur,
    'Implementation cost': m.implementationCostEur,
    'Cumulative net P&L': m.cumulativeNetPnLEur,
  }));

  // Stacked bars: positive flows stack up, costs (negative) stack down.
  const flowRange: [number, number] = [
    Math.min(0, ...monthly.map((m) => Math.min(0, m.aiRunningCostEur) + Math.min(0, m.implementationCostEur))),
    Math.max(0, ...monthly.map((m) => Math.max(0, m.grossCostSavingsEur) + Math.max(0, m.marginOnRevenueUpliftEur))),
  ];
  const cumulativeRange: [number, number] = [
    Math.min(0, ...monthly.map((m) => m.cumulativeNetPnLEur)),
    Math.max(0, ...monthly.map((m) => m.cumulativeNetPnLEur)),
  ];
  const [flowTicks, cumulativeTicks] = zeroAlignedTicks([flowRange, cumulativeRange]);
  const compactEur = (v: number) => formatEur(v, { compact: true });

  return (
    <ResponsiveContainer width="100%" height={380}>
      {/* "sign": costs stack down from zero. By default Recharts stacks them onto the savings,
          where they paint over part of the savings bar instead of showing as costs. */}
      <ComposedChart data={data} stackOffset="sign" margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="equidistantPreserveStart" minTickGap={8} />
        <YAxis
          yAxisId="flow"
          domain={[flowTicks[0], flowTicks[flowTicks.length - 1]]}
          ticks={flowTicks}
          tickFormatter={compactEur}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          yAxisId="cumulative"
          orientation="right"
          domain={[cumulativeTicks[0], cumulativeTicks[cumulativeTicks.length - 1]]}
          ticks={cumulativeTicks}
          tickFormatter={compactEur}
          tick={{ fontSize: 11, fill: '#4f46e5' }}
        />
        <Tooltip formatter={(v: number) => compactEur(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* No draw-in animation (like the priority matrix): the PDF is printed about a second after
            the page loads, and could catch the bars and line half-drawn. */}
        <Bar yAxisId="flow" dataKey="Gross savings" stackId="flow" fill="#059669" isAnimationActive={false} />
        <Bar yAxisId="flow" dataKey="Margin on revenue uplift" stackId="flow" fill="#0891b2" isAnimationActive={false} />
        <Bar yAxisId="flow" dataKey="AI running cost" stackId="flow" fill="#f97316" isAnimationActive={false} />
        <Bar yAxisId="flow" dataKey="Implementation cost" stackId="flow" fill="#dc2626" isAnimationActive={false} />
        <Line
          yAxisId="cumulative"
          type="monotone"
          dataKey="Cumulative net P&L"
          name="Cumulative net P&L (right axis)"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
