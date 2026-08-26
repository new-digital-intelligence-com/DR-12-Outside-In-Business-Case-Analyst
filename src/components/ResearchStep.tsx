'use client';

import { useEffect, useState } from 'react';
import type { CompanyInput } from '@/lib/types';
import { L1_INDUSTRIES, SAMPLE_INPUT, segmentsForIndustry } from '@/data/model';
import { totalFteCalculated } from '@/lib/calc';
import { formatEur, formatFte } from '@/lib/format';
import type { ResearchResponse } from '@/app/api/research/route';

export default function ResearchStep({
  input,
  onBack,
  onNext,
}: {
  input: CompanyInput;
  onBack: () => void;
  onNext: (input: CompanyInput) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [form, setForm] = useState<CompanyInput>(input);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: input.companyName }),
    })
      .then((r) => r.json())
      .then((res: ResearchResponse) => {
        if (cancelled) return;
        setNote(res.note);
        setLive(res.live);
        if (res.live) {
          setForm((f) => ({
            ...f,
            revenueEur: res.revenueEur ?? f.revenueEur,
            profitEur: res.profitEur ?? f.profitEur,
            totalFte: res.totalFte ?? f.totalFte,
            avgRevenuePerFte: res.avgRevenuePerFte ?? f.avgRevenuePerFte,
            industryL1: res.industryL1 ?? f.industryL1,
            industrySegment: res.industrySegment ?? f.industrySegment,
            avgLoadedCostPerFte: res.avgLoadedCostPerFte ?? f.avgLoadedCostPerFte,
            researched: true,
          }));
        }
      })
      .catch(() => setNote('Research connector unavailable — enter figures manually below.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [input.companyName]);

  function loadExample() {
    setForm((f) => ({
      ...f,
      revenueEur: SAMPLE_INPUT.revenueEur,
      profitEur: SAMPLE_INPUT.profitEur,
      totalFte: SAMPLE_INPUT.totalFte,
      avgRevenuePerFte: SAMPLE_INPUT.avgRevenuePerFte,
      industryL1: SAMPLE_INPUT.industry,
      industrySegment: SAMPLE_INPUT.industrySegment,
      avgLoadedCostPerFte: SAMPLE_INPUT.avgLoadedCostPerFte,
    }));
  }

  const segments = segmentsForIndustry(form.industryL1);
  const calcFte = totalFteCalculated(form);
  const costCalculated = form.revenueEur - form.profitEur;
  const canContinue =
    form.revenueEur > 0 && form.avgLoadedCostPerFte > 0 && form.industryL1 && form.industrySegment;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">Company profile — {input.companyName}</h2>

      {loading ? (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
          <Spinner /> Researching {input.companyName}…
        </div>
      ) : (
        <>
          {note && (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                live ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {note}
              {!live && (
                <>
                  {' '}
                  <button onClick={loadExample} className="font-medium underline underline-offset-2">
                    Load illustrative example data
                  </button>
                </>
              )}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Revenue (EUR/year)" source="AI research">
              <NumberInput value={form.revenueEur} onChange={(v) => setForm({ ...form, revenueEur: v })} />
            </Field>
            <Field label="Profit (EUR/year)" source="AI research">
              <NumberInput value={form.profitEur} onChange={(v) => setForm({ ...form, profitEur: v })} />
            </Field>
            <Field label="Total FTE (leave 0 to estimate)" source="AI research">
              <NumberInput value={form.totalFte} onChange={(v) => setForm({ ...form, totalFte: v })} />
            </Field>
            <Field label="Average revenue per FTE (EUR)" source="AI research">
              <NumberInput
                value={form.avgRevenuePerFte}
                onChange={(v) => setForm({ ...form, avgRevenuePerFte: v })}
              />
            </Field>
            <Field label="Average loaded cost per FTE (EUR)" source="AI research">
              <NumberInput
                value={form.avgLoadedCostPerFte}
                onChange={(v) => setForm({ ...form, avgLoadedCostPerFte: v })}
              />
            </Field>
            <Field label="Industry" source="AI research">
              <select
                value={form.industryL1}
                onChange={(e) =>
                  setForm({
                    ...form,
                    industryL1: e.target.value,
                    industrySegment: segmentsForIndustry(e.target.value)[0]?.l2Name ?? '',
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select…</option>
                {L1_INDUSTRIES.map((i) => (
                  <option key={i.code} value={i.name}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Industry segment" source="AI research">
              <select
                value={form.industrySegment}
                onChange={(e) => setForm({ ...form, industrySegment: e.target.value })}
                disabled={!form.industryL1}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
              >
                <option value="">Select…</option>
                {segments.map((s) => (
                  <option key={s.l2Code} value={s.l2Name}>
                    {s.l2Name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-100 p-4 text-sm">
            <div>
              <dt className="text-slate-500">Cost (calculated)</dt>
              <dd className="font-medium text-slate-900">{formatEur(costCalculated, { compact: true })}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total FTE (calculated from revenue)</dt>
              <dd className="font-medium text-slate-900">{formatFte(calcFte)}</dd>
            </div>
          </dl>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onBack}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={() => canContinue && onNext({ ...form, researched: true })}
              disabled={!canContinue}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Continue to FTE mapping
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, source, children }: { label: string; source: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-slate-600">
        {label}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">{source}</span>
      </span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
    />
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
