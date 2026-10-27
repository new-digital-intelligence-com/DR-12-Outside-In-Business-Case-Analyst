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

The current production version runs on Railway:

**https://outside-in-assessment-production.up.railway.app**

### Railway (production)

The service **outside-in-assessment**, in the Railway project of the same name (NDI workspace),
deploys from this repo's `main` branch: every push to `main` builds and deploys it. Railway builds
the `Dockerfile`: Node 24 plus Chromium, which prints the PDF report (`src/lib/pdf.ts`).

Variables live in Railway (service → Variables), never in the repo:

| Variable | What it turns on |
| --- | --- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Sign-In (the public OAuth client ID) |
| `AI_EMPLOYEES_API_KEY` | the live NDI AI Employees catalogue (without it, the bundled snapshot) |
| `ANTHROPIC_API_KEY` | live company research |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | optional: "Send via email" (setup below) |

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` is compiled into the browser code, so it only takes effect after a
rebuild (Railway redeploys after every variable change).

### Cloudflare Workers

This repo is also set up for Cloudflare Workers (via `@opennextjs/cloudflare`), deployed at:

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
2. **PDF delivery** — "Download PDF" opens a dialog (`src/components/PdfDeliveryDialog.tsx`) with
   two independent switches: "Download now" (`src/app/api/generate-pdf/route.ts` has a headless
   browser print the report page `/print/[token]` with the print stylesheet in `globals.css`; see
   `src/lib/pdf.ts`. On Railway and locally that's Chromium on the same server; locally Chrome or
   Edge is found automatically, or set `CHROMIUM_PATH`. On Cloudflare it's Browser Rendering) and
   "Send via email", which sends through Gmail's SMTP server from `GMAIL_USER`
   (`src/app/api/send-report/route.ts`, `src/lib/gmail.ts`). Needs `GMAIL_USER` and
   `GMAIL_APP_PASSWORD` — see "Send via email (Gmail SMTP)" below. Without them, that path honestly
   reports "not configured" instead of pretending to send.

## NDI AI Employees

The results page and the PDF link every AI opportunity (each of the 65 sub-functions) to the NDI AI
Employees that take on its work: the best fit in the Top 10 table, and up to three per sub-function
in "NDI AI Employees for every opportunity".

- **Which AI Employees fit which sub-function** is curated by hand in `src/data/aiEmployeeMap.ts`,
  best fit first, with spare candidates. Update it when NDI adds or renames AI Employees.
- **Names, taglines and demo links** come from NDI's AI Employees catalogue, served by the AI Sales
  Coach at `/api/ai-employees`. `src/lib/aiEmployees.ts` reads it server-side with the secret
  `AI_EMPLOYEES_API_KEY` (never from the browser), about 5 minutes after the Coach's next hourly
  check of NDI's Drive (`nextCheckAt`), and sends the last `version` as an ETag so an unchanged
  catalogue costs an empty 304. The browser gets public fields only, via `/api/ai-employee-links`.
- **AI Employees still marked "Concept"** (not built yet) are never shown; the next candidate in
  the map takes their place.
- **Without the key**, or while the Coach can't be reached, the app uses the copy bundled in
  `src/data/ai-employees-snapshot.json` (public fields only). Refresh it with:

  ```bash
  AI_EMPLOYEES_API_KEY=<key> npm run ai-employees:snapshot
  ```

  To keep the links live in production, set `AI_EMPLOYEES_API_KEY` in the deployment's
  environment (the same value as in the Sales Coach).

## Google Sign-In (real, optional)

The top-right sign-in button uses real Google Identity Services (`src/components/GoogleSignInButton.tsx`)
— clicking it opens Google's own account chooser popup, no email typing. It needs a Google OAuth
Client ID, which only you can create:

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add `http://localhost:3000`,
   `https://outside-in-assessment-production.up.railway.app` (Railway) and
   `https://outside-in-assessment.new-digital-intelligence.workers.dev` (Cloudflare). No redirect
   URI is needed.
3. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the client
   ID. Restart `npm run dev`.

Without a configured Client ID, the button area shows "Google Sign-In not configured" instead of a
broken button — the rest of the app works identically either way. Signing in only stores the
user's name/email/picture (from the Google ID token, decoded client-side — not verified against
Google's servers) for display in the header; it doesn't gate any part of the app, and there's no
backend session.

## Send via email (Gmail SMTP)

Emailing the PDF goes through Gmail's SMTP server (`smtp.gmail.com`, port 465), signed in with an
app password, and every email comes from that account's address (`src/lib/gmail.ts`). Setup:

1. On the sending Google account, turn on 2-Step Verification, then create an app password at
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). (A Google
   Workspace admin can turn app passwords off for the organization.)
2. Set `GMAIL_USER` to the account's address and `GMAIL_APP_PASSWORD` to the app password (Railway:
   the service's variables; local: `.env.local`). Spaces in the app password don't matter.

An app password opens the whole mailbox, not just sending, so keep it only in the deployment's
secrets. Changing the account's password revokes its app passwords; then create a new one.

SMTP needs a Node.js host: Railway allows outgoing SMTP only on its Pro plan and above, and
Cloudflare Workers can't send it at all. If the mail server can't be reached, the send fails with
an error that says so.

Without both `GMAIL_USER` and `GMAIL_APP_PASSWORD`, the "send via email" switch fails with an
honest "not configured" error.

## Data model

`src/data/model-data.json` is generated from the Excel workbook's Taxonomy Reference, Industries,
IndustryFTEProfile, Input and Parameter tabs. `src/lib/calc.ts` mirrors the workbook's FTE Mapping
and BusinessCase sheet formulas exactly (seed % FTE from industry benchmark or generic fallback,
target AI FTE, gross savings, AI cost, implementation cost, revenue uplift, priority score/rank,
wave assignment, and the monthly ramp).
