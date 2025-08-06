"use client";

import { useWalletClient, useAccount as useWagmiAccount, useDisconnect } from "wagmi";

export function useWagmiAuth() {
  const { data: walletClient } = useWalletClient();
  const { address: wagmiAddress, isConnected: wagmiConnected } = useWagmiAccount();
  const { disconnect } = useDisconnect();

  const handleDisconnect = async () => {
    try {
      // Clear localStorage and sessionStorage
      if (typeof window !== 'undefined') {
        // Clear wallet-related localStorage keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.includes('wagmi') ||
            key.includes('walletconnect') ||
            key.includes('para') ||
            key.includes('wallet') ||
            key.includes('connector')
          )) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // Clear sessionStorage
        sessionStorage.clear();
        
        // Clear indexedDB if available
        if ('indexedDB' in window) {
          try {
            const databases = await indexedDB.databases();
            await Promise.all(
              databases
                .filter(db => db.name?.includes('walletconnect') || db.name?.includes('wagmi'))
                .map(db => {
                  return new Promise((resolve, reject) => {
                    const deleteReq = indexedDB.deleteDatabase(db.name!);
                    deleteReq.onsuccess = () => resolve(true);
                    deleteReq.onerror = () => reject(deleteReq.error);
                  });
                })
            );
          } catch (e) {
            console.warn('Failed to clear indexedDB:', e);
          }
        }
      }
      
      // Disconnect wagmi
      if (disconnect) {
        disconnect();
      }
      
      // Force reload to ensure complete reset
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      console.error('Error during disconnect:', error);
      // Force reload even if disconnect fails
      window.location.reload();
    }
  };

  return {
    wagmiAddress,
    wagmiConnected,
    walletClient,
    disconnect: handleDisconnect,
  };
}