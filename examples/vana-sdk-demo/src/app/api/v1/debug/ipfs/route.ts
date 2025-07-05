import { NextRequest, NextResponse } from "next/server";
import { PinataStorage } from "vana-sdk";
import { relayerStorage } from "@/lib/relayer";

export async function GET() {
  try {
    // Test Pinata connection using SDK
    let ipfsInfo = null;

    if (process.env.PINATA_JWT) {
      try {
        const pinataProvider = new PinataStorage({
          jwt: process.env.PINATA_JWT,
          gatewayUrl:
            process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud",
        });

        const pinataTest = await pinataProvider.testConnection();

        if (pinataTest.success) {
          try {
            // Get recent pins using SDK
            const recentPins = await pinataProvider.list({ limit: 10 });
            ipfsInfo = {
              connected: true,
              accountInfo: pinataTest.data,
              recentPins: recentPins.map((pin: any) => ({
                hash: pin.metadata?.ipfsHash || pin.id,
                name: pin.name,
                size: pin.size,
                date: pin.createdAt,
                metadata: pin.metadata?.pinataMetadata,
              })),
            };
          } catch (error) {
            ipfsInfo = {
              connected: true,
              accountInfo: pinataTest.data,
              error: `Failed to list pins: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
          }
        } else {
          ipfsInfo = {
            connected: false,
            error: pinataTest.error,
          };
        }
      } catch (error) {
        ipfsInfo = {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      ipfsInfo = {
        connected: false,
        error: "PINATA_JWT not configured",
      };
    }

    // Get in-memory storage info
    const memoryStorage = relayerStorage.getAll();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      storage: {
        ipfs: ipfsInfo,
        memory: {
          enabled: true,
          entries: memoryStorage.length,
          data: memoryStorage,
        },
      },
      environment: {
        pinataConfigured: !!process.env.PINATA_JWT,
        gatewayUrl:
          process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud",
      },
    });
  } catch (error) {
    console.error("❌ Debug endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// POST endpoint to test IPFS storage
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testData = "test-data-" + Date.now() } = body;

    if (!process.env.PINATA_JWT) {
      return NextResponse.json(
        {
          success: false,
          error: "Pinata not configured - PINATA_JWT missing",
        },
        { status: 400 },
      );
    }

    // Use SDK storage for testing
    const pinataProvider = new PinataStorage({
      jwt: process.env.PINATA_JWT,
      gatewayUrl:
        process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud",
    });

    const testParameters = JSON.stringify({
      test: true,
      data: testData,
      timestamp: new Date().toISOString(),
      purpose: "debug-test",
    });

    const blob = new Blob([testParameters], { type: "application/json" });
    const filename = `debug-test-${Date.now()}.json`;

    const result = await pinataProvider.upload(blob, filename);

    return NextResponse.json({
      success: true,
      message: "Test storage successful",
      result: {
        ipfsHash: result.metadata?.ipfsHash,
        grantUrl: result.metadata?.ipfsUrl,
        size: result.size,
        url: result.url,
      },
      testData: JSON.parse(testParameters),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ IPFS test error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
