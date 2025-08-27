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

// Configure wagmi with SSR support
const config = getDefaultConfig({
  appName: "Vana SDK Next.js Demo",
  projectId:
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "demo-project-id",
  chains: [mokshaTestnet, vanaMainnet],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <NextThemesProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <HeroUIProvider>
            <ToastProvider placement="bottom-right" />
            <RainbowKitProvider theme={darkTheme()}>
              {children}
            </RainbowKitProvider>
          </HeroUIProvider>
        </NextThemesProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
