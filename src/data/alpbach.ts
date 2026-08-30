import raw from './alpbach-companies.json';

export interface AlpbachCompany {
  companyName: string;
  revenueEur: number;
  profitEur: number;
  totalFte: number;
  avgRevenuePerFte: number;
  industryL1: string;
  industrySegment: string;
  avgLoadedCostPerFte: number;
}

const ALPBACH_COMPANIES = raw as AlpbachCompany[];

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Folds German umlauts/ß to their ASCII digraph form, so "Österreich" and the common
 * keyboard-limited "Oesterreich" spelling normalize to the same thing. */
function foldGerman(s: string): string {
  return s
    .replace(/ß/g, 'ss')
    .replace(/ä/gi, (m) => (m === m.toUpperCase() ? 'AE' : 'ae'))
    .replace(/ö/gi, (m) => (m === m.toUpperCase() ? 'OE' : 'oe'))
    .replace(/ü/gi, (m) => (m === m.toUpperCase() ? 'UE' : 'ue'));
}

/** Case/whitespace/diacritic/legal-suffix-insensitive, so "Magenta Telekom", "MAGENTA TELEKOM
 * (T-Mobile Austria GmbH)" and "T-Mobile Austria GmbH" all resolve to the same entry. */
function normalize(name: string): string {
  return foldGerman(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[.,&/-]/g, ' ')
    .replace(/\b(gmbh|ag|se|kg|inc|ltd|plc|sa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const byNormalizedName = new Map<string, AlpbachCompany>(
  ALPBACH_COMPANIES.map((c) => [normalize(c.companyName), c])
);

/** Pre-researched company profiles for the Alpbach Festival pilot group — checked before falling
 * back to live AI research, so this group's assessments load instantly instead of waiting on a
 * web-search research pass. */
export function findAlpbachCompany(name: string): AlpbachCompany | null {
  return byNormalizedName.get(normalize(name)) ?? null;
}
