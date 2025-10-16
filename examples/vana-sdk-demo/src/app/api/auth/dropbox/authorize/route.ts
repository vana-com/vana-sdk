import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth2 authorization endpoint for Dropbox
 * Redirects user to Dropbox's OAuth consent screen
 */
export function GET(request: NextRequest) {
  try {
    const clientId = process.env.DROPBOX_CLIENT_ID;
    const redirectUri =
      process.env.DROPBOX_REDIRECT_URI ??
      `${request.nextUrl.origin}/api/auth/dropbox/callback`;

    if (!clientId) {
      return NextResponse.json(
        { error: "Dropbox client ID not configured" },
        { status: 500 },
      );
    }

    const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("token_access_type", "offline"); // To get a refresh token
    authUrl.searchParams.set(
      "scope",
      "files.content.write files.content.read sharing.write",
    );

    // Redirect to Dropbox OAuth
    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error("Dropbox OAuth authorization error:", error);
    return NextResponse.json(
      { error: "Failed to initiate Dropbox OAuth flow" },
      { status: 500 },
    );
  }
}
