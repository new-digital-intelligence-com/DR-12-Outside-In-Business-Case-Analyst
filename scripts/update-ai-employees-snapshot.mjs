// Refreshes src/data/ai-employees-snapshot.json — the copy of NDI's AI Employees catalogue the app
// falls back to when it can't reach the live API (no AI_EMPLOYEES_API_KEY, or the API is down).
//
// Usage (PowerShell):  $env:AI_EMPLOYEES_API_KEY = '<key>'; npm run ai-employees:snapshot
// Usage (bash):        AI_EMPLOYEES_API_KEY=<key> npm run ai-employees:snapshot
//
// Only public fields are written, and AI Employees still marked "Concept" (not built yet) are left
// out — the API's internal data must never end up in the repo or the browser.
import { writeFile } from 'node:fs/promises';

const API_URL = 'https://ndi-ai-sales-coach-production.up.railway.app/api/ai-employees';
const OUT_FILE = new URL('../src/data/ai-employees-snapshot.json', import.meta.url);

const key = process.env.AI_EMPLOYEES_API_KEY;
if (!key) {
  console.error('Set AI_EMPLOYEES_API_KEY first (see .env.local.example).');
  process.exit(1);
}

const res = await fetch(API_URL, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`AI Employees API answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const data = await res.json();

const employees = data.aiEmployees
  .filter((e) => e?.internal?.maturity !== 'Concept')
  .map((e) => ({
    code: e.code,
    name: e.name,
    category: e.category,
    tagline: e.tagline ?? '',
    videoUrl: e.videoUrl ?? null,
  }));

const snapshot = { catalogVersion: data.version, checkedAt: data.checkedAt ?? null, employees };
await writeFile(OUT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `Wrote ${employees.length} AI Employees (catalogue version ${data.version}; ` +
    `${data.aiEmployees.length - employees.length} concepts left out).`,
);
