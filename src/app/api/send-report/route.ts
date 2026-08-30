import { NextRequest, NextResponse } from 'next/server';
import { gmailConfigured, sendGmail } from '@/lib/gmail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; consent?: unknown; companyName?: unknown }
    | null;

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const consent = Boolean(body?.consent);
  const companyName = typeof body?.companyName === 'string' ? body.companyName : 'this company';

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
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

  try {
    await sendGmail({
      to: email,
      subject: `Your AI Opportunity Assessment — ${companyName}`,
      html: `<p>Thanks for requesting the AI Opportunity Assessment for <strong>${companyName}</strong>.</p><p>Open the assessment in your browser and use "Download PDF" to save your copy.</p>${
        consent
          ? '<p style="color:#64748b;font-size:12px;">You agreed to be contacted by NDI and Pioneers.</p>'
          : ''
      }`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send the email.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
