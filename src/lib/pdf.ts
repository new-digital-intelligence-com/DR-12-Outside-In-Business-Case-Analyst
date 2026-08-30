import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { AssessmentResult, CompanyInput } from './types';

// KV, not Cache API: the Cache API is scoped to whichever single Cloudflare datacenter wrote the
// entry, and Browser Rendering's headless browser isn't guaranteed to run in that same one — a
// stash-then-immediately-read-elsewhere pattern would silently miss. KV is readable from any colo.
const STASH_TTL_SECONDS = 120;

export async function generateReportPdf({
  origin,
  input,
  result,
}: {
  origin: string;
  input: CompanyInput;
  result: AssessmentResult;
}): Promise<Uint8Array> {
  const { env } = await getCloudflareContext({ async: true });
  const token = crypto.randomUUID();

  await env.PRINT_STASH.put(token, JSON.stringify({ input, result }), { expirationTtl: STASH_TTL_SECONDS });

  try {
    const res = await env.MYBROWSER.quickAction('pdf', {
      url: `${origin}/print/${token}`,
      emulateMediaType: 'print',
      gotoOptions: { waitUntil: ['load', 'networkidle0'] },
      waitForTimeout: 1200,
      pdfOptions: { format: 'a4', printBackground: true, preferCSSPageSize: true },
    });

    if (!res.ok) {
      throw new Error(`PDF rendering failed: ${await res.text().catch(() => res.statusText)}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    await env.PRINT_STASH.delete(token);
  }
}

export async function readStashedReport(
  token: string,
): Promise<{ input: CompanyInput; result: AssessmentResult } | null> {
  const { env } = await getCloudflareContext({ async: true });
  const stored = await env.PRINT_STASH.get(token);
  if (!stored) return null;
  return JSON.parse(stored) as { input: CompanyInput; result: AssessmentResult };
}
