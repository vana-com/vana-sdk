"use client";

import { useState, useCallback, useEffect } from "react";
import { useVana } from "@/providers/VanaProvider";
import { useAccount } from "wagmi";
import { addToast } from "@heroui/react";
import type { IdentityResponseModel } from "@opendatalabs/vana-sdk/browser";

interface TrustedServer {
  id: string;
  serverAddress: string;
  serverUrl: string;
  trustedAt: bigint;
  user: string;
  name?: string;
}

export interface UseTrustedServersReturn {
  // State
  trustedServers: TrustedServer[];
  isLoadingTrustedServers: boolean;
  isTrustingServer: boolean;
  isUntrusting: boolean;
  isDiscoveringServer: boolean;
  trustServerError: string;
  trustedServerQueryMode: "subgraph" | "rpc" | "auto";

  // Form state
  serverId: string;
  serverUrl: string;

  // Actions
  loadUserTrustedServers: (mode?: "subgraph" | "rpc" | "auto") => Promise<void>;
  handleTrustServer: () => Promise<void>;
  handleTrustServerGasless: (
    clearFieldsOnSuccess?: boolean,
    overrideServerId?: string,
    overrideServerUrl?: string,
  ) => Promise<void>;
  handleUntrustServer: (serverIdToUntrust: string) => Promise<void>;
  handleDiscoverHostedServer: () => Promise<{
    serverAddress: string;
    serverUrl: string;
    name?: string;
    publicKey?: string;
  } | null>;
  setServerId: (id: string) => void;
  setServerUrl: (url: string) => void;
  setTrustedServerQueryMode: (mode: "subgraph" | "rpc" | "auto") => void;
  setTrustServerError: (error: string) => void;
}

