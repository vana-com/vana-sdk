import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL('/?error=auth_cancelled', request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/?error=missing_params', request.url));
    }

    // Parse state (userAddress not needed for direct token storage)
    JSON.parse(Buffer.from(state, 'base64').toString());

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    
    // Construct redirect URI using the request origin
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/auth/google-drive/callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokens.error || 'Token exchange failed');
    }

    // Calculate expiration timestamp
    const expiresAt = Date.now() + (tokens.expires_in * 1000);

    // Prepare tokens for localStorage storage
    const tokenData = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID
    };

    // Encode token data as URL-safe base64
    const encodedTokens = Buffer.from(JSON.stringify(tokenData)).toString('base64url');

    // Redirect to home page with tokens in URL
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('gd_tokens', encodedTokens);
    redirectUrl.searchParams.set('gd_success', '1');

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Google Drive callback error:', error);
    return NextResponse.redirect(new URL('/?error=callback_failed', request.url));
  }
}