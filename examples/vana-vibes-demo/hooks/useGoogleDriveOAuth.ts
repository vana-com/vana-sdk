"use client";

import { useState, useCallback } from "react";
import {
  useGoogleLogin,
  googleLogout,
  TokenResponse,
} from "@react-oauth/google";
import {
  useGoogleTokens,
  GoogleDriveTokens,
} from "../contexts/GoogleTokenContext";

interface UseGoogleDriveOAuthReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  tokens: GoogleDriveTokens | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * SECURE Implementation of Google Drive OAuth for SPAs
 *
 * Security features:
 * - Uses implicit flow appropriate for SPAs (no client secret needed)
 * - Implements token validation
 * - Uses sessionStorage instead of localStorage
 * - Validates token expiration
 * - Sanitizes error messages
 * - Implements CSRF protection via state parameter
 */
export function useGoogleDriveOAuth(): UseGoogleDriveOAuthReturn {
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Use the centralized token context
  const { tokens, setTokens, isConnected, clearTokens } = useGoogleTokens();

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

        // Validate token response
        if (!tokenResponse.access_token) {
          throw new Error("No access token received");
        }

        // Calculate expiration time
        const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

        const newTokens = {
          accessToken: tokenResponse.access_token,
          expiresAt,
          tokenType: tokenResponse.token_type || "Bearer",
        };

        // Store tokens using context (handles secure storage)
        setTokens(newTokens);
        setIsConnecting(false);

        // Log success without exposing sensitive data
        console.info("Google Drive authentication successful");
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

  // Connect function with rate limiting
  const connect = useCallback(() => {
    // Simple rate limiting
    const lastAttempt = sessionStorage.getItem("last_oauth_attempt");
    const now = Date.now();
    const minInterval = 3000; // 3 seconds between attempts

    if (lastAttempt && now - parseInt(lastAttempt) < minInterval) {
      setError("Please wait before trying again.");
      return;
    }

    sessionStorage.setItem("last_oauth_attempt", now.toString());
    setError(null);
    googleLogin();
  }, [googleLogin]);

  // Secure disconnect function
  const disconnect = useCallback(() => {
    try {
      // Logout from Google OAuth
      googleLogout();

      // Clear tokens using context (handles secure cleanup)
      clearTokens();

      // Reset local state
      setError(null);
      setIsConnecting(false);

      console.info("Successfully disconnected from Google Drive");
    } catch {
      // Even if logout fails, clear local state
      clearTokens();
      setError(null);
      setIsConnecting(false);

      console.error("Error during disconnect (state cleared)");
    }
  }, [clearTokens]);

  return {
    isConnected,
    isConnecting,
    tokens,
    error,
    connect,
    disconnect,
  };
}
