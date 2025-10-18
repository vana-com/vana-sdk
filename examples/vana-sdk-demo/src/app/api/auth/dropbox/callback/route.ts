import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth2 callback endpoint for Dropbox
 * Handles the authorization code and exchanges it for tokens
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const authorizationCode = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.json(
        { error: `OAuth denied: ${error}` },
        { status: 400 },
      );
    }

    if (!authorizationCode) {
      return NextResponse.json(
        { error: "OAuth missing authorization code" },
        { status: 400 },
      );
    }

    const clientId = process.env.DROPBOX_CLIENT_ID;
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
    const redirectUri =
      process.env.DROPBOX_REDIRECT_URI ??
      `${request.nextUrl.origin}/api/auth/dropbox/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Dropbox credentials not configured" },
        { status: 500 },
      );
    }

    const tokenResponse = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: authorizationCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Dropbox token exchange failed:", errorData);
      return NextResponse.json(
        { error: "Dropbox token exchange failed" },
        { status: 500 },
      );
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = Date.now() + tokenData.expires_in * 1000;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dropbox Authorization Success</title>
      </head>
      <body>
        <script>
          const tokens = ${JSON.stringify({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
          })};
          
          if (window.opener) {
            window.opener.postMessage({ type: 'DROPBOX_AUTH_SUCCESS', tokens }, '*');
            window.close();
          }
        </script>
        <p>Authentication successful. You can close this window.</p>
      </body>
      </html>
    `;

    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Dropbox OAuth callback error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
