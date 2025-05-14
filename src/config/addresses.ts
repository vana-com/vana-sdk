import { VanaContract } from "../abi";

export const CONTRACT_ADDRESSES: Record<number, Record<string, string>> = {
  14800: {
    // Moksha Testnet
    DLPRootEpoch: "0xc3d176cF6BccFCB9225b53B87a95147218e1537F",
    DLPRootCore: "0x0aBa5e28228c323A67712101d61a54d4ff5720FD",
    DLPRoot: "0xff14346dF2B8Fd0c95BF34f1c92e49417b508AD5",
    DLPRootMetrics: "0xbb532917B6407c060Afd9Cb7d53527eCb91d6662",
    DLPRootStakesTreasury: "0x52c3260ED5C235fcA43524CF508e29c897318775",
    DLPRootRewardsTreasury: "0xDBFb6B8b9E2eCAEbdE64d665cD553dB81e524479",
    DataRegistry: "0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C",
    TeePool: "0x3c92fD91639b41f13338CE62f19131e7d19eaa0D",
    TeePoolPhala: "0xE8EC6BD73b23Ad40E6B9a6f4bD343FAc411bD99A",
    Multicall3: "0xD8d2dFca27E8797fd779F8547166A2d3B29d360E",
    Multisend: "0x8807e8BCDFbaA8c2761760f3FBA37F6f7F2C5b2d",
    ComputeEngine: "0xb2BFe33FA420c45F1Cf1287542ad81ae935447bd",
  },
  1480: {
    // Vana Mainnet
    DLPRootEpoch: "0xc3d176cF6BccFCB9225b53B87a95147218e1537F",
    DLPRootCore: "0x0aBa5e28228c323A67712101d61a54d4ff5720FD",
    DLPRoot: "0xff14346dF2B8Fd0c95BF34f1c92e49417b508AD5",
    DLPRootMetrics: "0xbb532917B6407c060Afd9Cb7d53527eCb91d6662",
    DLPRootStakesTreasury: "0x52c3260ED5C235fcA43524CF508e29c897318775",
    DLPRootRewardsTreasury: "0xDBFb6B8b9E2eCAEbdE64d665cD553dB81e524479",
    DataRegistry: "0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C",
    TeePool: "0x3c92fD91639b41f13338CE62f19131e7d19eaa0D",
    TeePoolPhala: "0xE8EC6BD73b23Ad40E6B9a6f4bD343FAc411bD99A",
    Multicall3: "0xD8d2dFca27E8797fd779F8547166A2d3B29d360E",
    Multisend: "0x8807e8BCDFbaA8c2761760f3FBA37F6f7F2C5b2d",
    ComputeEngine: "0xb2BFe33FA420c45F1Cf1287542ad81ae935447bd",
  },
};

export const getContractAddress = (
  chainId: keyof typeof CONTRACT_ADDRESSES,
  contract: VanaContract
) => {
  const contractAddress = CONTRACT_ADDRESSES[chainId][
    contract
  ] as `0x${string}`;
  if (!contractAddress) {
    throw new Error(
      `Contract address not found for ${contract} on chain ${chainId}`
    );
  }
  return contractAddress;
};
