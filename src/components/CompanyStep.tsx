'use client';

import { useState } from 'react';

export default function CompanyStep({
  initialName,
  onNext,
}: {
  initialName: string;
  onNext: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);

  return (
    <div className="mx-auto w-full max-w-lg">
      <h2 className="text-lg font-semibold text-slate-900">Which company are we assessing?</h2>
      <p className="mt-1 text-sm text-slate-500">
        We&apos;ll research this company&apos;s profile, then map its functions against
        industry-specific AI opportunity benchmarks.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onNext(name.trim());
        }}
        className="mt-6 space-y-4"
      >
        <div>
          <label className="text-xs font-medium text-slate-600">Company name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Manufacturing GmbH"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
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
