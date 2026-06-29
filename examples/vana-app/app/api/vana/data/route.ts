import { getVanaController } from "@/lib/vana";
import { errorResponse, missingRequestIdResponse } from "../responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) return missingRequestIdResponse();

  try {
    const result = await getVanaController().readApprovedData({ requestId });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
