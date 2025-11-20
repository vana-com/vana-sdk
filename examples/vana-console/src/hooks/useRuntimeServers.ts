"use client";

import { useState, useCallback, useEffect } from "react";
import { useVana } from "@/providers/VanaProvider";
import { useSDKConfig } from "@/providers/SDKConfigProvider";
import { addToast } from "@heroui/react";

interface RuntimeServer {
  runtimeAddress: string;
  publicKey: string;
  escrowedPrivateKey: string;
  url: string;
  owner: string;
  registeredAt?: bigint;
}

export interface UseRuntimeServersReturn {
  // State
  runtimeServers: RuntimeServer[];
  isLoadingRuntimeServers: boolean;
  isRegisteringRuntime: boolean;
  registerRuntimeError: string;

  // Form state
  runtimeAddress: string;
  publicKey: string;
  escrowedPrivateKey: string;
  runtimeUrl: string;

  // Actions
  loadRuntimeServers: () => Promise<void>;
  handleRegisterRuntime: () => Promise<void>;
  setRuntimeAddress: (address: string) => void;
  setPublicKey: (key: string) => void;
  setEscrowedPrivateKey: (key: string) => void;
  setRuntimeUrl: (url: string) => void;
  setRegisterRuntimeError: (error: string) => void;
}

export function useRuntimeServers(): UseRuntimeServersReturn {
  const { vana } = useVana();
  const { effectiveAddress: address } = useSDKConfig();

  // Runtime servers state
  const [runtimeServers, setRuntimeServers] = useState<RuntimeServer[]>([]);
  const [isLoadingRuntimeServers, setIsLoadingRuntimeServers] = useState(false);
  const [isRegisteringRuntime, setIsRegisteringRuntime] = useState(false);
  const [registerRuntimeError, setRegisterRuntimeError] = useState<string>("");

  // Form state
  const [runtimeAddress, setRuntimeAddress] = useState<string>("");
  const [publicKey, setPublicKey] = useState<string>("");
  const [escrowedPrivateKey, setEscrowedPrivateKey] = useState<string>("");
  const [runtimeUrl, setRuntimeUrl] = useState<string>("");

  const loadRuntimeServers = useCallback(async () => {
    if (!vana || !address) return;

    setIsLoadingRuntimeServers(true);
    try {
      // Use direct contract access via protocol controller
      const contract = vana.protocol.createContract(
        "VanaRuntimeServers" as const,
      ) as any; // Type assertion needed - SDK types may be incomplete

      // Get runtime servers owned by the user (returns array of Server structs)
      const serverStructs = (await contract.read.getServersByOwner([
        address as `0x${string}`,
      ])) as readonly [
        bigint, // id
        `0x${string}`, // owner
        `0x${string}`, // runtimeAddress
        string, // publicKey (bytes as hex string)
        string, // escrowedPrivateKey (bytes as hex string)
        string, // url
        boolean, // isActive
        bigint, // registeredAt
      ][];

      console.info(
        `Found ${serverStructs.length} runtime servers for owner ${address}`,
      );

      // Map the structs to our RuntimeServer type
      const servers: RuntimeServer[] = serverStructs
        .filter(([, , , , , , isActive]) => isActive) // Only include active servers
        .map(
          ([
            id,
            owner,
            runtimeAddress,
            publicKey,
            escrowedPrivateKey,
            url,
            ,
            registeredAt,
          ]) => ({
            runtimeAddress,
            publicKey,
            escrowedPrivateKey,
            url,
            owner,
            registeredAt,
          }),
        );

      console.info("Loaded runtime servers:", servers);

      addToast({
        color: "success",
        title: `Runtime servers loaded`,
        description: `Found ${servers.length} runtime servers`,
      });

      setRuntimeServers(servers);
    } catch (error) {
      console.error("Failed to load runtime servers:", error);
      addToast({
        title: "Error loading runtime servers",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "solid",
        color: "danger",
      });
      // Set empty array on error
      setRuntimeServers([]);
    } finally {
      setIsLoadingRuntimeServers(false);
    }
  }, [vana, address]);

  const handleRegisterRuntime = useCallback(async () => {
    if (!vana || !address) return;

    // Validate inputs
    if (!runtimeAddress.trim()) {
      setRegisterRuntimeError("Please provide a runtime address");
      return;
    }

    if (!publicKey.trim()) {
      setRegisterRuntimeError("Please provide a public key");
      return;
    }

    if (!escrowedPrivateKey.trim()) {
      setRegisterRuntimeError("Please provide an escrowed private key");
      return;
    }

    if (!runtimeUrl.trim()) {
      setRegisterRuntimeError("Please provide a runtime URL");
      return;
    }

    setIsRegisteringRuntime(true);
    setRegisterRuntimeError("");

    try {
      // Use direct contract access via protocol controller
      // Note: SDK doesn't have a high-level runtime servers controller yet
      const contract = vana.protocol.createContract(
        "VanaRuntimeServers" as const,
      ) as any; // Type assertion needed - SDK types may be incomplete

      // Call registerServer on the contract
      // function registerServer(owner, runtimeAddress, publicKey, escrowedPrivateKey, url)
      const hash = await contract.write.registerServer([
        address as `0x${string}`, // owner
        runtimeAddress as `0x${string}`, // runtimeAddress
        publicKey, // publicKey (bytes)
        escrowedPrivateKey, // escrowedPrivateKey (bytes)
        runtimeUrl, // url
      ]);

      console.info(`Runtime registration transaction sent: ${hash}`);

      addToast({
        title: "Runtime Registered",
        description: `Successfully registered runtime ${runtimeAddress}`,
        variant: "solid",
        color: "success",
      });

      // Clear form fields on success
      setRuntimeAddress("");
      setPublicKey("");
      setEscrowedPrivateKey("");
      setRuntimeUrl("");

      // Refresh runtime servers list
      await loadRuntimeServers();
    } catch (error) {
      console.error("Failed to register runtime:", error);
      setRegisterRuntimeError(
        error instanceof Error ? error.message : "Failed to register runtime",
      );
    } finally {
      setIsRegisteringRuntime(false);
    }
  }, [
    vana,
    address,
    runtimeAddress,
    publicKey,
    escrowedPrivateKey,
    runtimeUrl,
    loadRuntimeServers,
  ]);

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!address) {
      setRuntimeServers([]);
      setRuntimeAddress("");
      setPublicKey("");
      setEscrowedPrivateKey("");
      setRuntimeUrl("");
      setRegisterRuntimeError("");
    }
  }, [address]);

  return {
    // State
    runtimeServers,
    isLoadingRuntimeServers,
    isRegisteringRuntime,
    registerRuntimeError,

    // Form state
    runtimeAddress,
    publicKey,
    escrowedPrivateKey,
    runtimeUrl,

    // Actions
    loadRuntimeServers,
    handleRegisterRuntime,
    setRuntimeAddress,
    setPublicKey,
    setEscrowedPrivateKey,
    setRuntimeUrl,
    setRegisterRuntimeError,
  };
}
