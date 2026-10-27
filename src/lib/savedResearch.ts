import { normalizeCompanyName, searchableName } from './companyName';
import { onCloudflareWorkers } from './runtime';
import type { CompanyCandidate, ResearchResponse, SavedCompany } from './types';

/*
 * Saved company research, so the same company isn't web-searched twice. Each finished research,
 * and each list of companies found for a typed name, is kept in one JSON file. While someone types
 * a company name, the companies in it are suggested; picking one loads its research instantly.
 * Everyone using the app shares these suggestions.
 *
 * The file is <dir>/saved-research.json, where <dir> is SAVED_RESEARCH_DIR if set, else the Railway
 * volume (Railway sets RAILWAY_VOLUME_MOUNT_PATH when one is attached), else .data in the working
 * directory. Cloudflare Workers have no disk, so there nothing is saved. Edits to the file are
 * picked up when the app restarts.
 */

const FILE_NAME = 'saved-research.json';
// Far more than this app will see; the limits only stop the file from growing forever.
const MAX_COMPANIES = 2000;
const MAX_SEARCHES = 2000;
const MAX_NAMES_PER_COMPANY = 20;

export type SavedFigures = Pick<
  ResearchResponse,
  | 'revenueEur'
  | 'profitEur'
  | 'totalFte'
  | 'avgRevenuePerFte'
  | 'industryL1'
  | 'industrySegment'
  | 'avgLoadedCostPerFte'
>;

export interface SavedResearch {
  candidate: CompanyCandidate;
  /** The company's own name, then the names people typed to find it. */
  names: string[];
  figures: SavedFigures;
  note: string;
  savedAt: string;
}

interface SavedSearch {
  /** The name as typed. */
  query: string;
  candidates: CompanyCandidate[];
  savedAt: string;
}

interface StoreFile {
  version: 1;
  /** By companyKey(candidate). */
  companies: Record<string, SavedResearch>;
  /** By searchKey(typed name). */
  searches: Record<string, SavedSearch>;
}

type StoreState = { file: Promise<StoreFile | null> | null; writes: Promise<void> };

// On globalThis because each API route is bundled separately: this way they share one copy of the
// file in memory and one queue of writes.
const state = ((globalThis as unknown as Record<symbol, StoreState | undefined>)[
  Symbol.for('ndi.dr12.savedResearch')
] ??= { file: null, writes: Promise.resolve() });

// ---------------------------------------------------------------------------------------------
// Used by the API routes. None of these throw: a problem with the file is logged, and research
// then just runs as if nothing were saved.
// ---------------------------------------------------------------------------------------------

/** Saved companies matching what's typed so far: exact name first, then names starting with it,
 * then names with a word starting with it; newest first within each. */
export async function findSavedCompanies(typed: string, limit = 8): Promise<SavedCompany[]> {
  return safely([], async () => {
    const prefix = searchableName(typed);
    const exactKey = normalizeCompanyName(typed);
    const store = await load();
    if (!prefix || !store) return [];

    const matches: { saved: SavedResearch; rank: number }[] = [];
    for (const saved of Object.values(store.companies)) {
      const names = [saved.candidate.name, ...saved.names];
      const exact = exactKey !== '' && names.some((name) => normalizeCompanyName(name) === exactKey);
      const texts = [...names, saved.candidate.domain ?? ''].map(searchableName);
      const startsName = texts.some((text) => text.startsWith(prefix));
      const startsWord = texts.some((text) => ` ${text}`.includes(` ${prefix}`));
      if (exact || startsWord) matches.push({ saved, rank: exact ? 0 : startsName ? 1 : 2 });
    }
    matches.sort((a, b) => a.rank - b.rank || b.saved.savedAt.localeCompare(a.saved.savedAt));
    return matches
      .slice(0, limit)
      .map(({ saved, rank }) => ({ candidate: saved.candidate, savedAt: saved.savedAt, exact: rank === 0 }));
  });
}

