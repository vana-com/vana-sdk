import { getVanaController } from "@/lib/vana";
import { errorResponse, missingRequestIdResponse } from "../responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In live mode every readApprovedData call is a fresh Personal Server read
// that can settle a fee from escrow, so serve repeat calls for the same
// request from this cache instead of re-reading (and re-paying). The cache
// holds the in-flight promise, not just the settled result, so concurrent
// calls for the same requestId share one read instead of paying twice.
// In-memory is enough for a single-process example; use a shared store (and
// bind these routes to a user session) before production.
const MAX_CACHED_READS = 100;
const readCache = new Map<string, Promise<unknown>>();

function cacheRead(requestId: string, read: Promise<unknown>): void {
  if (readCache.size >= MAX_CACHED_READS) {
    const oldest = readCache.keys().next().value;
    if (oldest !== undefined) readCache.delete(oldest);
  }
  readCache.set(requestId, read);
}

export async function GET(request: Request): Promise<Response> {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) return missingRequestIdResponse();

  let read = readCache.get(requestId);
  if (!read) {
    read = getVanaController().readApprovedData({ requestId });
    cacheRead(requestId, read);
    // Drop failed reads so the next call retries instead of replaying the error.
    read.catch(() => {
      if (readCache.get(requestId) === read) readCache.delete(requestId);
    });
  }

  try {
    return Response.json(await read);
  } catch (error) {
    return errorResponse(error, { mapNotFound: true });
  }
}
