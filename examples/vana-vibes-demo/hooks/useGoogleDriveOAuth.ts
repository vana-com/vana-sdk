"use client";

import { useState, useCallback, useEffect } from "react";
import {
  useGoogleLogin,
  googleLogout,
  TokenResponse,
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

/**
 * Google Drive OAuth
 * Uses sessionStorage to store auth tokens
 */
export function useGoogleDriveOAuth(): UseGoogleDriveOAuthReturn {
  const [tokens, setTokensState] = useState<GoogleDriveTokens | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const validateStoredTokens = useCallback((): GoogleDriveTokens | null => {
    try {
      const storedData = sessionStorage.getItem("@vana/google-tokens");
      if (!storedData) {
        return null;
      }

      const tokenData = JSON.parse(storedData);

      if (tokenData.expiresAt && Date.now() >= tokenData.expiresAt) {
        sessionStorage.removeItem("@vana/google-tokens");
        return null;
      }

      return {
        accessToken: tokenData.accessToken,
        expiresAt: tokenData.expiresAt,
        tokenType: tokenData.tokenType,
        timestamp: tokenData.timestamp,
        refreshToken: tokenData.refreshToken,
      };
    } catch {
      sessionStorage.removeItem("@vana/google-tokens");
      return null;
    }
  }, []);

  const setTokens = (newTokens: GoogleDriveTokens | null) => {
    if (newTokens) {
      const tokenData = {
        ...newTokens,
        timestamp: newTokens.timestamp || Date.now(),
      };

      try {
        sessionStorage.setItem(
          "@vana/google-tokens",
          JSON.stringify(tokenData),
        );
        setTokensState(tokenData);
        setIsConnected(true);
      } catch (error) {
        console.error("Failed to store Google tokens:", error);
        setTokensState(null);
        setIsConnected(false);
      }
    } else {
      clearTokens();
    }
  };

  const clearTokens = () => {
    try {
      sessionStorage.removeItem("@vana/google-tokens");
    } catch (error) {
      console.error("Failed to clear Google tokens:", error);
    }

    setTokensState(null);
    setIsConnected(false);
  };

  // Initialize tokens from storage on mount
  useEffect(() => {
    const validTokens = validateStoredTokens();
    if (validTokens) {
      setTokensState(validTokens);
      setIsConnected(true);
    }
  }, [validateStoredTokens]);

  // Generate CSRF token for state parameter
  const generateStateToken = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  };

  // Google OAuth login configuration using IMPLICIT FLOW for SPAs
  const googleLogin = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive",
    flow: "implicit", // Use implicit flow for SPAs (no client secret needed)
    prompt: "select_account",
    onSuccess: (tokenResponse: TokenResponse) => {
      try {
        setIsConnecting(true);
        setError(null);

        if (!tokenResponse.access_token) {
          throw new Error("No access token received");
        }

        const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

        const newTokens = {
          accessToken: tokenResponse.access_token,
          expiresAt,
          tokenType: tokenResponse.token_type || "Bearer",
        };

        setTokens(newTokens);
        setIsConnecting(false);

        // Log success without exposing sensitive data
      } catch {
        // Sanitize error message for user display
        const userMessage = "Authentication failed. Please try again.";
        setError(userMessage);
        setIsConnecting(false);

        // Log detailed error for debugging (in production, send to monitoring service)
        console.error("OAuth error details:", {
          type: "token_processing_error",
          timestamp: new Date().toISOString(),
        });
      }
    },
    onError: () => {
      // Generic error message for users
      setError(
        "Unable to connect to Google Drive. Please check your connection and try again.",
      );
      setIsConnecting(false);

      // Log for monitoring
      console.error("OAuth flow failed");
    },
    // Add state parameter for CSRF protection
    state: generateStateToken(),
  });

  const connect = useCallback(() => {
    setError(null);
    googleLogin();
  }, [googleLogin]);

  const disconnect = useCallback(() => {
    try {
      googleLogout();
      clearTokens();

      setError(null);
      setIsConnecting(false);
    } catch {
      clearTokens();
      setError(null);
      setIsConnecting(false);

      console.error("Error during disconnect (state cleared)");
    }
  }, []);

  return {
    isConnected,
    isConnecting,
    tokens,
    error,
    connect,
    disconnect,
  };
}
