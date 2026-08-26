'use client';

import { useMemo, useState } from 'react';
import { FUNCTIONS } from '@/data/model';
import type { FunctionAssumption, Parameters } from '@/lib/types';
import { formatFte, formatPct } from '@/lib/format';

interface Props {
  assumptions: FunctionAssumption[];
  parameters: Parameters;
  totalFte: number;
  onBack: () => void;
  onNext: (assumptions: FunctionAssumption[], parameters: Parameters) => void;
}

export default function FteMappingStep({ assumptions, parameters, totalFte, onBack, onNext }: Props) {
  const [rows, setRows] = useState<FunctionAssumption[]>(assumptions);
  const [params, setParams] = useState<Parameters>(parameters);
  const [openL1, setOpenL1] = useState<Set<string>>(new Set(FUNCTIONS.map((f) => f.l1Code)));

  const byCode = useMemo(() => new Map(rows.map((r) => [r.l2Code, r])), [rows]);
  const grouped = useMemo(() => {
    const map = new Map<string, typeof FUNCTIONS>();
    for (const f of FUNCTIONS) {
      if (!map.has(f.l1Code)) map.set(f.l1Code, []);
      map.get(f.l1Code)!.push(f);
    }
    return [...map.entries()];
  }, []);

  function update(l2Code: string, patch: Partial<FunctionAssumption>) {
    setRows((prev) => prev.map((r) => (r.l2Code === l2Code ? { ...r, ...patch } : r)));
  }

  function toggle(l1Code: string) {
    setOpenL1((prev) => {
      const next = new Set(prev);
      if (next.has(l1Code)) next.delete(l1Code);
      else next.add(l1Code);
      return next;
    });
  }

  const totalMapped = rows.reduce((acc, r) => acc + r.fteCount, 0);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Confirm FTE mapping</h2>
          <p className="mt-1 text-sm text-slate-500">
            FTE counts are pre-filled from industry benchmarks ({formatFte(totalFte)} total FTE). Adjust any
            function, and set strategic importance for functions that matter more or less than their size
            suggests.
          </p>
        </div>
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Mapped: <span className="font-medium text-slate-900">{formatFte(totalMapped)}</span> FTE
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center justify-between text-sm font-medium text-slate-700">
          Strategic importance weighting (global)
          <span className="text-slate-500">{formatPct(params.strategicImportanceWeightingPct)}</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={params.strategicImportanceWeightingPct}
          onChange={(e) => setParams({ ...params, strategicImportanceWeightingPct: Number(e.target.value) })}
          className="mt-2 w-full accent-indigo-600"
        />
        <p className="mt-1 text-xs text-slate-400">
          0% ranks purely on financial value; 100% lets a function&apos;s strategic importance shift its
          priority by up to ±100%.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {grouped.map(([l1Code, fns]) => {
          const l1Name = fns[0].l1Name;
          const isOpen = openL1.has(l1Code);
          const l1Fte = fns.reduce((acc, f) => acc + (byCode.get(f.l2Code)?.fteCount ?? 0), 0);
          return (
            <div key={l1Code} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                onClick={() => toggle(l1Code)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-slate-800">
                  {l1Code}. {l1Name}
                </span>
                <span className="text-xs text-slate-500">{formatFte(l1Fte)} FTE</span>
              </button>
              {isOpen && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {fns.map((f) => {
                    const row = byCode.get(f.l2Code)!;
                    return (
                      <div key={f.l2Code} className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-12 sm:items-center">
                        <div className="sm:col-span-5">
                          <p className="text-sm font-medium text-slate-800">{f.l2Name}</p>
                          <p className="text-xs text-slate-400">{formatPct(row.pctFte, 1)} of workforce (benchmark)</p>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-medium text-slate-500">FTE count</label>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={round1(row.fteCount)}
                            onChange={(e) => update(f.l2Code, { fteCount: Number(e.target.value) || 0 })}
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                            AI capability
                            <span>{formatPct(row.aiCapabilityPct)}</span>
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={row.aiCapabilityPct}
                            onChange={(e) => update(f.l2Code, { aiCapabilityPct: Number(e.target.value) })}
                            className="mt-1.5 w-full accent-indigo-600"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                            Strategic importance
                            <span>{signedPct(row.strategicImportance)}</span>
                          </label>
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.1}
                            value={row.strategicImportance}
                            onChange={(e) => update(f.l2Code, { strategicImportance: Number(e.target.value) })}
                            className="mt-1.5 w-full accent-amber-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-6 flex gap-3 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent py-4">
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={() => onNext(rows, params)}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Calculate business case
        </button>
      </div>
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function signedPct(n: number) {
  const pct = Math.round(n * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
