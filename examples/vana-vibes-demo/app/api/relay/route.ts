import { NextRequest, NextResponse } from "next/server";
import { getApiVanaInstance } from "../../../lib/api-vana";
import { handleRelayerRequest } from "@opendatalabs/vana-sdk/node";
import type { GenericTypedData } from "@opendatalabs/vana-sdk/node";
import type { Hash } from "viem";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      typedData,
      signature,
      expectedUserAddress,
    }: {
      typedData: GenericTypedData;
      signature: Hash;
      expectedUserAddress?: string;
    } = body;

    if (!typedData || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing typedData or signature" },
        { status: 400 },
      );
    }

    const vana = getApiVanaInstance();

    const txHandle = await handleRelayerRequest(vana, {
      typedData,
      signature,
      expectedUserAddress: expectedUserAddress as `0x${string}` | undefined,
    });

    // TransactionHandle provides both immediate hash access and event data
    // The .hash property gives us the transaction hash directly
    const transactionHash = txHandle.hash;

    return NextResponse.json({
      success: true,
      transactionHash,
    });
  } catch (error) {
    console.error("Error relaying transaction:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
