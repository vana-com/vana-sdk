import { getVanaController, returnUrlFromRequest } from "@/lib/vana";
import { errorResponse } from "../responses";

export const runtime = "nodejs";

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
