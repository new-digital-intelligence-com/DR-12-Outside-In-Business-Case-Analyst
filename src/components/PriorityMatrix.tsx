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
  Customized,
} from 'recharts';
import type { FunctionResult } from '@/lib/types';
import { formatFte, formatPct } from '@/lib/format';

const WAVE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#ca8a04', '#dc2626', '#db2777', '#7c3aed'];

// Log scale needs strictly positive values — this floors the rare zero/negative edge case
// (fteCount 0, or strategicImportance at -100%) without visibly distorting real data.
const MIN_X = 0.05;

interface Point {
  x: number;
  y: number;
  z: number;
  name: string;
  l1Name: string;
  wave: number;
  fteCount: number;
}

const LABEL_FONT_SIZE = 8;
const LABEL_LINE_HEIGHT = 9;
const LABEL_MAX_WIDTH = 78;
const LABEL_GAP = 3;
const LEADER_MIN_DISTANCE = 5;

function wrapLabel(text: string, measure: (s: string) => number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (current && measure(trial) > LABEL_MAX_WIDTH) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface AxisScale {
  scale: (value: number) => number;
}

/** Renders each point's label via Recharts' `Customized` (the supported way to reach the chart's
 * internal pixel scales) instead of Scatter's built-in LabelList, so labels can be decluttered
 * against every other label — not just placed identically above each point — and connected back
 * to their circle with a leader line whenever that pushes them away from it. */
function LabelOverlay(props: { points?: Point[]; xAxisMap?: Record<string, AxisScale>; yAxisMap?: Record<string, AxisScale> }) {
  const { points, xAxisMap, yAxisMap } = props;
  const xScale = xAxisMap && Object.values(xAxisMap)[0]?.scale;
  const yScale = yAxisMap && Object.values(yAxisMap)[0]?.scale;
  if (!points || !xScale || !yScale) return null;

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d');
  if (ctx) ctx.font = `${LABEL_FONT_SIZE}px sans-serif`;
  const measure = (s: string) => (ctx ? ctx.measureText(s).width : s.length * (LABEL_FONT_SIZE * 0.6));

  // labelY tracks the vertical CENTER of each label's box, starting just above its point.
  const items = points.map((p) => {
    const lines = wrapLabel(p.name, measure);
    const width = Math.max(...lines.map(measure));
    const height = lines.length * LABEL_LINE_HEIGHT;
    const cx = xScale(p.x);
    const cy = yScale(p.y);
    const naturalY = cy - 8 - height / 2;
    return { point: p, cx, cy, lines, width, height, naturalY, labelY: naturalY };
  });

  // Pairwise AABB relaxation: push two labels apart vertically only when their boxes would
  // actually overlap (their x-ranges intersect at their current y-positions) — points far apart
  // in x never affect each other, however dense they are in y.
  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const xOverlap = Math.abs(a.cx - b.cx) < (a.width + b.width) / 2 + LABEL_GAP;
        if (!xOverlap) continue;
        const gapNeeded = (a.height + b.height) / 2 + LABEL_GAP;
        const gap = b.labelY - a.labelY;
        if (Math.abs(gap) < gapNeeded) {
          const shift = (gapNeeded - Math.abs(gap)) / 2 || gapNeeded / 2;
          const dir = gap >= 0 ? 1 : -1;
          a.labelY -= shift * dir;
          b.labelY += shift * dir;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return (
    <g>
      {items.map((it, i) => {
        const displaced = Math.abs(it.labelY - it.naturalY) > LEADER_MIN_DISTANCE;
        const firstLineY = it.labelY - it.height / 2 + LABEL_LINE_HEIGHT * 0.8;
        return (
          <g key={i}>
            {displaced && (
              <line
                x1={it.cx}
                y1={it.cy}
                x2={it.cx}
                y2={it.labelY}
                stroke="#cbd5e1"
                strokeWidth={0.75}
              />
            )}
            <text x={it.cx} y={firstLineY} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#475569">
              {it.lines.map((line, li) => (
                <tspan key={li} x={it.cx} dy={li === 0 ? 0 : LABEL_LINE_HEIGHT}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default function PriorityMatrix({ functions }: { functions: FunctionResult[] }) {
  const points: Point[] = functions.map((f) => ({
    x: Math.max(f.fteCount * (1 + f.strategicImportance), MIN_X),
    y: f.aiCapabilityPct,
    z: Math.max(f.fteCount, 0.5),
    name: f.l2Name,
    l1Name: f.l1Name,
    wave: f.wave,
    fteCount: f.fteCount,
  }));

  const waves = [...new Set(functions.map((f) => f.wave))].sort((a, b) => a - b);
  const colorOf = (wave: number) => WAVE_COLORS[waves.indexOf(wave) % WAVE_COLORS.length];

  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const medianX = xs[Math.floor(xs.length / 2)] ?? 0;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-xs text-slate-500">
        {waves.map((wave) => (
          <span key={wave} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colorOf(wave) }} />
            Wave {wave}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={1040}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="x"
            scale="log"
            domain={['auto', 'auto']}
            name="Function rank (size × strategic importance)"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => (v >= 1 ? Math.round(v).toString() : v.toFixed(1))}
            label={{ value: 'Function rank (size × strategic importance, log scale)', position: 'bottom', fontSize: 12, fill: '#64748b' }}
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
                  <p className="text-slate-500">
                    {p.l1Name} · Wave {p.wave}
                  </p>
                  <p className="mt-1 text-slate-600">FTE: {formatFte(p.fteCount)}</p>
                  <p className="text-slate-600">AI capability: {formatPct(p.y)}</p>
                </div>
              );
            }}
          />
          {waves.map((wave) => (
            <Scatter
              key={wave}
              name={`Wave ${wave}`}
              data={points.filter((p) => p.wave === wave)}
              fill={colorOf(wave)}
              fillOpacity={0.75}
              isAnimationActive={false}
            />
          ))}
          <Customized component={LabelOverlay} points={points} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
