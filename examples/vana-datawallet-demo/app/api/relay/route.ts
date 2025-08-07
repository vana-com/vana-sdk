import { NextRequest, NextResponse } from "next/server";
import { createRelayerVana, getPersonalServerInfo } from "../../../lib/relayer";

/**
 * Extract permissionId from transaction logs using Blockscout API with retries
 *
 * This function handles the delay between transaction relay and blockchain indexing
 * by implementing exponential backoff retry logic.
 *
 * @param txHash - The transaction hash to fetch logs for
 * @returns Promise<string | undefined> - The extracted permissionId or undefined if not found
 */
async function getPermissionIdFromTransactionLogs(
  txHash: string,
): Promise<string | undefined> {
  // Determine network configuration
  const networkConfig =
    process.env.NEXT_PUBLIC_MOKSHA === "true" ? "moksha" : "mainnet";
  const explorerUrl =
    networkConfig === "moksha"
      ? "https://moksha.vanascan.io"
      : "https://vanascan.io";

  // Retry configuration
  const maxRetries = 10;
  const baseDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.debug(
        `🔍 Attempting to fetch transaction logs (attempt ${attempt}/${maxRetries})`,
      );

      const response = await fetch(
        `${explorerUrl}/api/v2/transactions/${txHash}/logs`,
        {
          headers: { accept: "application/json" },
        },
      );

      if (response.ok) {
        const data = await response.json();

        // Check if transaction is indexed and has logs
        if (data.items && data.items.length > 0) {
          // Find the PermissionAdded event in the logs
          const permissionAddedLog = data.items.find(
            (log: { decoded?: { method_call?: string } }) =>
              log.decoded?.method_call?.includes("PermissionAdded"),
          );

          if (permissionAddedLog?.decoded?.parameters) {
            const permissionIdParam = (
              permissionAddedLog.decoded.parameters as {
                name: string;
                value: string;
              }[]
            ).find((param) => param.name === "permissionId");

            if (permissionIdParam?.value) {
              console.info(
                `✅ Extracted permissionId from transaction logs on attempt ${attempt}:`,
                permissionIdParam.value,
              );
              return permissionIdParam.value;
            }
          }

          // If we found logs but no PermissionAdded event, log for debugging
          console.debug(
            `🔍 Found ${data.items.length} logs but no PermissionAdded event on attempt ${attempt}`,
          );
        } else {
          console.debug(
            `🔍 Transaction not yet indexed on attempt ${attempt}, will retry...`,
          );
        }
      } else {
        console.debug(
          `🔍 API response not ok (${response.status}) on attempt ${attempt}`,
        );
      }

      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.debug(`⏳ Waiting ${delay}ms before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (apiError) {
      console.warn(`⚠️ API error on attempt ${attempt}:`, apiError);

      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.debug(`⏳ Waiting ${delay}ms before retry due to error...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.warn(
    "⚠️ Could not extract permissionId from Blockscout API after all retries",
  );
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { operation, fileUrl, userAddress, grantUrl } = await request.json();

    if (!operation || !fileUrl || !userAddress || !grantUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const chainId = process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;

    // Get personal server info internally
    const serverInfo = await getPersonalServerInfo(chainId, userAddress);
    const vana = await createRelayerVana(chainId);

    // Read grantee ID from environment variable
    const granteeId = process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID
      ? BigInt(process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID)
      : BigInt(1);

    // Execute the batch operation using the relayer
    const transactionHash =
      await vana.permissions.submitAddServerFilesAndPermissions({
        granteeId,
        grant: grantUrl,
        fileUrls: [fileUrl],
        serverAddress: serverInfo.address as `0x${string}`,
        serverUrl: serverInfo.serverUrl,
        serverPublicKey: serverInfo.publicKey,
        filePermissions: [
          [
            {
              account: serverInfo.address as `0x${string}`,
              key: serverInfo.publicKey,
            },
          ],
        ],
      });

    console.info(`📋 Transaction hash: ${transactionHash}`);

    // Extract permission ID from transaction logs using Blockscout API
    console.debug(
      "🔍 Starting permission ID extraction from Blockscout API...",
    );
    const permissionId =
      await getPermissionIdFromTransactionLogs(transactionHash);

    if (permissionId) {
      console.info(`✅ Successfully extracted permission ID: ${permissionId}`);

      return NextResponse.json({
        transactionHash,
        permissionId,
        success: true,
      });
    } else {
      // Extraction failed after all retries
      const warningMessage =
        "Permission ID extraction failed - blockchain indexing delays or transaction may not contain PermissionAdded event";

      console.warn(`⚠️ ${warningMessage}`);
      console.warn(
        "💡 Transaction succeeded but permission ID could not be extracted. User can check transaction manually or try polling later.",
      );

      return NextResponse.json({
        transactionHash,
        permissionId: null,
        success: true,
        warning: warningMessage,
      });
    }
  } catch (error) {
    console.error("Relay transaction error:", error);
    return NextResponse.json(
      {
        error: "Transaction failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