/**
 * This server's own record of a company the browser says the user picked: from the saved list of
 * companies found for this typed name, or from saved research. Null when this server never found
 * that company itself; such a company is researched but never saved, so nobody can plant a made-up
 * company in everyone's suggestions.
 */
export async function findKnownCandidate(typedName: string, picked: CompanyCandidate): Promise<CompanyCandidate | null> {
  return safely(null, async () => {
    const store = await load();
    if (!store) return null;
    const key = companyKey(cleanCandidate(picked));
    return (
      store.companies[key]?.candidate ??
      store.searches[searchKey(typedName)]?.candidates.find((c) => companyKey(c) === key) ??
      null
    );
  });
}

/** Saved research on this company, if any. Also remembers the typed name, so typing it suggests
 * this company from then on. */
export async function getSavedResearch(candidate: CompanyCandidate, typedName: string): Promise<SavedResearch | null> {
  return safely(null, async () => {
    const store = await load();
    const key = companyKey(candidate);
    const saved = store?.companies[key];
    if (!saved) return null;
    if (withName(saved.names, typedName) !== saved.names) {
      await change((s) => {
        const entry = s.companies[key];
        if (entry) entry.names = withName(entry.names, typedName);
      });
    }
    return saved;
  });
}

/** Saves finished research on a company. A failed search, or one that found nothing, isn't kept:
 * better to search again next time. */
export async function saveResearch(candidate: CompanyCandidate, typedName: string, result: ResearchResponse): Promise<void> {
  await safely(undefined, async () => {
    const figures: SavedFigures = {
      revenueEur: result.revenueEur,
      profitEur: result.profitEur,
      totalFte: result.totalFte,
      avgRevenuePerFte: result.avgRevenuePerFte,
      industryL1: result.industryL1,
      industrySegment: result.industrySegment,
      avgLoadedCostPerFte: result.avgLoadedCostPerFte,
    };
    if (!result.live || Object.values(figures).every((value) => value === null)) return;

    const key = companyKey(candidate);
    await change((store) => {
      const names = store.companies[key]?.names ?? [];
      store.companies[key] = {
        candidate,
        names: withName(withName(names, candidate.name), typedName),
        figures,
        note: result.note,
        savedAt: new Date().toISOString(),
      };
      dropOldest(store.companies, MAX_COMPANIES);
    });
  });
}

/** The companies an earlier search found for this typed name, if saved. */
export async function getSavedSearch(typedName: string): Promise<SavedSearch | null> {
  return safely(null, async () => (await load())?.searches[searchKey(typedName)] ?? null);
}

/** Saves the companies a search found for this typed name, and returns them tidied up (trimmed,
 * bare website domains, duplicates dropped): the way they should be shown. */
export async function saveSearch(typedName: string, found: CompanyCandidate[]): Promise<CompanyCandidate[]> {
  const candidates: CompanyCandidate[] = [];
  const keys = new Set<string>();
  for (const candidate of found.map(cleanCandidate)) {
    const key = companyKey(candidate);
    if (!candidate.name || keys.has(key)) continue;
    keys.add(key);
    candidates.push(candidate);
  }

  if (candidates.length > 0) {
    await safely(undefined, () =>
      change((store) => {
        store.searches[searchKey(typedName)] = {
          query: clip(typedName, 200),
          candidates,
          savedAt: new Date().toISOString(),
        };
        dropOldest(store.searches, MAX_SEARCHES);
      }),
    );
  }
  return candidates;
}

/** A company as the browser or the model described it, with every field a tidy string. */
export function cleanCandidate(candidate: CompanyCandidate): CompanyCandidate {
  return {
    name: clip(candidate.name, 200),
    location: clip(candidate.location, 200) || 'Unknown',
    domain: bareDomain(clip(candidate.domain, 200)),
    description: clip(candidate.description, 500),
  };
}

// ---------------------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------------------

/** The same company found again (same name, and the same website or else the same location)
 * gets the same key. */
