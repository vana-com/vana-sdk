import { useState, useEffect } from 'react';

interface GoogleDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  folderId?: string;
}

export function useGoogleDriveAuth() {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [tokens, setTokens] = useState<GoogleDriveTokens | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for tokens in localStorage on mount and periodically during connection
  useEffect(() => {
    const checkStoredTokens = async () => {
      try {
        const storedTokens = localStorage.getItem('google-drive-tokens');
        if (storedTokens) {
          const tokenData = JSON.parse(storedTokens);
          
          // Validate tokens with the API
          const response = await fetch('/api/auth/google-drive/status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tokens: tokenData }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.authenticated && data.tokens) {
              // If tokens were refreshed, update localStorage
              if (data.refreshed) {
                localStorage.setItem('google-drive-tokens', JSON.stringify(data.tokens));
              }
              setTokens(data.tokens);
              setIsConnected(true);
              setIsConnecting(false); // Stop connecting state
              setError(null);
              return;
            }
          }
          
          // If validation failed, clear invalid tokens
          localStorage.removeItem('google-drive-tokens');
        }
        setIsConnected(false);
        setTokens(null);
      } catch (err) {
        console.error('Error checking stored tokens:', err);
        setIsConnected(false);
        setTokens(null);
      }
    };

    // Initial check
    checkStoredTokens();

    // Set up storage event listener for cross-tab updates
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'google-drive-tokens') {
        checkStoredTokens();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Poll for new tokens if we're in connecting state
    let pollInterval: NodeJS.Timeout;
    if (isConnecting && !isConnected) {
      pollInterval = setInterval(checkStoredTokens, 1000); // Check every second
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isConnecting, isConnected]);

  // Check for error cases and success tokens in URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    const encodedTokens = urlParams.get('gd_tokens');
    const gdSuccess = urlParams.get('gd_success');
    
    // Handle error cases
    if (errorParam) {
      setError(`Google Drive authentication failed: ${errorParam}`);
      setIsConnecting(false);
    }
    
    // Handle successful authentication with tokens
    if (encodedTokens && gdSuccess) {
      try {
        // Decode tokens from URL (convert base64url to base64, then decode)
        const base64 = encodedTokens.replace(/-/g, '+').replace(/_/g, '/');
        const tokenData = JSON.parse(atob(base64));
        
        // Store tokens in localStorage
        localStorage.setItem('google-drive-tokens', JSON.stringify(tokenData));
        
        // The existing token validation logic will pick this up automatically
        // via the checkStoredTokens function
      } catch (error) {
        console.error('Error processing Google Drive tokens:', error);
        setError('Error processing Google Drive tokens. Please try again.');
        setIsConnecting(false);
      }
    }
    
    // Clean up URL if we have any Google Drive parameters
    if (errorParam || encodedTokens || gdSuccess) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('error');
      cleanUrl.searchParams.delete('gd_tokens');
      cleanUrl.searchParams.delete('gd_success');
      window.history.replaceState({}, '', cleanUrl.toString());
    }
  }, []);

  const connect = async (userAddress: string) => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/google-drive/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userAddress }),
      });

      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const data = await response.json();
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google Drive authentication');
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    localStorage.removeItem('google-drive-tokens');
    setIsConnected(false);
    setTokens(null);
    setError(null);
  };

  return {
    isConnected,
    isConnecting,
    tokens,
    error,
    connect,
    disconnect,
  };
}