'use client';

export default function ExportPdfButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
    >
      Download PDF
    </button>
  );
}
