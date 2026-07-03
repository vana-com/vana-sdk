import { getVanaController, returnUrlFromRequest } from "@/lib/vana";
import { errorResponse } from "../responses";

export const runtime = "nodejs";

// This route is unauthenticated so the example runs with zero setup. Before
// production, bind it to a signed-in user session and rate-limit it — each
// call creates a real access request in live mode.
export async function POST(request: Request): Promise<Response> {
  try {
    const accessRequest = await getVanaController().createAccessRequest({
      returnUrl: returnUrlFromRequest(request.url),
    });
    return Response.json(accessRequest);
  } catch (error) {
    return errorResponse(error);
  }
}