function companyKey(candidate: CompanyCandidate): string {
  return `${nameKey(candidate.name)}|${bareDomain(candidate.domain) ?? normalizeCompanyName(candidate.location)}`;
}

/** "Novencia", "NOVENCIA" and "Novencia SA" are the same search. */
function searchKey(typedName: string): string {
  return nameKey(typedName);
}

function nameKey(name: string): string {
  return normalizeCompanyName(name) || searchableName(name);
}

/** "https://www.Example.com/about" → "example.com". */
function bareDomain(domain: string | null | undefined): string | null {
  const host = (domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#:].*$/, '')
    .replace(/\.$/, '');
  return host || null;
}

function clip(text: unknown, max: number): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The names with this one added, or the same array when it's already there (or blank). */
function withName(names: string[], name: string): string[] {
  const clean = clip(name, 200);
  const key = nameKey(clean);
  if (!key || names.length >= MAX_NAMES_PER_COMPANY || names.some((n) => nameKey(n) === key)) return names;
  return [...names, clean];
}

function dropOldest<T extends { savedAt: string }>(records: Record<string, T>, max: number): void {
  const keys = Object.keys(records);
  if (keys.length <= max) return;
  keys.sort((a, b) => records[a].savedAt.localeCompare(records[b].savedAt));
  for (const key of keys.slice(0, keys.length - max)) delete records[key];
}

// ---------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------

async function safely<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error('[saved-research]', err);
    return fallback;
  }
}

async function storePath(): Promise<string | null> {
  if (onCloudflareWorkers()) return null;
  const { join, resolve } = await import('node:path');
  const dir = process.env.SAVED_RESEARCH_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '.data';
  // A data folder, not source code: without the comment, the build would copy the whole project
  // into the server bundle in case this path pointed into it.
  return join(/* turbopackIgnore: true */ resolve(/* turbopackIgnore: true */ dir), FILE_NAME);
}

/** The saved research, read from disk once per process. Null when nothing can be saved here. */
function load(): Promise<StoreFile | null> {
  state.file ??= readStore().catch((err) => {
    // Don't start over with an empty file, which the next save would write over the real one.
    console.error('[saved-research] could not read the saved research; trying again next time:', err);
    state.file = null;
    return null;
  });
  return state.file;
}

async function readStore(): Promise<StoreFile | null> {
  const file = await storePath();
  if (!file) return null;
  const fs = await import('node:fs/promises');

  let text: string;
  try {
    text = await fs.readFile(/* turbopackIgnore: true */ file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw err;
  }

  try {
    const parsed = JSON.parse(text) as StoreFile;
    if (parsed?.version === 1 && parsed.companies && parsed.searches) return parsed;
    throw new Error('not a saved-research file');
  } catch (err) {
    // Keep the broken file for a look later, and start a new one.
    const aside = `${file}.unreadable-${Date.now()}`;
    console.error(`[saved-research] ${file} can't be read (${err}); moved it to ${aside}`);
    await fs.rename(/* turbopackIgnore: true */ file, aside);
    return emptyStore();
  }
}

function emptyStore(): StoreFile {
  return { version: 1, companies: {}, searches: {} };
}

/** Changes the saved research in memory, then writes it to disk, one write at a time. */
async function change(apply: (store: StoreFile) => void): Promise<void> {
  const store = await load();
  if (!store) return;
  apply(store);
  const json = JSON.stringify(store, null, 2);
  state.writes = state.writes
    .then(() => writeStore(json))
    .catch((err) => console.error('[saved-research] could not save:', err));
  await state.writes;
}

async function writeStore(json: string): Promise<void> {
  const file = await storePath();
  if (!file) return;
  const fs = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await fs.mkdir(/* turbopackIgnore: true */ dirname(file), { recursive: true });

  // Written next to the file, then renamed over it, so a crash mid-write can't leave half a file.
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(/* turbopackIgnore: true */ temp, json, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(/* turbopackIgnore: true */ temp, file);
      return;
    } catch (err) {
      // On Windows, a virus scanner or OneDrive can hold the file for a moment.
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}
