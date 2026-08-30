import { NextRequest, NextResponse } from 'next/server';
import { gmailConfigured, sendGmail } from '@/lib/gmail';
import { generateReportPdf } from '@/lib/pdf';
import type { AssessmentResult, CompanyInput } from '@/lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; consent?: unknown; input?: CompanyInput; result?: AssessmentResult }
    | null;

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const consent = Boolean(body?.consent);

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }
  if (!body?.input || !body?.result) {
    return NextResponse.json({ error: 'Missing "input" or "result".' }, { status: 400 });
  }

  if (!gmailConfigured()) {
    return NextResponse.json(
      {
        error:
          'Email delivery isn’t configured yet — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GMAIL_REFRESH_TOKEN to enable it.',
      },
      { status: 501 },
    );
  }

  const companyName = body.input.companyName;

  try {
    const pdfBytes = await generateReportPdf({ origin: req.nextUrl.origin, input: body.input, result: body.result });

    await sendGmail({
      to: email,
      subject: `Your AI Opportunity Assessment — ${companyName}`,
      html: `<p>Thanks for requesting the AI Opportunity Assessment for <strong>${companyName}</strong>.</p><p>Your PDF is attached.</p>${
        consent
          ? '<p style="color:#64748b;font-size:12px;">You agreed to be contacted by NDI and Pioneers.</p>'
          : ''
      }`,
      attachment: {
        filename: `${companyName} - AI Opportunity Assessment.pdf`,
        mimeType: 'application/pdf',
        content: pdfBytes,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send the email.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
