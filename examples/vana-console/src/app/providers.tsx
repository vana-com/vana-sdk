"use client";

import React, { useState, useEffect } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { mokshaTestnet, vanaMainnet } from "@opendatalabs/vana-sdk/browser";
import "@rainbow-me/rainbowkit/styles.css";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ParaProvider } from "../providers/ParaProvider";

// Configure wagmi with SSR support
const config = getDefaultConfig({
  appName: "Vana Console",
  projectId:
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "demo-project-id",
  chains: [mokshaTestnet, vanaMainnet],
  ssr: true,
});

const queryClient = new QueryClient();

// Rainbow provider wrapper
function RainbowProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // Determine which wallet provider to use
  const useRainbow =
    process.env.NEXT_PUBLIC_WALLET_PROVIDER === "rainbow" ||
    !process.env.NEXT_PUBLIC_WALLET_PROVIDER;
  const WalletProvider = useRainbow ? RainbowProvider : ParaProvider;

  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <HeroUIProvider>
        <ToastProvider placement="bottom-right" />
        {useRainbow ? (
          <WalletProvider>{children}</WalletProvider>
        ) : (
          // Para needs external QueryClientProvider
          <QueryClientProvider client={queryClient}>
            <WalletProvider>{children}</WalletProvider>
          </QueryClientProvider>
        )}
      </HeroUIProvider>
    </NextThemesProvider>
  );
}
