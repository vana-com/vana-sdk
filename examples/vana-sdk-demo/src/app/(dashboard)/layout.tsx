"use client";

import React, { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
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
import {
  SDKConfigurationSidebar,
  type AppConfig,
} from "@/components/SDKConfigurationSidebar";
import { SidebarNavigation } from "@/components/SidebarNavigation";
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isConnected } = useAccount();

  // Layout-level state for grant preview modal
  const [grantPreview, setGrantPreview] = useState<GrantPreview | null>(null);
  const {
    isOpen: showGrantPreview,
    onOpen: _onOpenGrant,
    onClose: onCloseGrant,
  } = useDisclosure();

  // SDK Configuration state (layout-level since it affects entire app)
  const [sdkConfig, setSdkConfig] = useState(() => ({
    relayerUrl: typeof window !== "undefined" ? window.location.origin : "",
    subgraphUrl: "",
    rpcUrl: "",
    pinataJwt: "",
    pinataGateway: "https://gateway.pinata.cloud",
    defaultStorageProvider: "app-ipfs",
    googleDriveAccessToken: "",
    googleDriveRefreshToken: "",
    googleDriveExpiresAt: null as number | null,
    personalServerUrl: process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL || (() => {
      throw new Error("NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL environment variable is required");
    })(),
  }));

  // App Configuration state
  const [appConfig, setAppConfig] = useState<AppConfig>({
    useGaslessTransactions: true,
  });

  // Google Drive authentication handlers
  const handleGoogleDriveAuth = () => {
    const authWindow = window.open(
      "/api/auth/google-drive/authorize",
      "google-drive-auth",
      "width=600,height=700,scrollbars=yes,resizable=yes",
    );

    // Monitor auth window closure
    const checkClosed = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(checkClosed);
        console.info("Google Drive auth window closed");
      }
    }, 1000);
  };

  const handleGoogleDriveDisconnect = () => {
    setSdkConfig((prev) => ({
      ...prev,
      googleDriveAccessToken: "",
      googleDriveRefreshToken: "",
      googleDriveExpiresAt: null,
      defaultStorageProvider:
        prev.defaultStorageProvider === "google-drive"
          ? "app-ipfs"
          : prev.defaultStorageProvider,
    }));
    console.info("Google Drive disconnected");
  };

  // Grant modal handlers (these will be used by pages via context if needed)
  const handleConfirmGrant = async () => {
    // This will be implemented by the specific page/component that needs it
    onCloseGrant();
    setGrantPreview(null);
  };

  const handleCancelGrant = () => {
    onCloseGrant();
    setGrantPreview(null);
  };

  // If not connected, show wallet connection prompt
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar isBordered>
          <NavbarBrand>
            <h1 className="text-xl font-bold text-foreground">Vana SDK Demo</h1>
          </NavbarBrand>
          <NavbarContent justify="end">
            <NavbarItem>
              <ConnectButton />
            </NavbarItem>
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
    <VanaProvider config={sdkConfig}>
      <div className="min-h-screen bg-background">
        <Navbar isBordered>
          <NavbarBrand>
            <h1 className="text-xl font-bold text-foreground">Vana SDK Demo</h1>
          </NavbarBrand>
          <NavbarContent justify="end">
            <NavbarItem>
              <ConnectButton />
            </NavbarItem>
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
            <SDKConfigurationSidebar
              sdkConfig={sdkConfig}
              onConfigChange={(config) =>
                setSdkConfig((prev) => ({ ...prev, ...config }))
              }
              appConfig={appConfig}
              onAppConfigChange={(config) =>
                setAppConfig((prev) => ({ ...prev, ...config }))
              }
              onGoogleDriveAuth={handleGoogleDriveAuth}
              onGoogleDriveDisconnect={handleGoogleDriveDisconnect}
            />
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
