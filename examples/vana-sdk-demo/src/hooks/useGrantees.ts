"use client";

import { useState, useCallback, useEffect } from "react";
import { useVana } from "@/providers/VanaProvider";
import { useAccount } from "wagmi";
import { addToast } from "@heroui/react";
import type {
  Grantee,
  RegisterGranteeParams,
} from "@opendatalabs/vana-sdk/browser";

export interface UseGranteesReturn {
  // State
  grantees: Grantee[];
  isLoadingGrantees: boolean;
  isAddingGrantee: boolean;
  isRemoving: boolean;
  addGranteeError: string;
  granteeQueryMode: "subgraph" | "rpc" | "auto";

  // Form state
  ownerAddress: string;
  granteeAddress: string;
  granteePublicKey: string;

  // Actions
  loadGrantees: (mode?: "subgraph" | "rpc" | "auto") => Promise<void>;
  handleAddGrantee: () => Promise<void>;
  handleAddGranteeGasless: (
    clearFieldsOnSuccess?: boolean,
    overrideParams?: RegisterGranteeParams,
  ) => Promise<void>;
  handleRemoveGrantee: (granteeId: number) => Promise<void>;
  setOwnerAddress: (address: string) => void;
  setGranteeAddress: (address: string) => void;
  setGranteePublicKey: (publicKey: string) => void;
  setGranteeQueryMode: (mode: "subgraph" | "rpc" | "auto") => void;
  setAddGranteeError: (error: string) => void;
}

export function useGrantees(): UseGranteesReturn {
  const { vana } = useVana();
  const { address } = useAccount();

  // Grantees state
  const [grantees, setGrantees] = useState<Grantee[]>([]);
  const [isLoadingGrantees, setIsLoadingGrantees] = useState(false);
  const [isAddingGrantee, setIsAddingGrantee] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [addGranteeError, setAddGranteeError] = useState<string>("");
  const [granteeQueryMode, setGranteeQueryMode] = useState<
    "subgraph" | "rpc" | "auto"
  >("auto");

  // Form state
  const [ownerAddress, setOwnerAddress] = useState<string>("");
  const [granteeAddress, setGranteeAddress] = useState<string>("");
  const [granteePublicKey, setGranteePublicKey] = useState<string>("");

  const loadGrantees = useCallback(
    async (_mode: "subgraph" | "rpc" | "auto" = "auto") => {
      if (!vana || !address) return;

      setIsLoadingGrantees(true);
      try {
        const result = await vana.permissions.getGrantees({
          limit: 50, // For demo purposes, limit to 50 grantees
          offset: 0,
        });

        console.info("Loaded grantees:", result);

        addToast({
          color: "success",
          title: "Grantees loaded",
          description: `Found ${result.grantees.length} grantees${result.total ? ` (${result.total} total)` : ""}`,
        });

        setGrantees(result.grantees);
      } catch (error) {
        console.error("Failed to load grantees:", error);
        addToast({
          title: "Error loading grantees",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "solid",
          color: "danger",
        });
      } finally {
        setIsLoadingGrantees(false);
      }
    },
    [vana, address],
  );

  const handleAddGrantee = useCallback(async () => {
    if (!vana || !address) return;

    // Validate inputs
    if (!granteeAddress.trim()) {
      setAddGranteeError("Please provide a grantee address");
      return;
    }

    setIsAddingGrantee(true);
    setAddGranteeError("");

    try {
      await vana.permissions.registerGrantee({
        owner: (ownerAddress || address) as `0x${string}`,
        granteeAddress: granteeAddress as `0x${string}`,
        publicKey: granteePublicKey || "0x", // Use provided public key or default
      });

      // Success - refresh grantees list
      await loadGrantees();

      // Clear form
      setOwnerAddress("");
      setGranteeAddress("");
      setGranteePublicKey("");
    } catch (error) {
      setAddGranteeError(
        error instanceof Error ? error.message : "Failed to add grantee",
      );
    } finally {
      setIsAddingGrantee(false);
    }
  }, [vana, address, granteeAddress, loadGrantees]);

  const handleAddGranteeGasless = useCallback(
    async (
      clearFieldsOnSuccess = true,
      overrideParams?: RegisterGranteeParams,
    ) => {
      if (!vana || !address) return;

      // Use override params if provided, otherwise use form state
      const actualParams = overrideParams || {
        owner: (ownerAddress || address) as `0x${string}`,
        granteeAddress: granteeAddress as `0x${string}`,
        publicKey: granteePublicKey || "0x", // Use provided public key or default
      };

      // Validate inputs
      if (!actualParams.owner) {
        setAddGranteeError("Please provide an owner address");
        return;
      }
      if (!actualParams.granteeAddress.trim()) {
        setAddGranteeError("Please provide a grantee address");
        return;
      }

      setIsAddingGrantee(true);
      setAddGranteeError("");

      try {
        await vana.permissions.registerGranteeWithSignature(actualParams);

        console.info(
          "✅ Register grantee with signature completed successfully!",
        );

        // Success - clear the form fields on success only if requested
        if (clearFieldsOnSuccess) {
          setOwnerAddress("");
          setGranteeAddress("");
          setGranteePublicKey("");
        }

        // Refresh grantees list
        await loadGrantees();
        console.info("✅ Grantees list refreshed");
      } catch (error) {
        console.error("❌ Register grantee with signature failed:", error);
        setAddGranteeError(
          error instanceof Error ? error.message : "Failed to add grantee",
        );
      } finally {
        setIsAddingGrantee(false);
      }
    },
    [vana, address, granteeAddress, loadGrantees],
  );

  const handleRemoveGrantee = useCallback(
    async (_granteeId: number) => {
      if (!vana || !address) return;

      setIsRemoving(true);
      try {
        // Note: The grantee contract doesn't seem to have a remove function
        // This would need to be implemented based on the actual contract capabilities
        console.warn(
          "Remove grantee functionality not implemented in contract",
        );

        addToast({
          title: "Not Implemented",
          description: "Remove grantee functionality is not available yet",
          variant: "solid",
          color: "warning",
        });

        // For now, just refresh the list
        await loadGrantees();
      } catch (error) {
        console.error("Failed to remove grantee:", error);
        addToast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to remove grantee",
          variant: "solid",
          color: "danger",
        });
      } finally {
        setIsRemoving(false);
      }
    },
    [vana, address, loadGrantees],
  );

  // Load grantees when Vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadGrantees();
    }
  }, [vana, address, loadGrantees]);

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!address) {
      setGrantees([]);
      setOwnerAddress("");
      setGranteeAddress("");
      setGranteePublicKey("");
      setAddGranteeError("");
    }
  }, [address]);

  return {
    // State
    grantees,
    isLoadingGrantees,
    isAddingGrantee,
    isRemoving,
    addGranteeError,
    granteeQueryMode,

    // Form state
    ownerAddress,
    granteeAddress,
    granteePublicKey,

    // Actions
    loadGrantees,
    handleAddGrantee,
    handleAddGranteeGasless,
    handleRemoveGrantee,
    setOwnerAddress,
    setGranteeAddress,
    setGranteePublicKey,
    setGranteeQueryMode,
    setAddGranteeError,
  };
}
