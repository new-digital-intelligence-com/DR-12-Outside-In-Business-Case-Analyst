import { getAiEmployeeLinks } from '@/lib/aiEmployees';

/**
 * The NDI AI Employees matching each sub-function, for the results page. Public fields only: the
 * catalogue is read server-side with the secret key and refreshed at most about once an hour
 * (see src/lib/aiEmployees.ts), so this is cheap to call.
 */
export async function GET() {
  const links = await getAiEmployeeLinks();
  return Response.json(links, { headers: { 'Cache-Control': 'no-store' } });
}
