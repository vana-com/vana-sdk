"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ParaProvider } from "./para-provider";
import { RainbowProvider } from "./rainbow-provider";
import { VanaProvider } from "./vana-provider";
import { GoogleDriveOAuthProvider } from "./google-drive-oauth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Use environment variable to determine wallet provider
  const useRainbow = process.env.NEXT_PUBLIC_WALLET_PROVIDER === "rainbow";
  const WalletProvider = useRainbow ? RainbowProvider : ParaProvider;

  return (
    <GoogleDriveOAuthProvider
      clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
    >
      {useRainbow ? (
        // RainbowProvider includes its own QueryClientProvider
        <WalletProvider>
          <VanaProvider>{children}</VanaProvider>
        </WalletProvider>
      ) : (
        // Para needs external QueryClientProvider
        <QueryClientProvider client={queryClient}>
          <WalletProvider>
            <VanaProvider>{children}</VanaProvider>
          </WalletProvider>
        </QueryClientProvider>
      )}
    </GoogleDriveOAuthProvider>
  );
}
