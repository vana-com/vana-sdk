"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useChainId, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useModal, useAccount as useParaAccount } from "@getpara/react-sdk";
import {
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@heroui/react";
import { Eye } from "lucide-react";
import { SDKConfigurationSidebar } from "@/components/SDKConfigurationSidebar";
import { SidebarNavigation } from "@/components/SidebarNavigation";
import { SDKConfigProvider, useSDKConfig } from "@/providers/SDKConfigProvider";
import { VanaProvider } from "@/providers/VanaProvider";
import { GrantPreviewModalContent } from "@/components/GrantPreviewModalContent";
import type { GrantPermissionParams } from "@opendatalabs/vana-sdk/browser";
import {
  WalletProviderToggle,
  type WalletProvider,
} from "@/components/ui/WalletProviderToggle";

// Types for grant preview modal
interface GrantPreview {
  grantFile: {
    grantee: string;
    operation: string;
    parameters: unknown;
    expires?: number;
  } | null;
  grantUrl: string;
  params: GrantPermissionParams & { expiresAt?: number };
  typedData?: unknown;
  signature?: string | null;
}

// Inner component that consumes SDKConfigContext
function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  // Wallet provider selection with localStorage persistence
  const [walletProvider, setWalletProvider] =
    useState<WalletProvider>("rainbow");
  const [mounted, setMounted] = useState(false);

  // Check if both wallet providers are configured
  const isParaConfigured = !!process.env.NEXT_PUBLIC_PARA_KEY;
  const isRainbowConfigured = true; // Rainbow is always available
  const showProviderToggle = isParaConfigured && isRainbowConfigured;

  // Load wallet provider preference from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const savedProvider = localStorage.getItem(
      "vana-console-wallet-provider",
    ) as WalletProvider | null;

    // If only one provider is configured, use that one
    if (!showProviderToggle) {
      setWalletProvider(isParaConfigured ? "para" : "rainbow");
      return;
    }

    if (savedProvider === "rainbow" || savedProvider === "para") {
      setWalletProvider(savedProvider);
    } else {
      // Default based on env var for backwards compatibility
      const envProvider =
        process.env.NEXT_PUBLIC_WALLET_PROVIDER === "rainbow" ||
        !process.env.NEXT_PUBLIC_WALLET_PROVIDER
          ? "rainbow"
          : "para";
      setWalletProvider(envProvider);
    }
  }, [showProviderToggle, isParaConfigured]);

  // Save to localStorage when provider changes and disconnect if needed
  const handleProviderChange = (provider: WalletProvider) => {
    // If switching providers while connected, disconnect first
    if (walletConnected) {
      disconnect();
    }

    // Update provider preference
    setWalletProvider(provider);
    localStorage.setItem("vana-console-wallet-provider", provider);
  };

  const useRainbow = walletProvider === "rainbow";

  // Wagmi hooks (work with both Rainbow and Para)
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();

  // Para wallet hooks
  const { openModal } = useModal?.() || {};
  const paraAccount = useParaAccount?.() as
    | { isConnected?: boolean }
    | undefined;

  // Consume configuration from SDKConfigProvider
  const { appConfig } = useSDKConfig();

  // Helper to get network name from chain ID
  const getNetworkName = (id: number) => {
    switch (id) {
      case 1480:
        return "Mainnet";
      case 14800:
        return "Moksha";
      default:
        return `Chain ${id}`;
    }
  };

  // Layout-level state for grant preview modal
  const [grantPreview, setGrantPreview] = useState<GrantPreview | null>(null);
  const { isOpen: showGrantPreview, onClose: onCloseGrant } = useDisclosure();

  // Grant modal handlers (these will be used by pages via context if needed)
  const handleConfirmGrant = () => {
    // This will be implemented by the specific page/component that needs it
    onCloseGrant();
    setGrantPreview(null);
  };

  const handleCancelGrant = () => {
    onCloseGrant();
    setGrantPreview(null);
  };

  // Determine connection status (works for both Rainbow and Para)
  const walletConnected = isConnected || paraAccount?.isConnected;

  // Render connect button based on provider
  const renderConnectButton = () => {
    if (useRainbow) {
      return <ConnectButton />;
    } else {
      return (
        <button
          onClick={() => {
            openModal?.();
          }}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          {walletConnected
            ? `Connected • ${getNetworkName(chainId)}`
            : "Connect Para Wallet"}
        </button>
      );
    }
  };

  // Main dashboard layout with VanaProvider (always render, supports read-only mode)
  return (
    <VanaProvider>
      <div className="min-h-screen bg-background">
        <Navbar isBordered>
          <NavbarBrand>
            <h1 className="text-xl font-bold text-foreground">Vana Console</h1>
          </NavbarBrand>
          <NavbarContent justify="center">
            {!walletConnected && (
              <NavbarItem>
                <span className="text-sm text-warning flex items-center gap-2">
                  🔒 Read-Only Mode
                  <span className="text-xs text-muted-foreground">
                    (Browsing: 0x000...000)
                  </span>
                </span>
              </NavbarItem>
            )}
          </NavbarContent>
          <NavbarContent justify="end">
            {mounted && showProviderToggle && (
              <NavbarItem>
                <WalletProviderToggle
                  provider={walletProvider}
                  onProviderChange={handleProviderChange}
                  disabled={false}
                  size="sm"
                />
              </NavbarItem>
            )}
            <NavbarItem>{renderConnectButton()}</NavbarItem>
          </NavbarContent>
        </Navbar>

        <div className="flex">
          {/* Left Sidebar - Navigation */}
          <div className="w-64 min-h-[calc(100vh-4rem)] border-r border-border">
            <SidebarNavigation />
          </div>

          {/* Main Content Area */}
          <div className="flex-1">{children}</div>

          {/* Right Sidebar - SDK Configuration */}
          <div id="configuration">
            <SDKConfigurationSidebar />
          </div>
        </div>

        {/* Grant Preview Modal */}
        <Modal
          isOpen={showGrantPreview && !!grantPreview}
          onClose={onCloseGrant}
          size="2xl"
          scrollBehavior="inside"
        >
          <ModalContent>
            <ModalHeader className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Review Grant
            </ModalHeader>
            <ModalBody>
              <GrantPreviewModalContent
                grantPreview={grantPreview}
                onConfirm={handleConfirmGrant}
                onCancel={handleCancelGrant}
              />
            </ModalBody>
          </ModalContent>
        </Modal>
      </div>
    </VanaProvider>
  );
}

// Main export wraps everything with SDKConfigProvider
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SDKConfigProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </SDKConfigProvider>
  );
}
