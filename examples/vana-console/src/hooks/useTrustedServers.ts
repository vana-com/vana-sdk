"use client";

import { useState, useCallback, useEffect } from "react";
import { useVana } from "@/providers/VanaProvider";
import { useSDKConfig } from "@/providers/SDKConfigProvider";
import { addToast } from "@heroui/react";

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
  isCheckingServerRegistration: boolean;

  // Form state
  serverId: string;
  serverAddress: string;
  serverUrl: string;
  serverOwner: string;
  publicKey: string;

  // Actions
  loadUserTrustedServers: () => Promise<void>;
  handleTrustServer: () => Promise<void>;
  handleTrustServerGasless: (
    clearFieldsOnSuccess?: boolean,
    overrideServerAddress?: string,
    overrideServerUrl?: string,
    overrideServerOwner?: string,
    overridePublicKey?: string,
  ) => Promise<void>;
  handleUntrustServer: (serverIdToUntrust: string) => Promise<void>;
  handleDiscoverHostedServer: () => Promise<{
    serverAddress: string;
    serverUrl: string;
    name?: string;
    publicKey?: string;
  } | null>;
  checkServerIsRegistered: (address: string) => Promise<boolean>;
  setServerId: (id: string) => void;
  setServerAddress: (address: string) => void;
  setServerUrl: (url: string) => void;
  setServerOwner: (owner: string) => void;
  setPublicKey: (publicKey: string) => void;
  setTrustServerError: (error: string) => void;
}

