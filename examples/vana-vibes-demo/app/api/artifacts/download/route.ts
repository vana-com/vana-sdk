import { type NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operationId, artifactPath } = body;

    if (!operationId || !artifactPath) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get the app's private key
    const applicationPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!applicationPrivateKey) {
      throw new Error("RELAYER_PRIVATE_KEY environment variable is required");
    }

    // Create account from private key
    const applicationAccount = privateKeyToAccount(
      applicationPrivateKey as `0x${string}`,
    );

    // Create the request data
    const requestData = {
      operation_id: operationId,
      artifact_path: artifactPath,
    };

    const requestJson = JSON.stringify(requestData);
    console.log("Signing request data:", requestJson);

    // Sign with the app's account
    const signature = await applicationAccount.signMessage({
      message: requestJson,
    });
    console.log("Signature created:", signature);

    // Get server URL
    const serverUrl =
      process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL ??
      "https://test.server.vana.com/api/v1";

    // Prepare the request body
    const requestBody = {
      ...requestData,
      signature,
    };
    console.log("Sending to personal server:", {
      url: `${serverUrl}/artifacts/download`,
      body: requestBody,
    });

    // Make the download request
    const response = await fetch(`${serverUrl}/artifacts/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Personal server error response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });

      // Try to parse error details
      try {
        const errorData = JSON.parse(errorText);
        console.error("Parsed error details:", errorData);
      } catch {
        // Not JSON
      }

      throw new Error(
        `Artifact download failed: ${response.status} - ${errorText}`,
      );
    }

    // Get the content type from the response
    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";

    // Return the artifact as a response
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${artifactPath}"`,
      },
    });
  } catch (error) {
    console.error("Artifact download error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
