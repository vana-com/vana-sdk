"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

export interface GoogleDriveTokens {
  accessToken: string;
  expiresAt?: number;
  tokenType?: string;
  timestamp?: number;
  fingerprint?: string;
  refreshToken?: string; // Add refreshToken for compatibility with Vana SDK
}

interface GoogleTokenContextValue {
  tokens: GoogleDriveTokens | null;
  setTokens: (tokens: GoogleDriveTokens | null) => void;
  isConnected: boolean;
  clearTokens: () => void;
}

const GoogleTokenContext = createContext<GoogleTokenContextValue | null>(null);

interface GoogleTokenProviderProps {
  children: ReactNode;
}

/**
 * Provides centralized Google Drive token management following react-oauth/google best practices
 * Handles token storage, validation, and cross-component sharing
 */
export function GoogleTokenProvider({ children }: GoogleTokenProviderProps) {
  const [tokens, setTokensState] = useState<GoogleDriveTokens | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Generate browser fingerprint for token binding (same as in useGoogleDriveOAuth)
  const generateBrowserFingerprint = (): string => {
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      new Date().getTimezoneOffset(),
      screen.width,
      screen.height,
      screen.colorDepth,
    ].join("|");

    return btoa(fingerprint).substring(0, 16);
  };

  // Validate stored tokens with security checks
  const validateStoredTokens = useCallback((): GoogleDriveTokens | null => {
    try {
      const storedData = sessionStorage.getItem("google-drive-tokens");
      if (!storedData) {
        return null;
      }

      const tokenData = JSON.parse(storedData);

      // Verify browser fingerprint hasn't changed (token binding)
      if (tokenData.fingerprint !== generateBrowserFingerprint()) {
        console.warn("Browser fingerprint mismatch - clearing tokens");
        sessionStorage.removeItem("google-drive-tokens");
        return null;
      }

      // Check token age (max 24 hours)
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (tokenData.timestamp && Date.now() - tokenData.timestamp > maxAge) {
        console.warn("Token too old - clearing tokens");
        sessionStorage.removeItem("google-drive-tokens");
        return null;
      }

      // Check if token is expired
      if (tokenData.expiresAt && Date.now() >= tokenData.expiresAt) {
        sessionStorage.removeItem("google-drive-tokens");
        return null;
      }

      return {
        accessToken: tokenData.accessToken,
        expiresAt: tokenData.expiresAt,
        tokenType: tokenData.tokenType,
        timestamp: tokenData.timestamp,
        fingerprint: tokenData.fingerprint,
      };
    } catch {
      // Invalid token data - clear it
      sessionStorage.removeItem("google-drive-tokens");
      return null;
    }
  }, []);

  // Set tokens with secure storage
  const setTokens = (newTokens: GoogleDriveTokens | null) => {
    if (newTokens) {
      // Add security metadata
      const secureTokenData = {
        ...newTokens,
        timestamp: newTokens.timestamp || Date.now(),
        fingerprint: newTokens.fingerprint || generateBrowserFingerprint(),
      };

      try {
        sessionStorage.setItem(
          "google-drive-tokens",
          JSON.stringify(secureTokenData),
        );
        setTokensState(secureTokenData);
        setIsConnected(true);

        // Dispatch custom event for cross-tab synchronization
        window.dispatchEvent(
          new CustomEvent("google-tokens-updated", {
            detail: secureTokenData,
          }),
        );

        console.info("Google tokens updated successfully");
      } catch (error) {
        console.error("Failed to store Google tokens:", error);
        setTokensState(null);
        setIsConnected(false);
      }
    } else {
      clearTokens();
    }
  };

  // Clear tokens
  const clearTokens = () => {
    try {
      sessionStorage.removeItem("google-drive-tokens");
      sessionStorage.removeItem("last_oauth_attempt");
    } catch (error) {
      console.error("Failed to clear Google tokens:", error);
    }

    setTokensState(null);
    setIsConnected(false);

    // Dispatch custom event for cross-tab synchronization
    window.dispatchEvent(new CustomEvent("google-tokens-cleared"));

    console.info("Google tokens cleared");
  };

  // Initialize tokens from storage on mount
  useEffect(() => {
    const validTokens = validateStoredTokens();
    if (validTokens) {
      setTokensState(validTokens);
      setIsConnected(true);
    }

    // Listen for storage changes (cross-tab synchronization)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.storageArea !== sessionStorage) return;
      if (e.key !== "google-drive-tokens") return;

      const validTokens = validateStoredTokens();
      if (validTokens) {
        setTokensState(validTokens);
        setIsConnected(true);
      } else {
        setTokensState(null);
        setIsConnected(false);
      }
    };

    // Listen for custom token events
    const handleTokenUpdate = (e: CustomEvent) => {
      if (e.detail) {
        setTokensState(e.detail);
        setIsConnected(true);
      }
    };

    const handleTokenClear = () => {
      setTokensState(null);
      setIsConnected(false);
    };

    window.addEventListener("storage", handleStorageChange, true);
    window.addEventListener(
      "google-tokens-updated",
      handleTokenUpdate as EventListener,
    );
    window.addEventListener("google-tokens-cleared", handleTokenClear);

    return () => {
      window.removeEventListener("storage", handleStorageChange, true);
      window.removeEventListener(
        "google-tokens-updated",
        handleTokenUpdate as EventListener,
      );
      window.removeEventListener("google-tokens-cleared", handleTokenClear);
    };
  }, [validateStoredTokens]);

  const contextValue: GoogleTokenContextValue = {
    tokens,
    setTokens,
    isConnected,
    clearTokens,
  };

  return (
    <GoogleTokenContext.Provider value={contextValue}>
      {children}
    </GoogleTokenContext.Provider>
  );
}

/**
 * Hook to consume Google token context
 * Must be used within a GoogleTokenProvider
 */
export function useGoogleTokens(): GoogleTokenContextValue {
  const context = useContext(GoogleTokenContext);
  if (!context) {
    throw new Error(
      "useGoogleTokens must be used within a GoogleTokenProvider. " +
        "Wrap your app with <GoogleTokenProvider> at the root level.",
    );
  }
  return context;
}
