import { getAiEmployeeLinks } from '@/lib/aiEmployees';
import { createAssistantHandler } from '@/lib/assistant/handler';

/**
 * The read-only assessment assistant in the sidebar. POST answers a question grounded in the
 * assessment the browser sends; GET says whether it is configured (no secrets). See
 * src/lib/assistant/handler.ts for the checks (same origin, JSON, 12 MB, 20 requests/min per IP).
 */
const handler = createAssistantHandler({ getAiEmployeeLinks });

export async function GET() {
  return handler.GET();
}

export async function POST(request: Request) {
  return handler.POST(request);
}
