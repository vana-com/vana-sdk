"use client";

import React, { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useModal, useAccount as useParaAccount } from "@getpara/react-sdk";
import {
  Card,
  CardHeader,
  CardBody,
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
  const useRainbow =
    process.env.NEXT_PUBLIC_WALLET_PROVIDER === "rainbow" ||
    !process.env.NEXT_PUBLIC_WALLET_PROVIDER;

  // Wagmi hooks (work with both Rainbow and Para)
  const { isConnected } = useAccount();
  const chainId = useChainId();

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

  // If not connected, show wallet connection prompt
  if (!walletConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar isBordered>
          <NavbarBrand>
            <h1 className="text-xl font-bold text-foreground">
              Vana SDK Demo{walletConnected ? "" : " (🔒 Read-Only)"}
            </h1>
          </NavbarBrand>
          <NavbarContent justify="end">
            <NavbarItem>{renderConnectButton()}</NavbarItem>
          </NavbarContent>
        </Navbar>

        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Card className="max-w-md">
            <CardHeader className="flex-col items-start">
              <div>Get Started</div>
            </CardHeader>
            <CardBody>
              <p className="text-muted-foreground">
                Connect your wallet above to begin exploring the Vana SDK
                capabilities.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  // Main dashboard layout with VanaProvider
  return (
    <VanaProvider>
      <div className="min-h-screen bg-background">
        <Navbar isBordered>
          <NavbarBrand>
            <h1 className="text-xl font-bold text-foreground">
              Vana SDK Demo
              {appConfig.enableReadOnlyMode
                ? " (📖 Read-Only)"
                : walletConnected
                  ? ""
                  : " (🔒 Disconnected)"}
            </h1>
          </NavbarBrand>
          <NavbarContent justify="end">
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
