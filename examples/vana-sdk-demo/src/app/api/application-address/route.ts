import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";

export function GET() {
  try {
    // Get private key from server-side environment variable
    const applicationPrivateKey = process.env.APPLICATION_PRIVATE_KEY;
    if (!applicationPrivateKey) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    // Create account from private key to derive the address
    const applicationAccount = privateKeyToAccount(
      applicationPrivateKey as `0x${string}`,
    );

    return NextResponse.json({
      success: true,
      data: {
        applicationAddress: applicationAccount.address,
      },
    });
  } catch (error) {
    console.error("Failed to get application address:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
