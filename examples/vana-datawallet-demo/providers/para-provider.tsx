"use client";

import "@getpara/react-sdk/styles.css";

import React, { ReactNode } from "react";
import { ParaProvider as ParaProviderBase, Environment } from "@getpara/react-sdk";
import { mokshaTestnet, vanaMainnet } from "@opendatalabs/vana-sdk/chains";

const PARA_API_KEY = process.env.NEXT_PUBLIC_PARA_KEY || "f78f3c305f0f27e9d7b8bd28fbb456db";

export const ParaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Use moksha testnet if NEXT_PUBLIC_MOKSHA is set, otherwise use mainnet
  const chain = process.env.NEXT_PUBLIC_MOKSHA ? mokshaTestnet : vanaMainnet;

  return (
    <ParaProviderBase
      paraClientConfig={{
        env: Environment.PRODUCTION,
        apiKey: PARA_API_KEY,
      }}
      externalWalletConfig={{
        includeWalletVerification: true,
        wallets: ["METAMASK", "COINBASE", "WALLETCONNECT", "RAINBOW"],
        evmConnector: {
          config: {
            chains: [chain],
          },
        },
        walletConnect: {
          projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT || "6210bc10b6ce68f0d583d322842cc313",
        },
      }}
      config={{ appName: "Vana DataWallet Demo" }}>
      {children}
    </ParaProviderBase>
  );
};