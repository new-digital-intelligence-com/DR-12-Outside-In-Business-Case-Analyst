import { NextRequest, NextResponse } from 'next/server';

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

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email delivery isn’t configured yet — set RESEND_API_KEY to enable it.' },
      { status: 501 },
    );
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'AI Opportunity Assessment <onboarding@resend.dev>',
      to: [email],
      subject: `Your AI Opportunity Assessment — ${companyName}`,
      html: `<p>Thanks for requesting the AI Opportunity Assessment for <strong>${companyName}</strong>.</p><p>Open the assessment in your browser and use "Download PDF" to save your copy.</p>${
        consent
          ? '<p style="color:#64748b;font-size:12px;">You agreed to be contacted by NDI and Pioneers.</p>'
          : ''
      }`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json({ error: `Email provider error: ${text || res.statusText}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
