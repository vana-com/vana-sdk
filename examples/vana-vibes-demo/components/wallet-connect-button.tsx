"use client";

import React from "react";
import {
  useModal,
  useAccount as useParaAccount,
  useWallet,
} from "@getpara/react-sdk";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";

interface WalletConnectButtonProps {
  disabled?: boolean;
  className?: string;
}

export function WalletConnectButton({
  disabled,
  className = "w-full",
}: WalletConnectButtonProps) {
  const useRainbow = process.env.NEXT_PUBLIC_WALLET_PROVIDER === "rainbow";

  // Para wallet hooks
  const { openModal } = useModal?.() || {};
  const paraAccount = useParaAccount?.();

  // Wagmi hooks (work with both)
  const { address, isConnected } = useAccount();
  const { data: wallet } = useWallet?.() || {};

  if (useRainbow) {
    return (
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          mounted,
        }) => {
          const ready = mounted;
          const connected = ready && account && chain;

          return (
            <div
              {...(!ready && {
                "aria-hidden": true,
                style: {
                  opacity: 0,
                  pointerEvents: "none",
                  userSelect: "none",
                },
              })}
            >
              {(() => {
                if (!connected) {
                  return (
                    <Button
                      onClick={openConnectModal}
                      disabled={disabled}
                      className={className}
                    >
                      Connect Wallet
                    </Button>
                  );
                }

                if (chain.unsupported) {
                  return (
                    <Button
                      onClick={openChainModal}
                      variant="destructive"
                      className={className}
                    >
                      Wrong network
                    </Button>
                  );
                }

                return (
                  <Button
                    onClick={openAccountModal}
                    disabled={disabled}
                    className={className}
                  >
                    {account.displayName}
                    {account.displayBalance
                      ? ` (${account.displayBalance})`
                      : ""}
                  </Button>
                );
              })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
    );
  }

  // Para wallet button
  // Type assertion for Para SDK compatibility
  const paraAccountWithAddress = paraAccount as
    | { address?: string; isConnected?: boolean }
    | undefined;
  const walletAddress =
    wallet?.address ?? address ?? paraAccountWithAddress?.address;
  const walletConnected = isConnected ?? paraAccountWithAddress?.isConnected;

  return (
    <Button
      onClick={() => {
        openModal?.();
      }}
      disabled={disabled}
      className={className}
    >
      {walletConnected && walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : "Connect Para Wallet"}
    </Button>
  );
}
