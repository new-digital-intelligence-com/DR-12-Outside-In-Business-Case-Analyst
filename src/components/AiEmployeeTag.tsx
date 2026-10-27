import type { AiEmployeeSummary } from '@/lib/types';

/** An NDI AI Employee: its code and name, the tagline on hover, and a demo link when NDI has one. */
export default function AiEmployeeTag({ employee }: { employee: AiEmployeeSummary }) {
  return (
    // A long name wraps beside its code chip (not under it) on narrow screens.
    <span className="inline-flex items-baseline gap-x-1.5" title={employee.tagline || undefined}>
      <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-indigo-700">
        {employee.code}
      </span>
      <span className="min-w-0 text-slate-700">
        {employee.name}
        {employee.videoUrl && (
          <>
            {' '}
            <a
              href={employee.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-0.5 whitespace-nowrap text-xs font-medium text-indigo-600 hover:underline"
              aria-label={`Watch the ${employee.name} demo`}
            >
              Demo
            </a>
          </>
        )}
      </span>
    </span>
  );
}
