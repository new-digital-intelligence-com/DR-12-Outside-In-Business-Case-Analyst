import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { AssessmentResult, CompanyInput } from './types';

const STASH_TTL_SECONDS = 120;

// lib.dom's CacheStorage type doesn't know about the Workers-only `default` cache, so this bypasses
// TypeScript's merged (and here, incomplete) ambient type rather than fighting it.
interface EdgeCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
}
const edgeCache = () => (caches as unknown as { default: EdgeCache }).default;

function stashKey(token: string) {
  return `https://print-stash.internal/${token}`;
}

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

  await edgeCache().put(
    stashKey(token),
    new Response(JSON.stringify({ input, result }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${STASH_TTL_SECONDS}` },
    }),
  );

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
    await edgeCache().delete(stashKey(token));
  }
}

export async function readStashedReport(
  token: string,
): Promise<{ input: CompanyInput; result: AssessmentResult } | null> {
  const cached = await edgeCache().match(stashKey(token));
  if (!cached) return null;
  return (await cached.json()) as { input: CompanyInput; result: AssessmentResult };
}
