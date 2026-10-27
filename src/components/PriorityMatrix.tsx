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
import { formatEur, formatFte, formatNumber, formatPct } from '@/lib/format';

const WAVE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#ca8a04', '#dc2626', '#db2777', '#7c3aed'];

// Log scale needs strictly positive values — this floors the rare zero/negative edge case
// (fteCount 0, or strategicImportance at -100%) without visibly distorting real data.
const MIN_X = 0.05;
// Room left and right of the outermost points (a factor, since the axis is logarithmic).
const X_PADDING_FACTOR = 1.4;

interface Point {
  x: number;
  y: number;
  z: number;
  name: string;
  l1Name: string;
  wave: number;
  fteCount: number;
  rank: number;
  valueEur: number;
}

const LABEL_FONT_SIZE = 9;
const LABEL_LINE_HEIGHT = 10;
const LABEL_MAX_WIDTH = 92;
const LABEL_GAP = 2; // between a point and its label
const LABEL_PAD = 1.5; // kept clear around every label and point
// How far from its point a label may go, nearest first; anything past 0 gets a leader line.
const LABEL_DISTANCES = [0, 8, 18, 30, 44, 60, 80, 104];
// Directions tried at each distance: above, below, right, left, then the diagonals.
const DIRECTIONS: [number, number][] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

