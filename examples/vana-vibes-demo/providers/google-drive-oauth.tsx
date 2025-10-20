"use client";

import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from "react";
import {
  useGoogleLogin,
  googleLogout,
  TokenResponse,
  GoogleOAuthProvider,
} from "@react-oauth/google";

export interface GoogleDriveTokens {
  accessToken: string;
  expiresAt?: number;
  tokenType?: string;
  timestamp?: number;
  refreshToken?: string;
}

interface UseGoogleDriveOAuthReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  tokens: GoogleDriveTokens | null;
  connect: () => void;
  disconnect: () => void;
}

const GoogleDriveOAuthContext = createContext<
  UseGoogleDriveOAuthReturn | undefined
>(undefined);

function GoogleDriveOAuthManager({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<GoogleDriveTokens | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("@vana/google-tokens");
      if (stored) {
        const tokenData = JSON.parse(stored);
        if (tokenData.expiresAt && Date.now() < tokenData.expiresAt) {
          setTokens(tokenData);
          setIsConnected(true);
        } else {
          sessionStorage.removeItem("@vana/google-tokens");
        }
      }
    } catch (error) {
      console.error("Failed to load stored tokens:", error);
      sessionStorage.removeItem("@vana/google-tokens");
    }
  }, []);

  // Google OAuth configuration
  const googleLogin = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.file",
    flow: "implicit",
    prompt: "select_account",
    onSuccess: (tokenResponse: TokenResponse) => {
      try {
        setError(null);
        setIsConnecting(true);

        if (!tokenResponse.access_token) {
          throw new Error("No access token received");
        }

        const newTokens: GoogleDriveTokens = {
          accessToken: tokenResponse.access_token,
          expiresAt: Date.now() + tokenResponse.expires_in * 1000,
          tokenType: tokenResponse.token_type || "Bearer",
          timestamp: Date.now(),
        };

        // Store in sessionStorage
        sessionStorage.setItem(
          "@vana/google-tokens",
          JSON.stringify(newTokens),
        );

        // Update state - this should trigger re-renders
        setTokens(newTokens);
        setIsConnected(true);
        setIsConnecting(false);
      } catch (error) {
        console.error("OAuth processing error:", error);
        setError("Authentication failed. Please try again.");
        setIsConnecting(false);
      }
    },
    onError: () => {
      setError("Unable to connect to Google Drive. Please try again.");
      setIsConnecting(false);
    },
  });

  const connect = () => {
    setError(null);
    googleLogin();
  };

  const disconnect = () => {
    try {
      googleLogout();
      sessionStorage.removeItem("@vana/google-tokens");
    } catch (error) {
      console.error("Logout error:", error);
    }

    setTokens(null);
    setIsConnected(false);
    setError(null);
  };

  const value = {
    tokens,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  };

  return (
    <GoogleDriveOAuthContext.Provider value={value}>
      {children}
    </GoogleDriveOAuthContext.Provider>
  );
}

export function GoogleDriveOAuthProvider({
  children,
  clientId,
}: {
  children: ReactNode;
  clientId: string;
}) {
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleDriveOAuthManager>{children}</GoogleDriveOAuthManager>
    </GoogleOAuthProvider>
  );
}

export function useGoogleDriveOAuth(): UseGoogleDriveOAuthReturn {
  const context = useContext(GoogleDriveOAuthContext);
  if (context === undefined) {
    throw new Error(
      "useGoogleDriveOAuth must be used within a GoogleDriveOAuthProvider",
    );
  }
  return context;
}
