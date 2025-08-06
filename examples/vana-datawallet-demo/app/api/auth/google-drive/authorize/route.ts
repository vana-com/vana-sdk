import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userAddress } = await request.json();
    
    if (!userAddress) {
      return NextResponse.json({ error: 'User address required' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    
    if (!clientId) {
      return NextResponse.json({ error: 'Google Drive not configured' }, { status: 500 });
    }

    // Construct redirect URI using the request origin
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/auth/google-drive/callback`;

    const scope = 'https://www.googleapis.com/auth/drive.file';
    const state = Buffer.from(JSON.stringify({ userAddress })).toString('base64');
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}&` +
      `access_type=offline&` +
      `prompt=consent`;

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Google Drive authorize error:', error);
    return NextResponse.json({ error: 'Authorization failed' }, { status: 500 });
  }
}