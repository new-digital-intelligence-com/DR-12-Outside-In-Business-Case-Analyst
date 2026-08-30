import { readStashedReport } from '@/lib/pdf';
import ReportContent from '@/components/ReportContent';

export default async function PrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const stashed = await readStashedReport(token);

  if (!stashed) {
    return <p className="p-8 text-sm text-slate-500">This preview link has expired.</p>;
  }

  return <ReportContent input={stashed.input} result={stashed.result} />;
}
