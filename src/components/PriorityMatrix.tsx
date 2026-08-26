'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { FunctionResult } from '@/lib/types';
import { formatFte, formatPct } from '@/lib/format';

const COLORS = [
  '#4f46e5', '#0891b2', '#059669', '#ca8a04', '#dc2626',
  '#db2777', '#7c3aed', '#2563eb', '#ea580c',
];

interface Point {
  x: number;
  y: number;
  z: number;
  name: string;
  l1Name: string;
  fteCount: number;
}

export default function PriorityMatrix({ functions }: { functions: FunctionResult[] }) {
  const points: Point[] = functions.map((f) => ({
    x: f.fteCount * (1 + f.strategicImportance),
    y: f.aiCapabilityPct,
    z: Math.max(f.fteCount, 0.5),
    name: f.l2Name,
    l1Name: f.l1Name,
    fteCount: f.fteCount,
  }));

  const l1Names = [...new Set(functions.map((f) => f.l1Name))];
  const colorOf = (l1Name: string) => COLORS[l1Names.indexOf(l1Name) % COLORS.length];

  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const medianX = xs[Math.floor(xs.length / 2)] ?? 0;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-xs text-slate-500">
        {l1Names.map((name) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colorOf(name) }} />
            {name}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={440}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="x"
            name="Function rank (size × strategic importance)"
            tick={{ fontSize: 11 }}
            label={{ value: 'Function rank (size × strategic importance)', position: 'bottom', fontSize: 12, fill: '#64748b' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="AI capability"
            domain={[0, 1]}
            tickFormatter={(v) => formatPct(v)}
            tick={{ fontSize: 11 }}
            label={{ value: 'AI capability', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }}
          />
          <ZAxis type="number" dataKey="z" range={[40, 400]} />
          <ReferenceLine x={medianX} stroke="#94a3b8" strokeDasharray="4 4" />
          <ReferenceLine y={0.5} stroke="#94a3b8" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="text-slate-500">{p.l1Name}</p>
                  <p className="mt-1 text-slate-600">FTE: {formatFte(p.fteCount)}</p>
                  <p className="text-slate-600">AI capability: {formatPct(p.y)}</p>
                </div>
              );
            }}
          />
          {l1Names.map((name) => (
            <Scatter
              key={name}
              name={name}
              data={points.filter((p) => p.l1Name === name)}
              fill={colorOf(name)}
              fillOpacity={0.75}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-2 text-center text-[11px] text-slate-400">
        <span>◀ Lower priority / low AI fit</span>
        <span>Quick wins / strategic bets ▶</span>
      </div>
    </div>
  );
}
