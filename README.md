# AI Opportunity Assessment

Interactive assessment tool built from `AI Prioritization Business Case Model.xlsx`. Walks a user
through: company name → company research → FTE mapping (65 sub-functions across 9 business
functions, seeded from industry benchmarks) → business case, prioritization matrix, sequencing and
a month-by-month cost/savings view. Mobile-friendly, single Next.js app.

The app itself needs no sign-in — anyone with the URL can run an assessment. Google Sign-In is an
optional button in the top-right corner (see below) for attributing/identifying the user; nothing
in the app is gated behind it.

## Running it

**Important:** run this from a local disk path, not a Google-Drive-mounted network share
(`H:\Shared drives\...`). Node fails to parse `package.json` over that mount
(`ERR_INVALID_PACKAGE_CONFIG`), and installs are extremely slow. Copy the `src/` folder and config
files to a local path (e.g. `C:\dev\outside-in-assessment`) and run `npm install && npm run dev`
there. This repo's canonical/shared copy lives on the drive; a local working copy is where you
actually run it.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Live deployment

Deployed to Cloudflare Workers (via `@opennextjs/cloudflare`) at:

**https://outside-in-assessment.new-digital-intelligence.workers.dev**

To redeploy after changes:

```bash
npm run cf:deploy
```

This runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`, which builds the Next.js
app, bundles it for the Workers runtime, and uploads it via Wrangler. Requires `npx wrangler login`
once per machine (opens a browser to authenticate to the Cloudflare account).

**Secrets on Cloudflare are separate from `.env.local`** — they're uploaded once via:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

(paste the key when prompted, or pipe it in non-interactively). Re-run this if the key changes;
`cf:deploy` does not re-upload secrets. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is different — Next.js inlines
`NEXT_PUBLIC_*` values into the client bundle at **build time**, so it just needs to be set in
`.env.local` before running `cf:deploy` (no separate Cloudflare-side config needed). Also add the
deployed URL as an **Authorized JavaScript origin** in the Google Cloud Console OAuth client.

**Windows note:** `@opennextjs/cloudflare` warns it isn't fully tested on Windows. In practice, a
leftover `workerd.exe` process from a previous `preview`/`dev` session can hold a lock on
`.open-next/assets` and make the next build fail with `EBUSY`. If that happens: `taskkill /IM
workerd.exe /F`, delete `.open-next`, and rebuild. (Diagnosed with Sysinternals `handle64.exe` —
`handle64 -accepteula ".open-next\assets"` shows exactly which process holds it.)

To test a build locally in the actual Workers runtime before deploying (catches Workers-specific
incompatibilities that `next dev` won't):

```bash
npm run cf:preview
```

Note the research step can take **1–3 minutes** end-to-end (two sequential Claude Opus 5 calls,
one with multi-turn web search) — this is fine on Workers, which has no hard wall-clock limit on
HTTP-triggered requests as long as the client stays connected, but it's worth knowing so a slow
response isn't mistaken for a hang.

## What's real vs. stubbed

The calculation engine (FTE mapping, industry benchmarks, business case, prioritization, wave
sequencing, 36-month monthly view) is ported directly from the Excel model's formulas and
validated against it — the numbers match to floating-point precision. That part is production-grade.

Two integrations are real but need a credential only you can provide:

1. **AI company research** (`src/app/api/research/route.ts`) — a real implementation: Claude
   researches the company with the web search tool, then a second call extracts the findings into
   structured fields (revenue, profit, FTE, industry/segment matched against our exact taxonomy,
   loaded cost per FTE), with an explicit instruction to state uncertainty rather than invent
   precise-looking numbers for private companies. Needs `ANTHROPIC_API_KEY` in `.env.local` (a
   Console API key — separate from a Claude.ai/Claude Code subscription). Without it, the step
   honestly reports "not connected" and lets the user fill in figures themselves (with a "load
   illustrative example data" shortcut for demos).
2. **PDF delivery** — "Download PDF" uses the browser's native print-to-PDF (`window.print()` with
   a print stylesheet in `globals.css`), so no fragile client-side canvas/color-parsing dependency.
   Emailing the PDF to the user isn't wired up — that needs an email-sending credential (SMTP or
   an API like SendGrid/Gmail API).

## Google Sign-In (real, optional)

The top-right sign-in button uses real Google Identity Services (`src/components/GoogleSignInButton.tsx`)
— clicking it opens Google's own account chooser popup, no email typing. It needs a Google OAuth
Client ID, which only you can create:

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add `http://localhost:3000` and
   `https://outside-in-assessment.new-digital-intelligence.workers.dev`. No redirect URI is needed.
3. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the client
   ID. Restart `npm run dev`.

Without a configured Client ID, the button area shows "Google Sign-In not configured" instead of a
broken button — the rest of the app works identically either way. Signing in only stores the
user's name/email/picture (from the Google ID token, decoded client-side — not verified against
Google's servers) for display in the header; it doesn't gate any part of the app, and there's no
backend session.

## Data model

`src/data/model-data.json` is generated from the Excel workbook's Taxonomy Reference, Industries,
IndustryFTEProfile, Input and Parameter tabs. `src/lib/calc.ts` mirrors the workbook's FTE Mapping
and BusinessCase sheet formulas exactly (seed % FTE from industry benchmark or generic fallback,
target AI FTE, gross savings, AI cost, implementation cost, revenue uplift, priority score/rank,
wave assignment, and the monthly ramp).
