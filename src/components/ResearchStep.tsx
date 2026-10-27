'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  CompanyCandidate,
  CompanyDataSource,
  CompanyInput,
  ResearchResponse,
  ResearchStreamEvent,
  SavedCompany,
} from '@/lib/types';
import { L1_INDUSTRIES, SAMPLE_INPUT, segmentsForIndustry } from '@/data/model';
import { effectiveTotalFte, totalFteCalculated } from '@/lib/calc';
import { formatDate, formatEur, formatFte } from '@/lib/format';

type Phase = 'choose' | 'loading' | 'candidates' | 'form';

/** Shown beside each field: where the figures came from. */
const SOURCE_LABEL: Record<CompanyDataSource['kind'], string> = {
  research: 'AI research',
  saved: 'Saved research',
  example: 'Example data',
  manual: 'Manual entry',
};

const EMPTY_FIGURES = {
  revenueEur: 0,
  profitEur: 0,
  totalFte: 0,
  avgRevenuePerFte: 0,
  industryL1: '',
  industrySegment: '',
  avgLoadedCostPerFte: 0,
};

const EXAMPLE_FIGURES = {
  revenueEur: SAMPLE_INPUT.revenueEur,
  profitEur: SAMPLE_INPUT.profitEur,
  totalFte: SAMPLE_INPUT.totalFte,
  avgRevenuePerFte: SAMPLE_INPUT.avgRevenuePerFte,
  industryL1: SAMPLE_INPUT.industry,
  industrySegment: SAMPLE_INPUT.industrySegment,
  avgLoadedCostPerFte: SAMPLE_INPUT.avgLoadedCostPerFte,
};

/** The research's figures for the form; whatever it didn't find stays empty. */
function figuresOf(res: ResearchResponse) {
  return {
    revenueEur: res.revenueEur ?? 0,
    profitEur: res.profitEur ?? 0,
    totalFte: res.totalFte ?? 0,
    avgRevenuePerFte: res.avgRevenuePerFte ?? 0,
    industryL1: res.industryL1 ?? '',
    industrySegment: res.industrySegment ?? '',
    avgLoadedCostPerFte: res.avgLoadedCostPerFte ?? 0,
  };
}

function foundAnything(res: ResearchResponse): boolean {
  return [
    res.revenueEur,
    res.profitEur,
    res.totalFte,
    res.avgRevenuePerFte,
    res.industryL1,
    res.industrySegment,
    res.avgLoadedCostPerFte,
  ].some((value) => value !== null);
}

