import type { Abi, Chain } from "viem";
import { defineChain } from "viem";

export const mokshaTestnet = defineChain({
  id: 14800,
  caipNetworkId: "eip155:14800",
  chainNamespace: "eip155",
  name: "Vana Moksha Testnet",
  nativeCurrency: {
    name: "VANA",
    symbol: "VANA",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.moksha.vana.org"],
    },
  },
  blockExplorers: {
    default: {
      url: "https://moksha.vanascan.io",
      name: "Vanascan - Moksha",
    },
    blockscout: {
      url: "https://moksha.vanascan.io",
      name: "Vanascan - Moksha",
    },
  },
  contracts: {},
  abis: {},
});

export const vanaMainnet = defineChain({
  id: 1480,
  caipNetworkId: "eip155:1480",
  chainNamespace: "eip155",
  name: "Vana",
  nativeCurrency: {
    name: "VANA",
    symbol: "VANA",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.vana.org"],
    },
  },
  blockExplorers: {
    default: {
      url: "https://vanascan.io",
      name: "Vanascan",
    },
    blockscout: {
      url: "https://vanascan.io",
      name: "Vanascan",
    },
  },
  contracts: {},
  abis: {},
});

export interface Chains {
  [key: number]: Chain & { abis?: Record<string, Abi> };
}

export const chains: Chains = {
  [mokshaTestnet.id]: mokshaTestnet,
  [vanaMainnet.id]: vanaMainnet,
};
