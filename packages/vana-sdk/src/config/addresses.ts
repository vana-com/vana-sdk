// Single source of truth for all contract addresses
// Contract-centric structure: contracts contain chain addresses

export const CONTRACTS = {
  // Core Platform Contracts
  DataPermissions: {
    addresses: {
      14800: "0x31fb1D48f6B2265A4cAD516BC39E96a18fb7c8de",
      1480: "0x31fb1D48f6B2265A4cAD516BC39E96a18fb7c8de",
    },
  },
  DataRegistry: {
    addresses: {
      14800: "0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C",
      1480: "0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C",
    },
  },
  TeePoolPhala: {
    addresses: {
      14800: "0xE8EC6BD73b23Ad40E6B9a6f4bD343FAc411bD99A",
      1480: "0xE8EC6BD73b23Ad40E6B9a6f4bD343FAc411bD99A",
    },
  },
  ComputeEngine: {
    addresses: {
      14800: "0xb2BFe33FA420c45F1Cf1287542ad81ae935447bd",
      1480: "0xb2BFe33FA420c45F1Cf1287542ad81ae935447bd",
    },
  },

  // Data Access Infrastructure
  DataRefinerRegistry: {
    addresses: {
      14800: "0x93c3EF89369fDcf08Be159D9DeF0F18AB6Be008c",
      1480: "0x93c3EF89369fDcf08Be159D9DeF0F18AB6Be008c",
    },
  },
  QueryEngine: {
    addresses: {
      14800: "0xd25Eb66EA2452cf3238A2eC6C1FD1B7F5B320490",
      1480: "0xd25Eb66EA2452cf3238A2eC6C1FD1B7F5B320490",
    },
  },
  VanaTreasury: {
    addresses: {
      14800: "0x94a1E56e555ac48d092f490fB10CDFaB434915eD",
      1480: "0x94a1E56e555ac48d092f490fB10CDFaB434915eD",
    },
  },
  ComputeInstructionRegistry: {
    addresses: {
      14800: "0x5786B12b4c6Ba2bFAF0e77Ed30Bf6d32805563A5",
      1480: "0x5786B12b4c6Ba2bFAF0e77Ed30Bf6d32805563A5",
    },
  },

  // TEE Pool Variants
  TeePoolEphemeralStandard: {
    addresses: {
      14800: "0xe124bae846D5ec157f75Bd9e68ca87C4d2AB835A",
      1480: "0xe124bae846D5ec157f75Bd9e68ca87C4d2AB835A",
    },
  },
  TeePoolPersistentStandard: {
    addresses: {
      14800: "0xe8bB8d0629651Cf33e0845d743976Dc1f0971d76",
      1480: "0xe8bB8d0629651Cf33e0845d743976Dc1f0971d76",
    },
  },
  TeePoolPersistentGpu: {
    addresses: {
      14800: "0x1c346Cd74f8551f8fa13f3F4b6b8dAE22338E6a9",
      1480: "0x1c346Cd74f8551f8fa13f3F4b6b8dAE22338E6a9",
    },
  },
  TeePoolDedicatedStandard: {
    addresses: {
      14800: "0xf024b7ac5E8417416f53B41ecfa58C8e9396687d",
      1480: "0xf024b7ac5E8417416f53B41ecfa58C8e9396687d",
    },
  },
  TeePoolDedicatedGpu: {
    addresses: {
      14800: "0xB1686FA9620bBf851714d1cB47b8a4Bf4664644E",
      1480: "0xB1686FA9620bBf851714d1cB47b8a4Bf4664644E",
    },
  },

  // DLP Reward System
  VanaEpoch: {
    addresses: {
      14800: "0x2063cFF0609D59bCCc196E20Eb58A8696a6b15A0",
      1480: "0x2063cFF0609D59bCCc196E20Eb58A8696a6b15A0",
    },
  },
  DLPRegistry: {
    addresses: {
      14800: "0x4D59880a924526d1dD33260552Ff4328b1E18a43",
      1480: "0x4D59880a924526d1dD33260552Ff4328b1E18a43",
    },
  },
  DLPRegistryTreasury: {
    addresses: {
      14800: "0xb12ce1d27bEeFe39b6F0110b1AB77C21Aa0c9F9a",
      1480: "0xb12ce1d27bEeFe39b6F0110b1AB77C21Aa0c9F9a",
    },
  },
  DLPPerformance: {
    addresses: {
      14800: "0x847715C7DB37cF286611182Be0bD333cbfa29cc1",
      1480: "0x847715C7DB37cF286611182Be0bD333cbfa29cc1",
    },
  },
  DLPRewardDeployer: {
    addresses: {
      14800: "0xEFD0F9Ba9De70586b7c4189971cF754adC923B04",
      1480: "0xEFD0F9Ba9De70586b7c4189971cF754adC923B04",
    },
  },
  DLPRewardDeployerTreasury: {
    addresses: {
      14800: "0xb547ca8Fe4990fe330FeAeb1C2EBb42F925Af5b8",
      1480: "0xb547ca8Fe4990fe330FeAeb1C2EBb42F925Af5b8",
    },
  },
  DLPRewardSwap: {
    addresses: {
      14800: "0x7c6862C46830F0fc3bF3FF509EA1bD0EE7267fB0",
      1480: "0x7c6862C46830F0fc3bF3FF509EA1bD0EE7267fB0",
    },
  },
  SwapHelper: {
    addresses: {
      14800: "0x55D5e6F73326315bF2E091e97F04f0770e5C54e2",
      1480: "0x55D5e6F73326315bF2E091e97F04f0770e5C54e2",
    },
  },

  // VanaPool (Staking)
  VanaPoolStaking: {
    addresses: {
      14800: "0x641C18E2F286c86f96CE95C8ec1EB9fC0415Ca0e",
      1480: "0x641C18E2F286c86f96CE95C8ec1EB9fC0415Ca0e",
    },
  },
  VanaPoolEntity: {
    addresses: {
      14800: "0x44f20490A82e1f1F1cC25Dd3BA8647034eDdce30",
      1480: "0x44f20490A82e1f1F1cC25Dd3BA8647034eDdce30",
    },
  },
  VanaPoolTreasury: {
    addresses: {
      14800: "0x143BE72CF2541604A7691933CAccd6D9cC17c003",
      1480: "0x143BE72CF2541604A7691933CAccd6D9cC17c003",
    },
  },

  // DLP Deployment Contracts
  DAT: {
    addresses: {
      14800: "0xA706b93ccED89f13340673889e29F0a5cd84212d",
      1480: "0xA706b93ccED89f13340673889e29F0a5cd84212d",
    },
  },
  DATFactory: {
    addresses: {
      14800: "0x40f8bccF35a75ecef63BC3B1B3E06ffEB9220644",
      1480: "0x40f8bccF35a75ecef63BC3B1B3E06ffEB9220644",
    },
  },
  DATPausable: {
    addresses: {
      14800: "0xe69FE86f0B95cC2f8416Fe22815c85DC8887e76e",
      1480: "0xe69FE86f0B95cC2f8416Fe22815c85DC8887e76e",
    },
  },
  DATVotes: {
    addresses: {
      14800: "0xaE04c8A77E9B27869eb563720524A9aE0baf1831",
      1480: "0xaE04c8A77E9B27869eb563720524A9aE0baf1831",
    },
  },

  // Utility Contracts (no ABIs in SDK)
  Multicall3: {
    addresses: {
      14800: "0xD8d2dFca27E8797fd779F8547166A2d3B29d360E",
      1480: "0xD8d2dFca27E8797fd779F8547166A2d3B29d360E",
    },
  },
  Multisend: {
    addresses: {
      14800: "0x8807e8BCDFbaA8c2761760f3FBA37F6f7F2C5b2d",
      1480: "0x8807e8BCDFbaA8c2761760f3FBA37F6f7F2C5b2d",
    },
  },
} as const;

