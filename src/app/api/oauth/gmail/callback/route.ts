import { NextRequest, NextResponse } from 'next/server';

// One-time setup endpoint: exchanges the authorization code from the Gmail OAuth
// consent screen for a refresh token, and displays it once so it can be copied
// into the GMAIL_REFRESH_TOKEN secret. Not part of the app's normal runtime flow.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'Missing "code" query parameter.' }, { status: 400 });
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on this deployment yet.' },
      { status: 500 },
    );
  }

  const redirectUri = `${req.nextUrl.origin}/api/oauth/gmail/callback`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string };

  if (!res.ok || !data.refresh_token) {
    return NextResponse.json(
      { error: data.error || 'Token exchange did not return a refresh token — try the consent URL again with prompt=consent.' },
      { status: 502 },
    );
  }

  return new NextResponse(
    `<pre style="font:14px monospace;white-space:pre-wrap;padding:24px;">Copy this value into the GMAIL_REFRESH_TOKEN secret, then discard this page:\n\n${data.refresh_token}</pre>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}
