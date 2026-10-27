import raw from './alpbach-companies.json';
import { normalizeCompanyName } from '@/lib/companyName';

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

const byNormalizedName = new Map<string, AlpbachCompany>(
  ALPBACH_COMPANIES.map((c) => [normalizeCompanyName(c.companyName), c])
);

/** Pre-researched company profiles for the Alpbach Festival pilot group — checked before falling
 * back to live AI research, so this group's assessments load instantly instead of waiting on a
 * web-search research pass. */
export function findAlpbachCompany(name: string): AlpbachCompany | null {
  return byNormalizedName.get(normalizeCompanyName(name)) ?? null;
}
