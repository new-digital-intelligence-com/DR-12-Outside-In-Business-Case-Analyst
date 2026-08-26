'use client';

const STEPS = ['Company', 'Research', 'FTE Mapping', 'Results'] as const;

export default function Stepper({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex w-full max-w-4xl items-center gap-1 px-4 py-4 sm:gap-2">
      {STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'upcoming';
        return (
          <li key={label} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  state === 'done'
                    ? 'bg-indigo-600 text-white'
                    : state === 'active'
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  state === 'upcoming' ? 'text-slate-400' : 'text-slate-800'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 ${state === 'done' ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
