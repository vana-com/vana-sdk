import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token required" },
        { status: 400 },
      );
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Google Drive not configured" },
        { status: 500 },
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokens.error || "Token refresh failed");
    }

    // Calculate expiration timestamp
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    return NextResponse.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken, // Some responses don't include new refresh token
      expiresAt,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Token refresh failed",
      },
      { status: 500 },
    );
  }
}
