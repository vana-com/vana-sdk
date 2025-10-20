"use client";

import "@getpara/react-sdk/styles.css";

import React, { type ReactNode } from "react";
import {
  ParaProvider as ParaProviderBase,
  Environment,
} from "@getpara/react-sdk";
import {
  moksha as mokshaTestnet,
  vanaMainnet,
} from "@opendatalabs/vana-sdk/browser";

export const ParaProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const PARA_API_KEY = process.env.NEXT_PUBLIC_PARA_KEY;

  // Only enforce this requirement when Para is actually being used
  if (!PARA_API_KEY) {
    throw new Error(
      "NEXT_PUBLIC_PARA_KEY is required when using Para wallet provider. " +
        "Either set this variable or use NEXT_PUBLIC_WALLET_PROVIDER=rainbow to use Rainbow Kit instead.",
    );
  }

  return (
    <ParaProviderBase
      paraClientConfig={{
        env: Environment.PRODUCTION,
        apiKey: PARA_API_KEY,
      }}
      externalWalletConfig={{
        includeWalletVerification: true,
        createLinkedEmbeddedForExternalWallets: [
          "METAMASK",
          "COINBASE",
          "WALLETCONNECT",
          "RAINBOW",
        ],
        wallets: ["METAMASK", "COINBASE", "WALLETCONNECT", "RAINBOW"],
        evmConnector: {
          config: {
            chains: [mokshaTestnet, vanaMainnet],
          },
        },
        ...(process.env.NEXT_PUBLIC_REOWN_PROJECT && {
          walletConnect: { projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT },
        }),
      }}
      config={{ appName: "Vana Console" }}
    >
      {children}
    </ParaProviderBase>
  );
};
