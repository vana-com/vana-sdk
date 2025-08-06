import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

interface ParaJwtPayload {
  sub: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
  auth_type?: "email" | "phone" | "telegram" | "farcaster" | "external_wallet";
  auth_id?: string;
  email?: string;
  phone?: string;
  telegram?: string;
  farcaster?: string;
  wallet_address?: string;
}

// Para JWKS URLs for different environments
const PARA_JWKS_URLS = {
  production: "https://prod.para.co/.well-known/jwks.json",
  beta: "https://beta.para.co/.well-known/jwks.json", 
  sandbox: "https://sandbox.para.co/.well-known/jwks.json",
};

export async function POST(request: NextRequest) {
  try {
    const { jwt } = await request.json();

    if (!jwt) {
      return NextResponse.json(
        { error: "JWT token is required" },
        { status: 400 }
      );
    }

    // Determine the environment from JWT issuer or use production as default
    const environment = "production";
    const jwksUrl = PARA_JWKS_URLS[environment];

    // Create JWKS client
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    // Verify the JWT
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: `https://prod.para.co`,
      audience: process.env.NEXT_PUBLIC_PARA_KEY,
    });

    const paraPayload = payload as ParaJwtPayload;

    // Create or update user based on Para JWT payload
    const user = {
      id: paraPayload.sub,
      address: paraPayload.wallet_address,
      email: paraPayload.email,
      phone: paraPayload.phone,
      telegram: paraPayload.telegram,
      farcaster: paraPayload.farcaster,
      authType: paraPayload.auth_type || "external_wallet",
      authId: paraPayload.auth_id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // In a real app, you would save this to your database
    // For this demo, we'll just return the user data
    
    return NextResponse.json({
      success: true,
      user,
      para: {
        sub: paraPayload.sub,
        authType: paraPayload.auth_type,
        authId: paraPayload.auth_id,
      },
    });

  } catch (error) {
    console.error("JWT verification error:", error);

    if (error instanceof Error) {
      if (error.message.includes("expired")) {
        return NextResponse.json(
          { error: "JWT token has expired" },
          { status: 401 }
        );
      }
      
      if (error.message.includes("signature")) {
        return NextResponse.json(
          { error: "Invalid JWT signature" },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: "JWT verification failed" },
      { status: 401 }
    );
  }
}