/** 1-2-5 steps (…, 0.5, 1, 2, 5, 10, 20, …) inside [lo, hi] — a log axis only gets one tick otherwise. */
function logTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = Number((m * 10 ** e).toPrecision(1));
      if (v >= lo && v <= hi) ticks.push(v);
    }
  }
  return ticks;
}

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

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Circle {
  cx: number;
  cy: number;
  r: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

function hitsCircle(box: Box, c: Circle): boolean {
  const nx = clamp(c.cx, box.x0, box.x1);
  const ny = clamp(c.cy, box.y0, box.y1);
  return (nx - c.cx) ** 2 + (ny - c.cy) ** 2 < (c.r + LABEL_PAD) ** 2;
}

/** What Recharts hands a `Customized` element: the chart's state, including each Scatter's points in pixels. */
interface ChartState {
  formattedGraphicalItems?: { props?: { points?: { cx: number; cy: number; size: number; payload: Point }[] } }[];
  offset?: { left: number; top: number; width: number; height: number };
}

/**
 * Labels every point via Recharts' `Customized` (the supported way to reach the rendered point
 * positions). Each label takes the first free spot around its point — above, below, beside, then
 * diagonally, then further out with a leader line — so labels never cover each other or another
 * point where there is any room, and never run past the plot area.
 */
function LabelOverlay({ formattedGraphicalItems, offset }: ChartState) {
  const points = (formattedGraphicalItems ?? []).flatMap((item) => item.props?.points ?? []);
  if (!offset || points.length === 0) return null;

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d');
  if (ctx) ctx.font = `${LABEL_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  const measure = (s: string) => (ctx ? ctx.measureText(s).width : s.length * (LABEL_FONT_SIZE * 0.6));

  const plot: Box = { x0: offset.left, y0: offset.top, x1: offset.left + offset.width, y1: offset.top + offset.height };
  const circles: Circle[] = points.map((p) => ({ cx: p.cx, cy: p.cy, r: Math.sqrt(p.size / Math.PI) }));

  const items = points.map((p, i) => {
    const lines = wrapLabel(p.payload.name, measure);
    const width = Math.max(...lines.map(measure));
    const height = lines.length * LABEL_LINE_HEIGHT;
    const crowd = circles.filter((c) => Math.hypot(c.cx - p.cx, c.cy - p.cy) < 40).length;
    return { circle: circles[i], lines, width, height, crowd };
  });

  // Crowded points choose first, while the space next to them is still free.
  const order = items.map((_, i) => i).sort((a, b) => items[b].crowd - items[a].crowd || circles[a].cy - circles[b].cy);

  const placed: Box[] = [];
  const labels: {
    box: Box;
    lines: string[];
    anchor: 'start' | 'middle' | 'end';
    leader: { x1: number; y1: number; x2: number; y2: number } | null;
  }[] = [];

  for (const i of order) {
    const { circle, lines, width: w, height: h } = items[i];
    let best: { box: Box; dx: number; cost: number } | null = null;

    search: for (const distance of LABEL_DISTANCES) {
      for (const [dx, dy] of DIRECTIONS) {
        const norm = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
        const ax = circle.cx + dx * norm * (circle.r + LABEL_GAP + distance);
        const ay = circle.cy + dy * norm * (circle.r + LABEL_GAP + distance);
        const x0 = clamp(dx > 0 ? ax : dx < 0 ? ax - w : ax - w / 2, plot.x0, plot.x1 - w);
        const y0 = clamp(dy > 0 ? ay : dy < 0 ? ay - h : ay - h / 2, plot.y0, plot.y1 - h);
        const box = { x0, y0, x1: x0 + w, y1: y0 + h };
        const padded = { x0: x0 - LABEL_PAD, y0: y0 - LABEL_PAD, x1: x0 + w + LABEL_PAD, y1: y0 + h + LABEL_PAD };

        // Covering another label is worst, covering a point next; otherwise nearer is better.
        let cost = distance * 0.5;
        for (const other of placed) cost += overlapArea(padded, other) * 3;
        for (const c of circles) if (hitsCircle(box, c)) cost += 60;

        if (!best || cost < best.cost) best = { box, dx, cost };
        if (cost === distance * 0.5) break search; // a free spot: nothing further out can beat it
      }
    }
    if (!best) continue;

    const { box, dx } = best;
    placed.push({ x0: box.x0 - LABEL_PAD, y0: box.y0 - LABEL_PAD, x1: box.x1 + LABEL_PAD, y1: box.y1 + LABEL_PAD });

    // Leader line from the edge of the circle to the nearest point of a label that isn't touching it.
    const nx = clamp(circle.cx, box.x0, box.x1);
    const ny = clamp(circle.cy, box.y0, box.y1);
    const gap = Math.hypot(nx - circle.cx, ny - circle.cy);
    const leader =
      gap - circle.r > LABEL_GAP + 4
        ? {
            x1: circle.cx + ((nx - circle.cx) / gap) * circle.r,
            y1: circle.cy + ((ny - circle.cy) / gap) * circle.r,
            x2: nx,
            y2: ny,
          }
        : null;

    labels.push({ box, lines, anchor: dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle', leader });
  }

  return (
    <g>
      {labels.map(
        ({ leader }, i) =>
          leader && <line key={`l${i}`} {...leader} stroke="#94a3b8" strokeWidth={0.75} />,
      )}
      {labels.map(({ box, lines, anchor }, i) => {
        const x = anchor === 'start' ? box.x0 : anchor === 'end' ? box.x1 : (box.x0 + box.x1) / 2;
        return (
          <text
            key={`t${i}`}
            x={x}
            y={box.y0 + LABEL_LINE_HEIGHT * 0.8}
            textAnchor={anchor}
            fontSize={LABEL_FONT_SIZE}
            fill="#475569"
            stroke="#fff"
            strokeWidth={2.5}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {lines.map((line, li) => (
              <tspan key={li} x={x} dy={li === 0 ? 0 : LABEL_LINE_HEIGHT}>
                {line}
              </tspan>
            ))}
          </text>
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
    rank: f.priorityRank,
    valueEur: f.totalAnnualValueEur,
  }));

  const waves = [...new Set(functions.map((f) => f.wave))].sort((a, b) => a - b);
  const colorOf = (wave: number) => WAVE_COLORS[waves.indexOf(wave) % WAVE_COLORS.length];

  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const medianX = xs[Math.floor(xs.length / 2)] ?? 0;
  const xDomain: [number, number] = xs.length
    ? [xs[0] / X_PADDING_FACTOR, xs[xs.length - 1] * X_PADDING_FACTOR]
    : [MIN_X, 1];

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
      {/* Too dense to read on a phone at full width: scroll sideways instead. */}
      <div className="-mx-1 overflow-x-auto px-1 print:mx-0 print:overflow-visible print:px-0">
        <div className="min-w-[720px] print:min-w-0">
          <ResponsiveContainer width="100%" height={1040}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                dataKey="x"
                scale="log"
                domain={xDomain}
                allowDataOverflow
                ticks={logTicks(xDomain[0], xDomain[1])}
                name="Size × strategic importance"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => (v >= 1 ? formatNumber(v) : String(v))}
                label={{
                  value: 'Size × strategic importance (FTE, weighted; log scale)',
                  position: 'bottom',
                  fontSize: 12,
                  fill: '#64748b',
                }}
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
                        {p.l1Name} · Wave {p.wave} · Rank {p.rank}
                      </p>
                      <p className="mt-1 text-slate-600">FTE: {formatFte(p.fteCount)}</p>
                      <p className="text-slate-600">AI capability: {formatPct(p.y)}</p>
                      <p className="text-slate-600">Total value/yr: {formatEur(p.valueEur, { compact: true })}</p>
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
              <Customized component={LabelOverlay} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
