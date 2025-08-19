"use client";

import React, { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import {
  moksha as mokshaTestnet,
  vanaMainnet,
} from "@opendatalabs/vana-sdk/browser";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export const RainbowProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const chain = process.env.NEXT_PUBLIC_MOKSHA ? mokshaTestnet : vanaMainnet;

  // Configure wagmi with RainbowKit
  const config = getDefaultConfig({
    appName: "Vana Vibes Demo",
    projectId:
      process.env.NEXT_PUBLIC_REOWN_PROJECT ||
      "6210bc10b6ce68f0d583d322842cc313",
    chains: [chain],
    ssr: true,
  });

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};