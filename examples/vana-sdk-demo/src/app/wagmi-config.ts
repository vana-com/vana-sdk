"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mokshaTestnet, vanaMainnet } from "@opendatalabs/vana-sdk/browser";

// Configure wagmi with SSR support
export const config = getDefaultConfig({
  appName: "Vana SDK Next.js Demo",
  projectId:
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "demo-project-id",
  chains: [mokshaTestnet, vanaMainnet],
  ssr: true,
});