// Legacy/Deprecated Contracts (backwards compatibility)
export const LEGACY_CONTRACTS = {
  // DEPRECATED: Original Intel SGX TeePool (PRO-347)
  TeePool: {
    addresses: {
      14800: "0x3c92fD91639b41f13338CE62f19131e7d19eaa0D",
      1480: "0x3c92fD91639b41f13338CE62f19131e7d19eaa0D",
    },
  },

  // DEPRECATED: DLPRoot system (replaced by VanaPool + DLPRewards)
  DLPRootEpoch: {
    addresses: {
      14800: "0xc3d176cF6BccFCB9225b53B87a95147218e1537F",
      1480: "0xc3d176cF6BccFCB9225b53B87a95147218e1537F",
    },
  },
  DLPRootCore: {
    addresses: {
      14800: "0x0aBa5e28228c323A67712101d61a54d4ff5720FD",
      1480: "0x0aBa5e28228c323A67712101d61a54d4ff5720FD",
    },
  },
  DLPRoot: {
    addresses: {
      14800: "0xff14346dF2B8Fd0c95BF34f1c92e49417b508AD5",
      1480: "0xff14346dF2B8Fd0c95BF34f1c92e49417b508AD5",
    },
  },
  DLPRootMetrics: {
    addresses: {
      14800: "0xbb532917B6407c060Afd9Cb7d53527eCb91d6662",
      1480: "0xbb532917B6407c060Afd9Cb7d53527eCb91d6662",
    },
  },
  DLPRootStakesTreasury: {
    addresses: {
      14800: "0x52c3260ED5C235fcA43524CF508e29c897318775",
      1480: "0x52c3260ED5C235fcA43524CF508e29c897318775",
    },
  },
  DLPRootRewardsTreasury: {
    addresses: {
      14800: "0xDBFb6B8b9E2eCAEbdE64d665cD553dB81e524479",
      1480: "0xDBFb6B8b9E2eCAEbdE64d665cD553dB81e524479",
    },
  },
} as const;