export function useTrustedServers(): UseTrustedServersReturn {
  const { vana } = useVana();
  const { address } = useAccount();

  // Trusted servers state
  const [trustedServers, setTrustedServers] = useState<TrustedServer[]>([]);
  const [isLoadingTrustedServers, setIsLoadingTrustedServers] = useState(false);
  const [isTrustingServer, setIsTrustingServer] = useState(false);
  const [isUntrusting, setIsUntrusting] = useState(false);
  const [isDiscoveringServer, setIsDiscoveringServer] = useState(false);
  const [trustServerError, setTrustServerError] = useState<string>("");
  const [trustedServerQueryMode, setTrustedServerQueryMode] = useState<
    "subgraph" | "rpc" | "auto"
  >("auto");

  // Form state
  const [serverId, setServerId] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");

  const loadUserTrustedServers = useCallback(
    async (mode: "subgraph" | "rpc" | "auto" = "auto") => {
      if (!vana || !address) return;

      setIsLoadingTrustedServers(true);
      try {
        const result = await vana.data.getUserTrustedServers({
          user: address,
          mode,
          subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
          limit: 10, // For demo purposes, limit to 10 servers
        });

        console.info("Loaded trusted servers:", result);

        // Show which mode was actually used
        addToast({
          color: "success",
          title: `Trusted servers loaded via ${result.usedMode.toUpperCase()}`,
          description: `Found ${result.servers.length} trusted servers${result.total ? ` (${result.total} total)` : ""}${result.warnings ? `. Warnings: ${result.warnings.join(", ")}` : ""}`,
        });

        // For backward compatibility, extract just the servers array
        setTrustedServers(result.servers);
      } catch (error) {
        console.error("Failed to load trusted servers:", error);
        addToast({
          title: "Error loading trusted servers",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "solid",
          color: "danger",
        });
      } finally {
        setIsLoadingTrustedServers(false);
      }
    },
    [vana, address],
  );

  const handleTrustServer = useCallback(async () => {
    if (!vana || !address) return;

    // Validate inputs
    if (!serverId.trim()) {
      setTrustServerError("Please provide a server ID (address)");
      return;
    }

    if (!serverUrl.trim()) {
      setTrustServerError("Please provide a server URL");
      return;
    }

    setIsTrustingServer(true);
    setTrustServerError("");

    try {
      await vana.permissions.trustServer({
        serverId: serverId as `0x${string}`,
        serverUrl: serverUrl,
      });

      // Success - form shows success via trustServerError being cleared
      // Refresh trusted servers list
      await loadUserTrustedServers();
    } catch (error) {
      setTrustServerError(
        error instanceof Error ? error.message : "Failed to trust server",
      );
    } finally {
      setIsTrustingServer(false);
    }
  }, [vana, address, serverId, serverUrl, loadUserTrustedServers]);

  const handleTrustServerGasless = useCallback(
    async (
      clearFieldsOnSuccess = true,
      overrideServerId?: string,
      overrideServerUrl?: string,
    ) => {
      if (!vana || !address) return;

      // Use override values if provided, otherwise use form state
      const actualServerId = overrideServerId || serverId;
      const actualServerUrl = overrideServerUrl || serverUrl;

      // Validate inputs
      if (!actualServerId.trim()) {
        setTrustServerError("Please provide a server ID (address)");
        return;
      }

      if (!actualServerUrl.trim()) {
        setTrustServerError("Please provide a server URL");
        return;
      }

      setIsTrustingServer(true);
      setTrustServerError("");

      try {
        await vana.permissions.trustServerWithSignature({
          serverId: actualServerId as `0x${string}`,
          serverUrl: actualServerUrl,
        });

        console.info("✅ Trust server with signature completed successfully!");

        // Success - form shows success via trustServerError being cleared
        // Clear the form fields on success only if requested
        if (clearFieldsOnSuccess) {
          setServerId("");
          setServerUrl("");
        }
        // Refresh trusted servers list
        await loadUserTrustedServers();
        console.info("✅ Trusted servers list refreshed");
      } catch (error) {
        console.error("❌ Trust server with signature failed:", error);
        setTrustServerError(
          error instanceof Error ? error.message : "Failed to trust server",
        );
      } finally {
        setIsTrustingServer(false);
      }
    },
    [vana, address, serverId, serverUrl, loadUserTrustedServers],
  );

  const handleUntrustServer = useCallback(
    async (serverIdToUntrust: string) => {
      if (!vana || !address) return;

      setIsUntrusting(true);
      try {
        await vana.permissions.untrustServerWithSignature({
          serverId: serverIdToUntrust as `0x${string}`,
        });

        addToast({
          title: "Server Untrusted",
          description: `Successfully untrusted server ${serverIdToUntrust}`,
          variant: "solid",
          color: "success",
        });

        // Refresh trusted servers list
        await loadUserTrustedServers();
      } catch (error) {
        console.error("Failed to untrust server:", error);
        addToast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to untrust server",
          variant: "solid",
          color: "danger",
        });
      } finally {
        setIsUntrusting(false);
      }
    },
    [vana, address, loadUserTrustedServers],
  );

  const handleDiscoverHostedServer = useCallback(async () => {
    if (!address) {
      console.error("❌ Server discovery failed: No address provided");
      return null;
    }

    console.info("🔄 Starting server discovery for address:", address);
    setIsDiscoveringServer(true);
    setTrustServerError("");

    try {
      const gatewayUrl = `${process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL}/identity?address=${address}`;
      console.info("🔍 Calling gateway URL:", gatewayUrl);

      // Call the gateway directly to discover the server identity (no authentication required)
      const response = await fetch(gatewayUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: IdentityResponseModel = await response.json();
      console.info("🔍 Gateway response:", data);

      if (!data.personal_server?.address) {
        throw new Error(
          "Invalid server discovery response: missing personal_server.address",
        );
      }

      const baseUrl = process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL;
      if (!baseUrl) {
        throw new Error(
          "NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL is not configured",
        );
      }

      const discoveredServerInfo = {
        serverAddress: data.personal_server.address,
        serverUrl: baseUrl,
        name: "Personal Server",
        publicKey: data.personal_server.public_key,
      };

      console.info("✅ Server discovered:", discoveredServerInfo);

      // Pre-fill the form with discovered server information
      setServerId(discoveredServerInfo.serverAddress);
      setServerUrl(discoveredServerInfo.serverUrl);

      return discoveredServerInfo;
    } catch (error) {
      console.error("❌ Server discovery failed:", error);
      setTrustServerError(
        error instanceof Error ? error.message : "Failed to discover server",
      );
      return null;
    } finally {
      setIsDiscoveringServer(false);
    }
  }, [address]);

  // Load trusted servers when Vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadUserTrustedServers();
    }
  }, [vana, address, loadUserTrustedServers]);

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!address) {
      setTrustedServers([]);
      setServerId("");
      setServerUrl("");
      setTrustServerError("");
    }
  }, [address]);

  return {
    // State
    trustedServers,
    isLoadingTrustedServers,
    isTrustingServer,
    isUntrusting,
    isDiscoveringServer,
    trustServerError,
    trustedServerQueryMode,

    // Form state
    serverId,
    serverUrl,

    // Actions
    loadUserTrustedServers,
    handleTrustServer,
    handleTrustServerGasless,
    handleUntrustServer,
    handleDiscoverHostedServer,
    setServerId,
    setServerUrl,
    setTrustedServerQueryMode,
    setTrustServerError,
  };
}
