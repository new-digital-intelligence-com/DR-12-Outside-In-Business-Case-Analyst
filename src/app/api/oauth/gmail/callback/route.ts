import { NextRequest, NextResponse } from 'next/server';

// One-time setup endpoint: exchanges the authorization code from the Gmail OAuth
// consent screen for a refresh token, and displays it once so it can be copied
// into the GMAIL_REFRESH_TOKEN secret. Not part of the app's normal runtime flow.
export async function GET(req: NextRequest) {
  // Google hands out the token only for the exact redirect URI the consent screen used: this page's
  // public address. Errors include it, to compare with the URIs registered in Google Cloud.
  const redirectUri = `${publicOrigin(req)}/api/oauth/gmail/callback`;
  const fail = (error: string, status: number) => NextResponse.json({ error, redirectUri }, { status });

  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return fail(error, 400);
  }
  if (!code) {
    return fail('Missing "code" query parameter.', 400);
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return fail('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on this deployment yet.', 500);
  }

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

  const data = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.refresh_token) {
    return fail(
      data.error
        ? [data.error, data.error_description].filter(Boolean).join(': ')
        : 'Token exchange did not return a refresh token — try the consent URL again with prompt=consent.',
      502,
    );
  }

  return new NextResponse(
    `<pre style="font:14px monospace;white-space:pre-wrap;padding:24px;">Copy this value into the GMAIL_REFRESH_TOKEN secret, then discard this page:\n\n${data.refresh_token}</pre>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}

// The address the browser opened this page on. Behind a proxy (Railway), the request URL Next.js
// builds has the right protocol (from the proxy's X-Forwarded-Proto) but the server's own host,
// localhost:8080; the public host is in the forwarded Host header.
function publicOrigin(req: NextRequest): string {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))?.split(',')[0].trim();
  return host ? `${req.nextUrl.protocol}//${host}` : req.nextUrl.origin;
}
