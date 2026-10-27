import { readStashedReport } from '@/lib/pdf';
import { getAiEmployeeLinks } from '@/lib/aiEmployees';
import ReportContent from '@/components/ReportContent';

export default async function PrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [stashed, aiEmployees] = await Promise.all([readStashedReport(token), getAiEmployeeLinks()]);

  if (!stashed) {
    // Wrapped in #report-root, same as ReportContent — globals.css's print stylesheet hides
    // everything else on the page, so an unwrapped message here would render as a blank PDF page.
    return (
      <div id="report-root" className="p-8 text-sm text-slate-500">
        This preview link has expired.
      </div>
    );
  }

  return <ReportContent input={stashed.input} result={stashed.result} aiEmployees={aiEmployees} />;
}
