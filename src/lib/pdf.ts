import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Browser } from 'puppeteer-core';
import { onCloudflareWorkers } from './runtime';
import type { AssessmentResult, CompanyInput } from './types';

/*
 * The PDF is a print of /print/<token>: the report is stashed under a one-time token, a headless
 * browser opens that page, and the entry is dropped once the PDF exists. Two hosts are supported:
 * - Cloudflare Workers: KV holds the stash and Browser Rendering prints.
 * - Node.js (Railway, local dev): this process's memory holds the stash and a local Chromium prints.
 */

type StashedReport = { input: CompanyInput; result: AssessmentResult };

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
  const token = crypto.randomUUID();
  const report = JSON.stringify({ input, result });
  return onCloudflareWorkers()
    ? printOnCloudflare(origin, token, report)
    : printWithChromium(origin, token, report);
}

export async function readStashedReport(token: string): Promise<StashedReport | null> {
  const stored = onCloudflareWorkers()
    ? await (await cloudflareBindings()).PRINT_STASH.get(token)
    : readMemoryStash(token);
  return stored ? (JSON.parse(stored) as StashedReport) : null;
}

// ---------------------------------------------------------------------------------------------
// Cloudflare Workers
// ---------------------------------------------------------------------------------------------

// Typed here instead of through the generated cloudflare-env.d.ts, which is gitignored: a fresh
// checkout (Railway builds straight from GitHub) has to type-check without it.
type CloudflareBindings = {
  PRINT_STASH: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  };
  MYBROWSER: { quickAction(action: 'pdf', options: Record<string, unknown>): Promise<Response> };
};

async function cloudflareBindings(): Promise<CloudflareBindings> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as CloudflareBindings;
}

// KV, not Cache API: the Cache API is scoped to whichever single Cloudflare datacenter wrote the
// entry, and Browser Rendering's headless browser isn't guaranteed to run in that same one — a
// stash-then-immediately-read-elsewhere pattern would silently miss. KV is readable from any colo.
async function printOnCloudflare(origin: string, token: string, report: string): Promise<Uint8Array> {
  const env = await cloudflareBindings();
  await env.PRINT_STASH.put(token, report, { expirationTtl: STASH_TTL_SECONDS });

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

// ---------------------------------------------------------------------------------------------
// Node.js (Railway, local dev)
// ---------------------------------------------------------------------------------------------

type MemoryStash = Map<string, { report: string; expiresAt: number }>;

// On globalThis because the API route that writes the stash and the print page that reads it are
// bundled separately, so a module-level Map wouldn't be shared between them.
const memoryStash = ((globalThis as unknown as Record<symbol, MemoryStash | undefined>)[
  Symbol.for('ndi.dr12.printStash')
] ??= new Map());

function writeMemoryStash(token: string, report: string): void {
  const now = Date.now();
  for (const [key, entry] of memoryStash) if (entry.expiresAt <= now) memoryStash.delete(key);
  memoryStash.set(token, { report, expiresAt: now + STASH_TTL_SECONDS * 1000 });
}

function readMemoryStash(token: string): string | null {
  const entry = memoryStash.get(token);
  return entry && entry.expiresAt > Date.now() ? entry.report : null;
}

// Where Chrome or Chromium usually lives. CHROMIUM_PATH overrides this (the Docker image sets it).
const CHROMIUM_LOCATIONS: Partial<Record<NodeJS.Platform, string[]>> = {
  linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
};

async function findChromium(): Promise<string> {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const { existsSync } = await import('node:fs');
  const found = CHROMIUM_LOCATIONS[process.platform]?.find((path) => existsSync(path));
  if (!found) {
    throw new Error('No Chrome or Chromium found to print the PDF — install one, or set CHROMIUM_PATH.');
  }
  return found;
}

// The browser opens the print page on this same server. In production with PORT set (Railway),
// that's the loopback address: it stays on this instance, where the stash lives, and off the public
// internet. In `next dev` it's the address the app was opened on, because dev mode blocks its
// scripts for any other host (allowedDevOrigins).
function printOrigin(requestOrigin: string): string {
  return process.env.NODE_ENV === 'production' && process.env.PORT
    ? `http://127.0.0.1:${process.env.PORT}`
    : requestOrigin;
}

async function printWithChromium(requestOrigin: string, token: string, report: string): Promise<Uint8Array> {
  // Loaded at run time, not bundled: Cloudflare builds, which never come here, mustn't pull
  // puppeteer into the Worker. A constant name won't do, because Next's minifier folds even
  // ['puppeteer', 'core'].join('-') into import("puppeteer-core"), which the Worker's bundler then
  // follows. Reading an (unset) environment variable keeps it a run-time value.
  const moduleName = process.env.PUPPETEER_PACKAGE || 'puppeteer-core';
  const { default: puppeteer } = (await import(
    /* webpackIgnore: true */ moduleName
  )) as typeof import('puppeteer-core');

  writeMemoryStash(token, report);
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      executablePath: await findChromium(),
      // Containers run as root, where Chromium's sandbox can't start. This browser only ever opens
      // the app's own print page.
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
    });
    const page = await browser.newPage();
    // Same settings as the PDFs checked in QA: a desktop-sized window in print mode, A4 with backgrounds.
    await page.setViewport({ width: 1440, height: 900 });
    await page.emulateMediaType('print');
    await page.goto(`${printOrigin(requestOrigin)}/print/${token}`, {
      waitUntil: ['load', 'networkidle0'],
      timeout: 60_000,
    });
    // The charts draw in the browser after the page loads, which takes longer on a cold or busy
    // server (or in `next dev`). Print only once every visible chart has drawn its SVG.
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.recharts-responsive-container')).every(
            (chart) => chart.getClientRects().length === 0 || chart.querySelector('svg.recharts-surface'),
          ),
        { timeout: 30_000 },
      )
      .catch(() => {
        throw new Error('The report’s charts didn’t finish drawing, so no PDF was made. Please try again.');
      });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    memoryStash.delete(token);
    await browser?.close().catch(() => undefined);
  }
}
