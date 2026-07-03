import { getVanaController } from "@/lib/vana";
import { errorResponse, missingRequestIdResponse } from "../responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In live mode every readApprovedData call is a fresh Personal Server read
// that can settle a fee from escrow, so serve repeat calls for the same
// request from this cache instead of re-reading (and re-paying). In-memory is
// enough for a single-process example; use a shared store (and bind these
// routes to a user session) before production.
const MAX_CACHED_READS = 100;
const readCache = new Map<string, unknown>();

function cacheRead(requestId: string, result: unknown): void {
  if (readCache.size >= MAX_CACHED_READS) {
    const oldest = readCache.keys().next().value;
    if (oldest !== undefined) readCache.delete(oldest);
  }
  readCache.set(requestId, result);
}

export async function GET(request: Request): Promise<Response> {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) return missingRequestIdResponse();

  const cached = readCache.get(requestId);
  if (cached !== undefined) return Response.json(cached);

  try {
    const result = await getVanaController().readApprovedData({ requestId });
    cacheRead(requestId, result);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
