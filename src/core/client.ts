import { Chain, createPublicClient, http } from "viem";
import { activeChainId, chains } from "./chains";

export const defaultFromBlock = BigInt(292220); // No need to query earlier than this

// eslint-disable-next-line no-use-before-define -- circular dependency
let _client: ReturnType<typeof createClient>;

export const createClient = (
  chainId: keyof typeof chains = activeChainId
): ReturnType<typeof createPublicClient> & { chain: Chain } => {
  if (!_client || _client.chain?.id !== chainId) {
    const chain = chains[chainId];
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    _client = createPublicClient({
      chain,
      transport: http(),
    });
  }

  return _client;
};
