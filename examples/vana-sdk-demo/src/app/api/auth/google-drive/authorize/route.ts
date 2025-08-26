import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth2 authorization endpoint for Google Drive
 * Redirects user to Google's OAuth consent screen
 */
export function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const redirectUri =
      process.env.GOOGLE_DRIVE_REDIRECT_URI ||
      `${request.nextUrl.origin}/api/auth/google-drive/callback`;

    if (!clientId) {
      return NextResponse.json(
        { error: "Google Drive client ID not configured" },
        { status: 500 },
      );
    }

    // Required scopes for Google Drive API
    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ];

    // Build authorization URL
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");

    // Redirect to Google OAuth
    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error("OAuth authorization error:", error);
    return NextResponse.json(
      { error: "Failed to initiate OAuth flow" },
      { status: 500 },
    );
  }
}
