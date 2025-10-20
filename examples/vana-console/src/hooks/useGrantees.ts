"use client";

import { useState, useCallback, useEffect } from "react";
import { useVana } from "@/providers/VanaProvider";
import { useSDKConfig } from "@/providers/SDKConfigProvider";
import { addToast } from "@heroui/react";
import type {
  Grantee,
  RegisterGranteeParams,
} from "@opendatalabs/vana-sdk/browser";

export interface UseGranteesReturn {
  // State
  grantees: Grantee[];
  granteesTotal: number;
  isLoadingGrantees: boolean;
  isAddingGrantee: boolean;
  isRemoving: boolean;
  addGranteeError: string;

  // Form state
  ownerAddress: string;
  granteeAddress: string;
  granteePublicKey: string;

  // Actions
  loadGrantees: (
    page?: number,
    perPage?: number,
    mode?: "subgraph" | "rpc" | "auto",
  ) => Promise<void>;
  handleAddGrantee: () => Promise<void>;
  handleAddGranteeGasless: (
    clearFieldsOnSuccess?: boolean,
    overrideParams?: RegisterGranteeParams,
  ) => Promise<void>;
  handleRemoveGrantee: (granteeId: number) => Promise<void>;
  setOwnerAddress: (address: string) => void;
  setGranteeAddress: (address: string) => void;
  setGranteePublicKey: (publicKey: string) => void;
  setAddGranteeError: (error: string) => void;
}

export function useGrantees(): UseGranteesReturn {
  const { vana } = useVana();
  const { effectiveAddress: address } = useSDKConfig();

  // Grantees state
  const [grantees, setGrantees] = useState<Grantee[]>([]);
  const [granteesTotal, setGranteesTotal] = useState<number>(0);
  const [isLoadingGrantees, setIsLoadingGrantees] = useState(false);
  const [isAddingGrantee, setIsAddingGrantee] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [addGranteeError, setAddGranteeError] = useState<string>("");

  // Form state
  const [ownerAddress, setOwnerAddress] = useState<string>("");
  const [granteeAddress, setGranteeAddress] = useState<string>("");
  const [granteePublicKey, setGranteePublicKey] = useState<string>("");

  const loadGrantees = useCallback(
    async (
      page: number = 1,
      perPage: number = 10,
      _mode: "subgraph" | "rpc" | "auto" = "auto",
    ) => {
      if (!vana || !address) return;

      console.log("🔴 [useGrantees] loadGrantees() CALLED", { page, perPage });
      setIsLoadingGrantees(true);
      try {
        console.log(
          "🔴 [useGrantees] Making API call to vana.permissions.getGrantees()",
        );
        const result = await vana.permissions.getGrantees({
          limit: perPage,
          offset: (page - 1) * perPage,
          includePermissions: false, // Don't fetch permission IDs - major performance optimization
        });

        console.log(
          "🔴 [useGrantees] API call completed, grantees count:",
          result.grantees.length,
          "total:",
          result.total,
        );

        addToast({
          color: "success",
          title: "Grantees loaded",
          description: `Found ${result.grantees.length} grantees${result.total ? ` (${result.total} total)` : ""}`,
        });

        setGrantees(result.grantees);
        setGranteesTotal(result.total);
      } catch (error) {
        console.error("Failed to load grantees:", error);
        addToast({
          title: "Error loading grantees",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "solid",
          color: "danger",
        });
      } finally {
        console.log("🔴 [useGrantees] Setting isLoadingGrantees to false");
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
      await vana.permissions.submitRegisterGrantee({
        owner: (ownerAddress ?? address) as `0x${string}`,
        granteeAddress: granteeAddress as `0x${string}`,
        publicKey: granteePublicKey,
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
      const actualParams = overrideParams ?? {
        owner: (ownerAddress ?? address) as `0x${string}`,
        granteeAddress: granteeAddress as `0x${string}`,
        publicKey: granteePublicKey,
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
        await vana.permissions.submitRegisterGrantee(actualParams);

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
    granteesTotal,
    isLoadingGrantees,
    isAddingGrantee,
    isRemoving,
    addGranteeError,

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
    setAddGranteeError,
  };
}
