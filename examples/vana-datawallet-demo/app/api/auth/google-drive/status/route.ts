import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { tokens } = await request.json();
    
    if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
      return NextResponse.json({
        authenticated: false,
        message: 'No Google Drive tokens provided'
      });
    }

    // Check if token is expired
    const now = Date.now();
    const isExpired = tokens.expiresAt && tokens.expiresAt <= now;

    if (isExpired && tokens.refreshToken) {
      // Try to refresh the token
      try {
        const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          throw new Error('Google Drive not configured');
        }

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            refresh_token: tokens.refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
          }),
        });

        const newTokens = await tokenResponse.json();

        if (!tokenResponse.ok) {
          throw new Error(newTokens.error || 'Token refresh failed');
        }

        // Calculate expiration timestamp
        const expiresAt = Date.now() + (newTokens.expires_in * 1000);

        return NextResponse.json({
          authenticated: true,
          tokens: {
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token || tokens.refreshToken,
            expiresAt,
            folderId: tokens.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID
          },
          refreshed: true
        });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return NextResponse.json({
          authenticated: false,
          message: 'Token expired and refresh failed',
          error: refreshError instanceof Error ? refreshError.message : 'Refresh failed'
        });
      }
    }

    // Token is still valid
    return NextResponse.json({
      authenticated: true,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        folderId: tokens.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID
      }
    });
    
  } catch (error) {
    console.error('Error checking Google Drive auth status:', error);
    return NextResponse.json(
      { 
        authenticated: false, 
        error: 'Failed to check authentication status' 
      },
      { status: 500 }
    );
  }
}