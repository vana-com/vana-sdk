import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mokshaTestnet,
  vanaMainnet,
  Vana,
  type VanaInstance,
  type VanaChain,
  type VanaChainId,
} from "@opendatalabs/vana-sdk/node";

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

const relayerAccount = privateKeyToAccount(
  RELAYER_PRIVATE_KEY as `0x${string}`,
);

function getChainConfig(chainId: VanaChainId): VanaChain {
  switch (chainId) {
    case 14800:
      return mokshaTestnet as VanaChain;
    case 1480:
      return vanaMainnet as VanaChain;
    default:
      return mokshaTestnet as VanaChain;
  }
}

export function createRelayerConfig(chainId: VanaChainId) {
  const chain = getChainConfig(chainId);

  const walletClient = createWalletClient({
    account: relayerAccount,
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  return {
    account: relayerAccount,
    chainId,
    chainRpcUrl: chain.rpcUrls.default.http[0],
    walletClient,
    publicClient,
  };
}

export async function createRelayerVana(
  chainId: VanaChainId = 14800,
): Promise<VanaInstance> {
  const config = createRelayerConfig(chainId);
  return Vana({
    walletClient: config.walletClient,
    defaultPersonalServerUrl: process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL,
  });
}

export async function getPersonalServerInfo(
  chainId: VanaChainId = 14800,
  userAddress: string,
) {
  if (!userAddress) {
    throw new Error("User address is required to fetch personal server info");
  }

  const vana = await createRelayerVana(chainId);

  try {
    const identity = await vana.server.getIdentity({
      userAddress: userAddress as `0x${string}`,
    });

    return {
      address: identity.address,
      serverUrl: identity.base_url,
      publicKey: identity.public_key,
    };
  } catch (error) {
    throw new Error(
      `Failed to get personal server info for address ${userAddress}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