export function useTrustedServers(): UseTrustedServersReturn {
  const { vana } = useVana();
  const { effectiveAddress: address } = useSDKConfig();

  // Trusted servers state
  const [trustedServers, setTrustedServers] = useState<TrustedServer[]>([]);
  const [isLoadingTrustedServers, setIsLoadingTrustedServers] = useState(false);
  const [isTrustingServer, setIsTrustingServer] = useState(false);
  const [isUntrusting, setIsUntrusting] = useState(false);
  const [isDiscoveringServer, setIsDiscoveringServer] = useState(false);
  const [isCheckingServerRegistration, setIsCheckingServerRegistration] =
    useState(false);
  const [trustServerError, setTrustServerError] = useState<string>("");
  // Query mode is now automatic - SDK handles fallback internally

  // Form state
  const [serverId, setServerId] = useState<string>("");
  const [serverAddress, setServerAddress] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [serverOwner, setServerOwner] = useState<string>("");
  const [publicKey, setPublicKey] = useState<string>("");

  const loadUserTrustedServers = useCallback(async () => {
    if (!vana || !address) return;

    setIsLoadingTrustedServers(true);
    try {
      const servers = await vana.data.getUserTrustedServers(
        {
          user: address as `0x${string}`,
          ...(process.env.NEXT_PUBLIC_SUBGRAPH_URL && {
            subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
          }),
        },
        {
          limit: 10, // For demo purposes, limit to 10 servers
        },
      );

      console.info("Loaded trusted servers:", servers);

      // Show success message
      addToast({
        color: "success",
        title: `Trusted servers loaded`,
        description: `Found ${servers.length} trusted servers`,
      });

      // Set the servers array
      // Note: Public keys will be fetched on-demand when needed for uploads
      // until the contract upgrade that stores them onchain is deployed
      setTrustedServers(servers);
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
  }, [vana, address]);

  const handleTrustServer = useCallback(async () => {
    if (!vana || !address) return;

    // Validate inputs
    if (!serverAddress.trim()) {
      setTrustServerError("Please provide a server address");
      return;
    }

    if (!serverUrl.trim()) {
      setTrustServerError("Please provide a server URL");
      return;
    }

    if (!serverOwner.trim()) {
      setTrustServerError("Please provide a server owner address");
      return;
    }

    if (!publicKey.trim()) {
      setTrustServerError("Please provide a server public key");
      return;
    }

    setIsTrustingServer(true);
    setTrustServerError("");

    try {
      await vana.permissions.addAndTrustServer({
        serverAddress: serverAddress as `0x${string}`,
        serverUrl,
        publicKey,
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
  }, [
    vana,
    address,
    serverAddress,
    serverUrl,
    serverOwner,
    publicKey,
    loadUserTrustedServers,
  ]);

  const handleTrustServerGasless = useCallback(
    async (
      clearFieldsOnSuccess = true,
      overrideServerAddress?: string,
      overrideServerUrl?: string,
      overridePublicKey?: string,
    ) => {
      if (!vana || !address) return;

      // Use override values if provided, otherwise use form state
      const actualServerAddress = overrideServerAddress ?? serverAddress;
      const actualServerUrl = overrideServerUrl ?? serverUrl;
      const actualPublicKey = overridePublicKey ?? publicKey;

      // Validate inputs
      if (
        !actualServerAddress ||
        typeof actualServerAddress !== "string" ||
        !actualServerAddress.trim()
      ) {
        setTrustServerError("Please provide a server address");
        return;
      }

      if (
        !actualServerUrl ||
        typeof actualServerUrl !== "string" ||
        !actualServerUrl.trim()
      ) {
        setTrustServerError("Please provide a server URL");
        return;
      }

      if (!actualPublicKey.trim()) {
        setTrustServerError("Please provide a server public key");
        return;
      }

      setIsTrustingServer(true);
      setTrustServerError("");

      try {
        // Check if server is already registered globally in the contract
        // (not just in the user's trusted list, but registered by ANY user)
        let serverIsRegistered = false;
        let serverId: number | undefined;
        try {
          const serverInfo = await vana.permissions.getServerInfoByAddress(
            actualServerAddress as `0x${string}`,
          );
          // If server ID is > 0, the server is registered in the contract
          serverIsRegistered = serverInfo.id > 0n;
          serverId = Number(serverInfo.id);
          console.info(
            `🔍 Server registration check: id=${serverInfo.id}, registered=${serverIsRegistered}`,
          );
        } catch (error) {
          // If fetching server info fails, assume server is not registered
          console.warn(
            "⚠️ Could not fetch server info, assuming not registered:",
            error,
          );
          serverIsRegistered = false;
        }

        if (serverIsRegistered && serverId) {
          // Server already registered globally, just trust it
          console.info(
            `Server already registered globally (ID: ${serverId}), using trustServerWithSignature...`,
          );
          await vana.permissions.submitTrustServerWithSignature({
            serverId,
          });
        } else {
          // Server not registered, add and trust it
          console.info(
            "Server not registered, using addAndTrustServerWithSignature...",
          );
          await vana.permissions.submitAddAndTrustServerWithSignature({
            serverAddress: actualServerAddress as `0x${string}`,
            serverUrl: actualServerUrl,
            publicKey: actualPublicKey,
          });
        }

        console.info("✅ Trust server with signature completed successfully!");

        // Success - form shows success via trustServerError being cleared
        // Clear the form fields on success only if requested
        if (clearFieldsOnSuccess) {
          setServerId("");
          setServerAddress("");
          setServerUrl("");
          setServerOwner("");
          setPublicKey("");
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
    [
      vana,
      address,
      serverAddress,
      serverUrl,
      serverOwner,
      publicKey,
      loadUserTrustedServers,
    ],
  );

  const handleUntrustServer = useCallback(
    async (serverIdToUntrust: string) => {
      if (!vana || !address) return;

      setIsUntrusting(true);
      try {
        await vana.permissions.submitUntrustServerWithSignature({
          serverId: parseInt(serverIdToUntrust, 10),
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
    if (!vana || !address) {
      console.error("❌ Server discovery failed: No Vana instance or address");
      return null;
    }

    console.info("🔄 Starting server discovery for address:", address);
    setIsDiscoveringServer(true);
    setTrustServerError("");

    try {
      // Use the SDK's getIdentity method instead of direct fetch
      const identity = await vana.server.getIdentity({
        userAddress: address,
      });

      console.info("🔍 Server identity response:", identity);

      if (!identity.baseUrl) {
        throw new Error(
          "Personal server URL is not configured. Please configure personalServerUrl in SDK settings.",
        );
      }

      const discoveredServerInfo = {
        serverAddress: identity.address,
        serverUrl: identity.baseUrl,
        name: identity.name ?? "Personal Server",
        publicKey: identity.publicKey,
      };

      console.info("✅ Server discovered:", discoveredServerInfo);

      // Pre-fill the form with discovered server information
      setServerAddress(discoveredServerInfo.serverAddress);
      setServerUrl(discoveredServerInfo.serverUrl);
      setPublicKey(discoveredServerInfo.publicKey);
      setServerOwner(address); // Personal server is owned by the user

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
  }, [vana, address]);

  // Helper to check if a server is registered globally
  const checkServerIsRegistered = useCallback(
    async (addressToCheck: string): Promise<boolean> => {
      if (!vana || !addressToCheck) return false;

      setIsCheckingServerRegistration(true);
      try {
        const serverInfo = await vana.permissions.getServerInfoByAddress(
          addressToCheck as `0x${string}`,
        );
        // If server ID is > 0, the server is registered in the contract
        return serverInfo.id > 0n;
      } catch (error) {
        console.warn("Could not fetch server info:", error);
        return false;
      } finally {
        setIsCheckingServerRegistration(false);
      }
    },
    [vana],
  );

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!address) {
      setTrustedServers([]);
      setServerId("");
      setServerAddress("");
      setServerUrl("");
      setServerOwner("");
      setPublicKey("");
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
    isCheckingServerRegistration,
    trustServerError,

    // Form state
    serverId,
    serverAddress,
    serverUrl,
    serverOwner,
    publicKey,

    // Actions
    loadUserTrustedServers,
    handleTrustServer,
    handleTrustServerGasless,
    handleUntrustServer,
    handleDiscoverHostedServer,
    checkServerIsRegistered,
    setServerId,
    setServerAddress,
    setServerUrl,
    setServerOwner,
    setPublicKey,
    setTrustServerError,
  };
}
