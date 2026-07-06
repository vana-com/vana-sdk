/**
 * Vana protocol networks known to this SDK release.
 *
 * The network name is the ergonomic public API; the chain ID is the protocol
 * namespace used by chain-scoped services such as storage and escrow.
 *
 * @category Protocol
 */
export type ProtocolNetwork = "mainnet" | "moksha";

const PROTOCOL_NETWORK_CHAIN_IDS: Record<ProtocolNetwork, number> = {
  mainnet: 1480,
  moksha: 14800,
};

export function isProtocolNetwork(value: unknown): value is ProtocolNetwork {
  return (
    typeof value === "string" &&
    Object.hasOwn(PROTOCOL_NETWORK_CHAIN_IDS, value)
  );
}

export function getProtocolNetworkChainId(network: ProtocolNetwork): number {
  if (!isProtocolNetwork(network)) {
    throw new Error(`Unsupported Vana protocol network: ${String(network)}`);
  }
  return PROTOCOL_NETWORK_CHAIN_IDS[network];
}
