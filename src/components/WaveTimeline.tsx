'use client';

import type { WaveSummary } from '@/lib/types';
import { formatEur, formatFte } from '@/lib/format';

export default function WaveTimeline({ waves }: { waves: WaveSummary[] }) {
  const maxMonth = Math.max(...waves.map((w) => w.goLiveMonth), 1);

  return (
    <div className="space-y-3">
      {waves.map((w) => (
        <div key={w.wave} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-slate-800">Wave {w.wave}</p>
            <p className="text-xs text-slate-400">{w.functionCount} functions</p>
          </div>
          <div className="sm:col-span-6">
            <div className="relative h-5 rounded-full bg-slate-100">
              <div
                className="absolute h-5 rounded-full bg-indigo-500"
                style={{
                  left: `${((w.startMonth - 1) / maxMonth) * 100}%`,
                  width: `${((w.goLiveMonth - w.startMonth + 1) / maxMonth) * 100}%`,
                }}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Month {w.startMonth}–{w.goLiveMonth}
            </p>
          </div>
          <div className="text-xs text-slate-600 sm:col-span-4 sm:text-right">
            <span className="font-medium text-slate-800">{formatFte(w.targetAiFte)}</span> AI FTE ·{' '}
            <span className="font-medium text-slate-800">{formatEur(w.totalAnnualValueEur, { compact: true })}</span>{' '}
            value/yr
          </div>
        </div>
      ))}
    </div>
  );
}
