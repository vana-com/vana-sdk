import { NextRequest, NextResponse } from "next/server";

/**
 * OAuth2 callback endpoint for Google Drive
 * Handles the authorization code and exchanges it for tokens
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const authorizationCode = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}?error=oauth_denied&message=${encodeURIComponent(error)}`,
      );
    }

    if (!authorizationCode) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}?error=oauth_missing_code`,
      );
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_DRIVE_REDIRECT_URI ||
      `${request.nextUrl.origin}/api/auth/google-drive/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}?error=oauth_config_missing`,
      );
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
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
      console.error("Token exchange failed:", errorData);
      return NextResponse.redirect(
        `${request.nextUrl.origin}?error=oauth_token_exchange_failed`,
      );
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = Date.now() + tokenData.expires_in * 1000;

    // Create a success page that posts tokens to parent window
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive Authorization Success</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; text-align: center; }
          .success { color: green; }
          .loading { color: #666; }
        </style>
      </head>
      <body>
        <h1 class="success">✅ Google Drive Authorization Successful</h1>
        <p class="loading">Redirecting back to the application...</p>
        <script>
          // Post tokens to parent window (demo app)
          const tokens = ${JSON.stringify({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: expiresAt,
            isAuthorized: true,
          })};
          
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_DRIVE_AUTH_SUCCESS', tokens }, '*');
            window.close();
          } else {
            // Fallback: redirect to main page with tokens in URL (not recommended for production)
            const params = new URLSearchParams({
              google_drive_auth: 'success',
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken || '',
              expires_at: tokens.expiresAt.toString()
            });
            window.location.href = '?' + params.toString();
          }
        </script>
      </body>
      </html>
    `;

    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `${request.nextUrl.origin}?error=oauth_callback_error`,
    );
  }
}
