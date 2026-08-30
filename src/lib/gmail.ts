const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN,
  );
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to refresh Gmail access token: ${await res.text().catch(() => res.statusText)}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(base64: string): string {
  return base64.match(/.{1,76}/g)?.join('\r\n') ?? base64;
}

function toBase64Url(input: string): string {
  return bytesToBase64(new TextEncoder().encode(input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendGmail({
  to,
  subject,
  html,
  attachment,
}: {
  to: string;
  subject: string;
  html: string;
  attachment?: { filename: string; mimeType: string; content: Uint8Array };
}) {
  const accessToken = await getAccessToken();
  const boundary = `boundary_${crypto.randomUUID()}`;

  const parts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ];

  if (attachment) {
    parts.push(
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(bytesToBase64(attachment.content)),
    );
  }

  parts.push('', `--${boundary}--`);

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toBase64Url(parts.join('\r\n')) }),
  });

  if (!res.ok) {
    throw new Error(`Gmail API error: ${await res.text().catch(() => res.statusText)}`);
  }
}