export default function ResearchStep({
  input,
  savedPick,
  onBack,
  onNext,
}: {
  input: CompanyInput;
  /** A company with saved research, picked from the suggestions on the previous step. */
  savedPick: SavedCompany | null;
  onBack: () => void;
  onNext: (input: CompanyInput) => void;
}) {
  // Back from a later step, the figures show as they were. A company picked from the suggestions
  // loads its saved research straight away. Otherwise the user first picks where figures come from.
  const [phase, setPhase] = useState<Phase>(input.source ? 'form' : savedPick ? 'loading' : 'choose');
  const [source, setSource] = useState<CompanyDataSource>(input.source ?? { kind: 'manual', note: null });
  const [form, setForm] = useState<CompanyInput>(input);
  const [candidates, setCandidates] = useState<CompanyCandidate[]>([]);
  const [candidatesSavedAt, setCandidatesSavedAt] = useState<string | null>(null);
  /** Companies with saved research under exactly this name, offered as a choice. */
  const [savedMatches, setSavedMatches] = useState<SavedCompany[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(savedPick !== null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Guards against a stale request (e.g. picking a candidate while an earlier request is still
  // in flight) applying its result after a newer one has already started.
  const generation = useRef(0);

  function applyResult(res: ResearchResponse, candidate: CompanyCandidate | undefined) {
    setForm((f) => ({ ...f, ...figuresOf(res) }));
    if (res.live && foundAnything(res)) {
      setSource({ kind: res.savedAt ? 'saved' : 'research', note: res.note, savedAt: res.savedAt, candidate });
    } else {
      setSource({ kind: 'manual', note: res.note, candidate });
    }
  }

  /** candidate: the company to research; without one, finds the companies matching the name.
   * fresh: search the web even when there's saved research. saved: the result is known to be saved. */
  function startResearch(candidate?: CompanyCandidate, { fresh = false, saved = false } = {}) {
    const myGeneration = ++generation.current;
    setPhase('loading');
    setLoadingSaved(saved);
    setCandidates([]);
    setElapsedMs(0);

    async function run() {
      let settled = false;
      try {
        const res = await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName: input.companyName, confirmedCandidate: candidate, fresh }),
        });

        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          throw new Error(`Server returned ${res.status} ${res.statusText}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`);
        }
        if (!res.body) throw new Error('Response had no body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ResearchStreamEvent;
            if (generation.current !== myGeneration) return;
            if (event.type === 'heartbeat') {
              setElapsedMs(event.elapsedMs);
            } else if (event.type === 'candidates') {
              settled = true;
              setCandidates(event.data);
              setCandidatesSavedAt(event.savedAt ?? null);
              setPhase('candidates');
            } else if (event.type === 'result') {
              settled = true;
              applyResult(event.data, candidate);
              setPhase('form');
            }
          }
        }
        if (!settled && generation.current === myGeneration) {
          throw new Error('Stream ended without a result — connection likely dropped mid-request.');
        }
      } catch (err) {
        if (generation.current === myGeneration) {
          const detail = err instanceof Error ? err.message : String(err);
          console.error('Research request failed:', err);
          setForm((f) => ({ ...f, ...EMPTY_FIGURES }));
          setSource({
            kind: 'manual',
            note: `Research connector unavailable (${detail}) — enter figures manually below.`,
            candidate,
          });
          setPhase('form');
        }
      }
    }

    run();
  }

  // Runs once when this step opens. Loading a picked company updates state synchronously (via
  // startResearch) rather than in a callback; it's the same "fetch on mount" pattern as before.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    let active = true;
    if (input.source) {
      // Back from a later step: the figures are already here.
    } else if (savedPick) {
      startResearch(savedPick.candidate, { saved: true });
    } else {
      // Saved research under exactly this name is offered as a choice too.
      fetch(`/api/research/saved?q=${encodeURIComponent(input.companyName)}`)
        .then((res) => (res.ok ? (res.json() as Promise<{ companies?: SavedCompany[] }>) : null))
        .then((body) => {
          if (active) setSavedMatches((body?.companies ?? []).filter((c) => c.exact));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
      generation.current++;
    };
  }, [input.companyName]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  function loadExample() {
    generation.current++; // a search still running is dropped
    setForm((f) => ({ ...f, ...EXAMPLE_FIGURES }));
    setSource({ kind: 'example', note: null });
    setPhase('form');
  }

  function skipCandidates() {
    generation.current++;
    setForm((f) => ({ ...f, ...EMPTY_FIGURES }));
    setSource({ kind: 'manual', note: 'Enter the figures below yourself.' });
    setPhase('form');
  }

  const segments = segmentsForIndustry(form.industryL1);
  const calcFte = totalFteCalculated(form);
  const usedFte = effectiveTotalFte(form);
  const sourceLabel = SOURCE_LABEL[source.kind];
  const costCalculated = form.revenueEur - form.profitEur;
  const canContinue =
    form.revenueEur > 0 && form.avgLoadedCostPerFte > 0 && form.industryL1 && form.industrySegment;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">Company profile — {input.companyName}</h2>

      {phase === 'choose' && (
        <div className="mt-6">
          <p className="text-sm text-slate-600">Where should the company&apos;s figures come from?</p>
          <div className="mt-4 space-y-2">
            {savedMatches.map((m) => (
              <ChoiceButton
                key={`${m.candidate.name}|${m.candidate.domain ?? m.candidate.location}`}
                icon={<SavedIcon />}
                title={`Use saved research: ${m.candidate.name}`}
                onClick={() => startResearch(m.candidate, { saved: true })}
              >
                {[m.candidate.location, m.candidate.domain].filter(Boolean).join(' · ')}. Researched{' '}
                {formatDate(m.savedAt)}; loads instantly, with no new web search.
              </ChoiceButton>
            ))}
            <ChoiceButton icon={<SearchIcon />} title="Search real company data" onClick={() => startResearch()}>
              A live web search for revenue, profit, headcount and industry. Takes a minute or two.
            </ChoiceButton>
            <ChoiceButton icon={<ExampleIcon />} title="Continue with example data" onClick={loadExample}>
              Illustrative figures from a sample manufacturing company, not {input.companyName}&apos;s. No
              search, and you can edit every figure.
            </ChoiceButton>
          </div>
          <button
            onClick={onBack}
            className="mt-6 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
          <div className="flex items-center gap-3">
            <Spinner />{' '}
            {loadingSaved ? `Loading the saved research on ${input.companyName}…` : `Researching ${input.companyName}…`}
          </div>
          {!loadingSaved && elapsedMs > 5000 && (
            <p className="mt-2 text-xs text-slate-400">
              Still working ({Math.round(elapsedMs / 1000)}s) — this can take up to a few minutes, since it
              involves live web search.{' '}
              <button onClick={loadExample} className="font-medium text-slate-500 underline underline-offset-2">
                Use example data instead
              </button>
            </p>
          )}
        </div>
      )}

      {phase === 'candidates' && (
        <div className="mt-6">
          <p className="text-sm text-slate-600">
            Found {candidates.length} compan{candidates.length === 1 ? 'y' : 'ies'} matching &quot;{input.companyName}
            &quot; — which one did you mean?
          </p>
          {candidatesSavedAt && (
            <p className="mt-1 text-xs text-slate-500">
              From a search on {formatDate(candidatesSavedAt)}, so no new web search.{' '}
              <button
                onClick={() => startResearch(undefined, { fresh: true })}
                className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-500"
              >
                Search again
              </button>
            </p>
          )}
          <div className="mt-4 space-y-2">
            {candidates.map((c, i) => (
              <button
                key={i}
                onClick={() => startResearch(c)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                <span className="block text-sm font-medium text-slate-900">{c.name}</span>
                <span className="block text-xs text-slate-500">
                  {c.location}
                  {c.domain ? ` · ${c.domain}` : ''}
                </span>
                <span className="mt-1 block text-xs text-slate-600">{c.description}</span>
              </button>
            ))}
          </div>
          <button
            onClick={skipCandidates}
            className="mt-4 text-sm font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            None of these — I&apos;ll enter the figures myself
          </button>
        </div>
      )}

      {phase === 'form' && (
        <>
          {source.kind === 'saved' && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p>
                Saved research from {formatDate(source.savedAt ?? '')}, so no new web search.
                {source.candidate && (
                  <>
                    {' '}
                    <button
                      onClick={() => startResearch(source.candidate, { fresh: true })}
                      className="font-medium underline underline-offset-2"
                    >
                      Search the web again
                    </button>
                  </>
                )}
              </p>
              {source.note && <p className="mt-1">{source.note}</p>}
            </div>
          )}
          {source.kind === 'research' && source.note && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {source.note}
            </div>
          )}
          {source.kind === 'example' && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Example data: illustrative figures from a sample manufacturing company, not {input.companyName}
              &apos;s. Edit them, or{' '}
              <button onClick={() => startResearch()} className="font-medium underline underline-offset-2">
                search real company data
              </button>
              .
            </div>
          )}
          {source.kind === 'manual' && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {source.note ?? 'Enter the figures below yourself.'}{' '}
              <button onClick={loadExample} className="font-medium underline underline-offset-2">
                Load illustrative example data
              </button>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Revenue (EUR/year)" source={sourceLabel} hint={formatEur(form.revenueEur)}>
              <NumberInput value={form.revenueEur} onChange={(v) => setForm({ ...form, revenueEur: v })} />
            </Field>
            <Field label="Profit (EUR/year)" source={sourceLabel} hint={formatEur(form.profitEur)}>
              <NumberInput value={form.profitEur} onChange={(v) => setForm({ ...form, profitEur: v })} />
            </Field>
            <Field label="Total FTE (leave 0 to estimate)" source={sourceLabel}>
              <NumberInput value={form.totalFte} onChange={(v) => setForm({ ...form, totalFte: v })} />
            </Field>
            <Field label="Average revenue per FTE (EUR)" source={sourceLabel} hint={formatEur(form.avgRevenuePerFte)}>
              <NumberInput
                value={form.avgRevenuePerFte}
                onChange={(v) => setForm({ ...form, avgRevenuePerFte: v })}
              />
            </Field>
            <Field
              label="Average loaded cost per FTE (EUR)"
              source={sourceLabel}
              hint={formatEur(form.avgLoadedCostPerFte)}
            >
              <NumberInput
                value={form.avgLoadedCostPerFte}
                onChange={(v) => setForm({ ...form, avgLoadedCostPerFte: v })}
              />
            </Field>
            <Field label="Industry" source={sourceLabel}>
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
            <Field label="Industry segment" source={sourceLabel}>
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
              <dt className="text-slate-500">Total FTE used</dt>
              <dd className="font-medium text-slate-900">{formatFte(usedFte)}</dd>
              <dd className="mt-0.5 text-xs text-slate-500">
                {form.totalFte > 0
                  ? calcFte > 0 && `As entered (revenue ÷ revenue per FTE gives ${formatFte(calcFte)})`
                  : 'Estimated: revenue ÷ revenue per FTE'}
              </dd>
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
              onClick={() => canContinue && onNext({ ...form, researched: true, source })}
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

function ChoiceButton({
  icon,
  title,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
    >
      <span className="mt-0.5 shrink-0 text-indigo-600">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-600">{children}</span>
      </span>
    </button>
  );
}

function Field({
  label,
  source,
  hint,
  children,
}: {
  label: string;
  source: string;
  /** Shown under the input, e.g. the amount with digit grouping. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-slate-600">
        {label}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">{source}</span>
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
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

function Icon({ d }: { d: string }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function SearchIcon() {
  return <Icon d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />;
}

function ExampleIcon() {
  return <Icon d="M9 3h6M10 3v6.5L4.6 18.8A1.5 1.5 0 005.9 21h12.2a1.5 1.5 0 001.3-2.2L14 9.5V3M7.5 15h9" />;
}

function SavedIcon() {
  return <Icon d="M7 3h10a1 1 0 011 1v17l-6-3.5L6 21V4a1 1 0 011-1z" />;
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
