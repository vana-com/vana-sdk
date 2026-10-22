import {
  createVanaConnectHandler,
  type VanaConnectHandler,
} from "@opendatalabs/vana-sdk/server";
import { getVanaController } from "@/lib/vana";

export const runtime = "nodejs";

let connect: VanaConnectHandler | undefined;

// Every route the in-page sheet needs (config, request, status, data), bound
// to the browser that created each request. Before production, also bind it to
// a signed-in user (`session`) and rate-limit it.
function handler(request: Request): Promise<Response> {
  connect ??= createVanaConnectHandler({
    controller: getVanaController(),
    returnUrl: new URL(
      "/connect/return",
      process.env.VANA_APP_URL ?? "http://localhost:3000",
    ).toString(),
    // The embed client id Vana Account registered for this origin. Without
    // it the button uses a Vana tab instead of the sheet.
    clientId: process.env.VANA_CONNECT_CLIENT_ID,
  });
  return connect(request);
}

export { handler as GET, handler as POST };
