"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useIssueJwt } from "@getpara/react-sdk";
import { useWalletClient, useAccount as useWagmiAccount } from "wagmi";

export interface ParaAuthUser {
  id: string;
  address?: string;
  email?: string;
  phone?: string;
  telegram?: string;
  farcaster?: string;
  isAuthenticated: boolean;
}

export function useParaAuth() {
  const { isConnected } = useAccount();
  const { address } = useWagmiAccount();
  const { issueJwtAsync } = useIssueJwt();
  const { data: walletClient } = useWalletClient();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasAuthenticated, setHasAuthenticated] = useState(false);

  const walletAddress = address;

  console.debug("useParaAuth Debug:", {
    isConnected,
    walletAddress,
    walletClient: !!walletClient,
    hasAuthenticated,
    isAuthenticating,
  });

  const user: ParaAuthUser | null =
    isConnected && walletAddress
      ? {
          id: walletAddress,
          address: walletAddress,
          isAuthenticated: hasAuthenticated,
        }
      : null;

  const authenticate = useCallback(async () => {
    if (!isConnected || !walletAddress) {
      console.debug(
        "Not connected or no wallet address, skipping authentication.",
      );
      return;
    }

    if (hasAuthenticated) {
      console.debug("Already authenticated, skipping.");
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      console.debug("Issuing JWT...");
      const token = await issueJwtAsync({});
      console.debug("JWT issued:", token);

      // Mark as authenticated after successful JWT issuance
      setHasAuthenticated(true);
      console.debug("Authentication successful");
    } catch (error) {
      console.error("Para authentication error:", error);
      setAuthError(
        error instanceof Error ? error.message : "Authentication failed",
      );
      setHasAuthenticated(false);
    } finally {
      setIsAuthenticating(false);
    }
  }, [isConnected, walletAddress, hasAuthenticated, issueJwtAsync]);

  useEffect(() => {
    console.debug("Connection state changed:", { isConnected, walletAddress });
    if (
      isConnected &&
      walletAddress &&
      !hasAuthenticated &&
      !isAuthenticating
    ) {
      authenticate();
    } else if (!isConnected) {
      // Reset authentication state when disconnected
      setHasAuthenticated(false);
      setAuthError(null);
      setIsAuthenticating(false);
    }
  }, [
    isConnected,
    walletAddress,
    hasAuthenticated,
    isAuthenticating,
    authenticate,
  ]);

  const handleDisconnect = async () => {
    try {
      // Reset authentication state first
      setHasAuthenticated(false);
      setAuthError(null);
      setIsAuthenticating(false);

      // Clear localStorage and sessionStorage
      if (typeof window !== "undefined") {
        // Clear wallet-related localStorage keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.includes("walletconnect") ||
              key.includes("para") ||
              key.includes("wallet") ||
              key.includes("connector"))
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));

        // Clear sessionStorage
        sessionStorage.clear();

        // Clear indexedDB if available
        if ("indexedDB" in window) {
          try {
            const databases = await indexedDB.databases();
            await Promise.all(
              databases
                .filter(
                  (db) =>
                    db.name?.includes("walletconnect") ||
                    db.name?.includes("para"),
                )
                .map((db) => {
                  return new Promise((resolve, reject) => {
                    const deleteReq = indexedDB.deleteDatabase(db.name || "");
                    deleteReq.onsuccess = () => resolve(true);
                    deleteReq.onerror = () => reject(deleteReq.error);
                  });
                }),
            );
          } catch (e) {
            console.warn("Failed to clear indexedDB:", e);
          }
        }
      }

      // Force reload to ensure complete reset
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Error during disconnect:", error);
      // Force reload even if disconnect fails
      window.location.reload();
    }
  };

  return {
    user,
    isAuthenticated: isConnected && hasAuthenticated,
    isAuthenticating,
    error: authError,
    walletConnected: isConnected,
    walletLoading: false,
    walletClient: walletClient || null,
    disconnect: handleDisconnect,
  };
}
