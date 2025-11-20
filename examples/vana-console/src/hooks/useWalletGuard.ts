import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { addToast } from "@heroui/react";

/**
 * Hook to guard write operations that require wallet connection.
 *
 * @returns A guard function that checks wallet connection and prompts user if needed.
 *
 * @example
 * ```tsx
 * const guard = useWalletGuard();
 *
 * const handleUpload = async () => {
 *   if (!guard("upload files")) return;
 *   // Proceed with upload...
 * };
 * ```
 */
export function useWalletGuard() {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  return (actionName: string): boolean => {
    if (isConnected) {
      return true;
    }

    // Show toast notification
    addToast({
      title: "Wallet Required",
      description: `Please connect your wallet to ${actionName}`,
      variant: "solid",
      color: "warning",
    });

    // Open connect modal if available
    if (openConnectModal) {
      openConnectModal();
    }

    return false;
  };
}
