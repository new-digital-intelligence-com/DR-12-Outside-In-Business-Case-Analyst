import { NextRequest, NextResponse } from 'next/server';
import { findSavedCompanies } from '@/lib/savedResearch';

/** Companies with saved research whose name starts like the one being typed:
 * GET /api/research/saved?q=nov → { companies: SavedCompany[] } */
export async function GET(req: NextRequest) {
  const typed = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 200);
  const companies = await findSavedCompanies(typed);
  return NextResponse.json({ companies }, { headers: { 'Cache-Control': 'no-store' } });
}
