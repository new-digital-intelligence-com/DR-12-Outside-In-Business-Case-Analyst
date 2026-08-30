import { NextRequest, NextResponse } from 'next/server';
import { generateReportPdf } from '@/lib/pdf';
import type { AssessmentResult, CompanyInput } from '@/lib/types';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { input?: CompanyInput; result?: AssessmentResult }
    | null;

  if (!body?.input || !body?.result) {
    return NextResponse.json({ error: 'Missing "input" or "result".' }, { status: 400 });
  }

  try {
    const pdfBytes = await generateReportPdf({
      origin: req.nextUrl.origin,
      input: body.input,
      result: body.result,
    });
    return new NextResponse(pdfBytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${body.input.companyName} - AI Opportunity Assessment.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate the PDF.' },
      { status: 502 },
    );
  }
}