// Transform for backwards compatibility with existing SDK usage
export const CONTRACT_ADDRESSES: Record<number, Record<string, string>> = {
  14800: Object.fromEntries(
    Object.entries(CONTRACTS)
      .map(([name, info]) => [name, info.addresses[14800]])
      .filter(([, addr]) => addr),
  ),
  1480: Object.fromEntries(
    Object.entries(CONTRACTS)
      .map(([name, info]) => [name, info.addresses[1480]])
      .filter(([, addr]) => addr),
  ),
};

// Legacy exports for backwards compatibility
export const UTILITY_ADDRESSES = {
  14800: {
    Multicall3: CONTRACTS.Multicall3.addresses[14800],
    Multisend: CONTRACTS.Multisend.addresses[14800],
  },
  1480: {
    Multicall3: CONTRACTS.Multicall3.addresses[1480],
    Multisend: CONTRACTS.Multisend.addresses[1480],
  },
} as const;

export const LEGACY_ADDRESSES = {
  14800: Object.fromEntries(
    Object.entries(LEGACY_CONTRACTS)
      .map(([name, info]) => [name, info.addresses[14800]])
      .filter(([, addr]) => addr),
  ),
  1480: Object.fromEntries(
    Object.entries(LEGACY_CONTRACTS)
      .map(([name, info]) => [name, info.addresses[1480]])
      .filter(([, addr]) => addr),
  ),
} as const;

import type { VanaContract } from "../abi";

export const getContractAddress = (
  chainId: keyof typeof CONTRACT_ADDRESSES,
  contract: VanaContract,
) => {
  const contractAddress = CONTRACT_ADDRESSES[chainId]?.[contract] as
    | `0x${string}`
    | undefined;
  if (!contractAddress) {
    throw new Error(
      `Contract address not found for ${contract} on chain ${chainId}`,
    );
  }
  return contractAddress;
};

export const getUtilityAddress = (
  chainId: keyof typeof UTILITY_ADDRESSES,
  contract: keyof (typeof UTILITY_ADDRESSES)[keyof typeof UTILITY_ADDRESSES],
) => {
  return UTILITY_ADDRESSES[chainId][contract] as `0x${string}`;
};
