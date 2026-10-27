/*
 * "Send via email" goes out through Gmail's SMTP server, signed in as GMAIL_USER with an app
 * password of that Google account (GMAIL_APP_PASSWORD), so the emails come from that address.
 * SMTP needs a Node.js host (Railway, local dev): Cloudflare Workers can't send it.
 */

const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465; // SMTP over TLS

function smtpAuth(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER?.trim();
  // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it.
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  return user && pass ? { user, pass } : null;
}

export function gmailConfigured(): boolean {
  return smtpAuth() !== null;
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
}): Promise<void> {
  const auth = smtpAuth();
  if (!auth) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD are not set.');

  // Loaded at run time, not bundled, for the same reason as puppeteer in pdf.ts: Cloudflare
  // builds mustn't pull nodemailer into the Worker.
  const moduleName = process.env.NODEMAILER_PACKAGE || 'nodemailer';
  const { createTransport } = (await import(
    /* webpackIgnore: true */ moduleName
  )) as typeof import('nodemailer');

  const transport = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth,
    // Give up within seconds, not minutes, when the mail server can't be reached.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });

  try {
    await transport.sendMail({
      from: auth.user,
      // An address object, so what the visitor typed is never parsed as a list of addresses.
      to: { name: '', address: to },
      subject,
      html,
      attachments: attachment
        ? [{ filename: attachment.filename, content: Buffer.from(attachment.content), contentType: attachment.mimeType }]
        : [],
    });
  } catch (err) {
    throw new Error(explainSmtpError(err, auth.user));
  } finally {
    transport.close();
  }
}

function explainSmtpError(err: unknown, user: string): string {
  const { code, message } = (err ?? {}) as { code?: string; message?: string };
  if (code === 'EAUTH') {
    return `Gmail didn't accept the sign-in for ${user}: GMAIL_APP_PASSWORD must be an app password of that account, not its normal password.`;
  }
  if (code && ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EDNS', 'ETLS'].includes(code)) {
    return `Couldn't reach Gmail's mail server (${SMTP_HOST}:${SMTP_PORT}): ${message}. Railway allows outgoing SMTP only on its Pro plan.`;
  }
  return `Gmail couldn't send the email: ${message ?? String(err)}`;
}
