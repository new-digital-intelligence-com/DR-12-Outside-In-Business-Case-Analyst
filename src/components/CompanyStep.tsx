'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedCompany } from '@/lib/types';
import { formatDate } from '@/lib/format';

const LIST_ID = 'company-suggestions';

export default function CompanyStep({
  initialName,
  initialPick,
  onNext,
}: {
  initialName: string;
  /** The saved company picked last time, if the name still matches it. */
  initialPick: SavedCompany | null;
  /** pick: the company with saved research chosen from the suggestions, if any. */
  onNext: (name: string, pick: SavedCompany | null) => void;
}) {
  const [name, setName] = useState(initialName);
  const [picked, setPicked] = useState<SavedCompany | null>(
    initialPick && initialPick.candidate.name === initialName ? initialPick : null,
  );
  const [suggestions, setSuggestions] = useState<SavedCompany[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );

  // Asks for saved companies matching the name a moment after typing stops.
  function lookUp(text: string) {
    clearTimeout(timer.current);
    request.current?.abort();
    if (!text.trim()) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(() => {
      const controller = new AbortController();
      request.current = controller;
      fetch(`/api/research/saved?q=${encodeURIComponent(text.trim())}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<{ companies?: SavedCompany[] }>) : null))
        .then((body) => {
          setSuggestions(body?.companies ?? []);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 150);
  }

  function choose(suggestion: SavedCompany) {
    clearTimeout(timer.current);
    request.current?.abort();
    setName(suggestion.candidate.name);
    setPicked(suggestion);
    setSuggestions([]);
    setOpen(false);
  }

  const visible = open && suggestions.length > 0 && name.trim() !== '';

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <h2 className="text-lg font-semibold text-slate-900">Which company are we assessing?</h2>
      <p className="mt-1 text-sm text-slate-500">
        We&apos;ll research this company&apos;s profile, then map its functions against
        industry-specific AI opportunity benchmarks. Companies researched before are suggested as you type.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onNext(name.trim(), picked);
        }}
        className="mt-6 space-y-4"
      >
        <div>
          <label htmlFor="company-name" className="text-xs font-medium text-slate-600">
            Company name
          </label>
          <div className="relative">
            <input
              id="company-name"
              autoFocus
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={visible}
              aria-controls={LIST_ID}
              aria-activedescendant={visible && active >= 0 ? `${LIST_ID}-${active}` : undefined}
              value={name}
              onChange={(e) => {
                const text = e.target.value;
                setName(text);
                if (picked && text !== picked.candidate.name) setPicked(null);
                setOpen(true);
                lookUp(text);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setOpen(false)}
              placeholder="Acme Manufacturing GmbH"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />

            <div
              hidden={!visible}
              className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Already researched
              </p>
              <ul id={LIST_ID} role="listbox" aria-label="Already researched companies" className="max-h-72 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <li
                    key={`${s.candidate.name}|${s.candidate.domain ?? s.candidate.location}`}
                    id={`${LIST_ID}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    aria-label={`${[s.candidate.name, s.candidate.location, s.candidate.domain].filter(Boolean).join(', ')}, researched ${formatDate(s.savedAt)}`}
                    // Keeps the focus in the input, so its blur doesn't close the list before the click lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(s)}
                    onMouseEnter={() => setActive(i)}
                    className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-indigo-50' : ''}`}
                  >
                    <p className="text-sm font-medium text-slate-900">{s.candidate.name}</p>
                    <p className="text-xs text-slate-500">
                      {[s.candidate.location, s.candidate.domain].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-[11px] text-slate-400">Researched {formatDate(s.savedAt)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {visible
              ? `${suggestions.length} already researched compan${suggestions.length === 1 ? 'y matches' : 'ies match'}. Use the arrow keys to choose.`
              : ''}
          </p>

          {picked && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-700">
              <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              Uses the research saved on {formatDate(picked.savedAt)}, with no new web search.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
