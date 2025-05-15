import { Abi, Chain, defineChain } from "viem";

export const mokshaTestnet = defineChain({
  id: 14800,
  caipNetworkId: "eip155:14800",
  chainNamespace: "eip155",
  name: "VANA - Moksha",
  nativeCurrency: {
    name: "VANA",
    symbol: "VANA",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.moksha.vana.org"],
    },
  },
  blockExplorers: {
    default: {
      url: "https://moksha.vanascan.io",
      name: "VANA Scan",
    },
    etherscan: {
      url: "https://moksha.vanascan.io",
      name: "VANA Scan",
    },
  },
  contracts: {},
  abis: {},
});

export const vanaMainnet = defineChain({
  id: 1480,
  caipNetworkId: "eip155:1480",
  chainNamespace: "eip155",
  name: "VANA - Mainnet",
  nativeCurrency: {
    name: "VANA",
    symbol: "VANA",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.vana.org"],
    },
  },
  blockExplorers: {
    default: {
      url: "https://vanascan.io",
      name: "VANA Scan",
    },
    etherscan: {
      url: "https://vanascan.io",
      name: "VANA Scan",
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
