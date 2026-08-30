'use client';

import { useState } from 'react';
import PdfDeliveryDialog from './PdfDeliveryDialog';
import type { AssessmentResult, CompanyInput } from '@/lib/types';

export default function ExportPdfButton({ input, result }: { input: CompanyInput; result: AssessmentResult }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Download PDF
      </button>
      <PdfDeliveryDialog open={open} onClose={() => setOpen(false)} input={input} result={result} />
    </>
  );
}
