"use client";

import { useState, useCallback, useEffect } from "react";
import {
  retrieveGrantFile,
  type OnChainPermissionGrant,
  type GrantedPermission,
  type GrantPermissionParams,
  type PermissionGrantTypedData,
} from "@opendatalabs/vana-sdk/browser";
import { useVana } from "@/providers/VanaProvider";
import { useAccount } from "wagmi";
import { addToast } from "@heroui/react";
import { createApiHandler } from "./utils";

interface GrantPreview {
  grantFile: {
    grantee: string;
    operation: string;
    parameters: unknown;
    expires?: number;
  } | null;
  grantUrl: string;
  params: GrantPermissionParams & { expiresAt?: number };
  typedData?: PermissionGrantTypedData | null;
  signature?: string | null;
}

export interface UsePermissionsReturn {
  // Fast on-chain state - loads instantly
  userPermissions: OnChainPermissionGrant[];
  isLoadingPermissions: boolean;

  // Slow off-chain resolution state - loads on-demand
  resolvedPermissions: Map<string, GrantedPermission>;
  resolvingPermissions: Set<string>;

  // Grant flow state
  isGranting: boolean;
  isRevoking: boolean;
  grantStatus: string;
  grantTxHash: string;
  grantPreview: GrantPreview | null;
  showGrantPreview: boolean;
  lastGrantedPermissionId: string | null;

  // Permission lookup
  permissionLookupId: string;
  setPermissionLookupId: (id: string) => void;
  isLookingUpPermission: boolean;
  permissionLookupStatus: string;
  lookedUpPermission: GrantedPermission | null;

  // Actions
  loadUserPermissions: () => Promise<OnChainPermissionGrant[]>;
  resolvePermissionDetails: (permissionId: string) => Promise<void>;
  handleGrantPermission: (
    selectedFiles: number[],
    promptText: string,
    customParams?: GrantPermissionParams & { expiresAt?: number },
  ) => Promise<void>;
  handleRevokePermissionById: (permissionId: string) => Promise<void>;
  handleLookupPermission: () => Promise<void>;
  onOpenGrant: () => void;
  onCloseGrant: () => void;
  handleConfirmGrant: (
    updatedParams?: GrantPermissionParams & { expiresAt?: number },
  ) => Promise<void>;
  handleCancelGrant: () => void;
  setGrantPreview: (preview: GrantPreview | null) => void;
  setGrantStatus: (status: string) => void;
  setGrantTxHash: (hash: string) => void;
  setUserPermissions: (
    permissions:
      | OnChainPermissionGrant[]
      | ((prev: OnChainPermissionGrant[]) => OnChainPermissionGrant[]),
  ) => void;
}

export function usePermissions(): UsePermissionsReturn {
  const { vana, applicationAddress } = useVana();
  const { address } = useAccount();

  // Fast on-chain permissions state - loads instantly for immediate UI feedback
  const [userPermissions, setUserPermissions] = useState<
    OnChainPermissionGrant[]
  >([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  // Slow off-chain resolution state - loads on-demand for detailed information
  const [resolvedPermissions, setResolvedPermissions] = useState<
    Map<string, GrantedPermission>
  >(new Map());
  const [resolvingPermissions, setResolvingPermissions] = useState<Set<string>>(
    new Set(),
  );

  // Grant flow state
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [grantStatus, setGrantStatus] = useState<string>("");
  const [grantTxHash, setGrantTxHash] = useState<string>("");
  const [lastGrantedPermissionId, setLastGrantedPermissionId] = useState<
    string | null
  >(null);

  // Grant preview state
  const [grantPreview, setGrantPreview] = useState<GrantPreview | null>(null);
  const [showGrantPreview, setShowGrantPreview] = useState(false);

  // Permission lookup state
  const [permissionLookupId, setPermissionLookupId] = useState<string>("");
  const [isLookingUpPermission, setIsLookingUpPermission] = useState(false);
  const [permissionLookupStatus, setPermissionLookupStatus] =
    useState<string>("");
  const [lookedUpPermission, setLookedUpPermission] =
    useState<GrantedPermission | null>(null);

  const onOpenGrant = useCallback(() => {
    setShowGrantPreview(true);
  }, []);
  const onCloseGrant = useCallback(() => {
    setShowGrantPreview(false);
  }, []);

  /**
   * Load fast on-chain permission data
   * This provides instant UI loading with basic information
   */
  const loadUserPermissions = useCallback(async () => {
    if (!vana) {
      return [];
    }

    setIsLoadingPermissions(true);
    try {
      // Load ALL permissions using fetchAll
      // This ensures users can see all their permissions, not just the first 20
      const onChainPermissions =
        await vana.permissions.getUserPermissionGrantsOnChain({
          fetchAll: true,
        });
      setUserPermissions(onChainPermissions);
      return onChainPermissions;
    } catch (error) {
      console.error("Failed to load user permissions:", error);
      return [];
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [vana]);

  /**
   * Resolve detailed permission data on-demand
   * This is the critical function that fetches complete permission details
   * only when the user explicitly requests them.
   */
  const resolvePermissionDetails = useCallback(
    async (permissionId: string) => {
      if (!vana) return;

      // Check if already resolved
      if (resolvedPermissions.has(permissionId)) return;

      // Check if currently resolving
      if (resolvingPermissions.has(permissionId)) return;

      // Find the on-chain permission
      const onChainPermission = userPermissions.find(
        (p) => p.id.toString() === permissionId,
      );
      if (!onChainPermission) {
        console.error("On-chain permission not found:", permissionId);
        return;
      }

      // Mark as resolving
      setResolvingPermissions((prev) => new Set(prev).add(permissionId));

      try {
        // Step 1: Get permission info and file IDs from contract
        let fileIds;
        try {
          const results = await Promise.all([
            vana.permissions.getPermissionInfo(BigInt(permissionId)),
            vana.permissions.getPermissionFileIds(BigInt(permissionId)),
          ]);
          fileIds = results[1];
        } catch (contractError) {
          console.warn(
            `Permission ID ${permissionId} not found in contract (likely stale data):`,
            contractError,
          );
          // Skip this permission and continue
          return;
        }

        // Step 2: Fetch grant file from IPFS
        let grantFile = null;
        try {
          grantFile = await retrieveGrantFile(onChainPermission.grantUrl);
        } catch (error) {
          console.warn(
            "Failed to retrieve grant file (likely CORS issue):",
            error,
          );
          // Create a minimal grant file fallback
          grantFile = {
            grantee: "0x0000000000000000000000000000000000000000",
            operation: "unknown",
            parameters: {},
            expires: undefined,
          };
        }

        // Step 3: Assemble the complete GrantedPermission object
        const resolvedPermission: GrantedPermission = {
          id: onChainPermission.id,
          files: fileIds.map((id: bigint) => Number(id)),
          operation: grantFile.operation,
          grant: onChainPermission.grantUrl,
          grantee: grantFile.grantee as `0x${string}`,
          grantor: onChainPermission.grantor,
          parameters: grantFile.parameters,
          active: onChainPermission.active,
          nonce: Number(onChainPermission.nonce),
          grantedAt: Number(onChainPermission.addedAtTimestamp),
          expiresAt: grantFile.expires,
          transactionHash: onChainPermission.transactionHash,
          blockNumber: onChainPermission.addedAtBlock,
        };

        // Step 4: Update resolved permissions map
        setResolvedPermissions((prev) => {
          const newMap = new Map(prev);
          newMap.set(permissionId, resolvedPermission);
          return newMap;
        });

        console.debug(
          "✅ Permission resolved:",
          permissionId,
          resolvedPermission,
        );
      } catch (error) {
        console.error(
          "Failed to resolve permission details:",
          permissionId,
          error,
        );
        addToast({
          title: "Error Loading Details",
          description: `Failed to load details for permission ${permissionId}`,
          variant: "solid",
          color: "danger",
        });
      } finally {
        // Remove from resolving set
        setResolvingPermissions((prev) => {
          const newSet = new Set(prev);
          newSet.delete(permissionId);
          return newSet;
        });
      }
    },
    [vana, userPermissions, resolvedPermissions, resolvingPermissions],
  );

  const handleGrantPermission = useCallback(
    async (
      selectedFiles: number[],
      promptText: string,
      customParams?: GrantPermissionParams & { expiresAt?: number },
    ): Promise<void> => {
      console.debug("🟢 [usePermissions] handleGrantPermission called");
      console.debug("🟢 [usePermissions] selectedFiles:", selectedFiles);
      console.debug("🟢 [usePermissions] promptText:", promptText);
      console.debug("🟢 [usePermissions] customParams:", customParams);
      console.debug("🟢 [usePermissions] vana:", !!vana);
      console.debug(
        "🟢 [usePermissions] applicationAddress:",
        applicationAddress,
      );

      if (!vana || selectedFiles.length === 0) {
        console.debug("🟢 [usePermissions] Early return - no vana or no files");
        return;
      }

      if (!applicationAddress) {
        console.debug("🟢 [usePermissions] No application address");
        setGrantStatus(
          "❌ Application address not available. Please refresh the page.",
        );
        return;
      }

      console.debug("🟢 [usePermissions] Starting permission preparation");
      setIsGranting(true);
      setGrantStatus("Preparing permission...");
      setGrantTxHash("");

      try {
        // Use custom parameters if provided, otherwise use defaults
        const params: GrantPermissionParams = {
          grantee:
            customParams?.grantee ?? (applicationAddress as `0x${string}`),
          operation: customParams?.operation ?? "llm_inference",
          files: customParams?.files ?? selectedFiles,
          parameters: customParams?.parameters ?? {
            prompt: promptText,
          },
        };

        // Add expiration to params if provided
        const paramsWithExpiry = customParams?.expiresAt
          ? { ...params, expiresAt: customParams.expiresAt }
          : params;

        console.debug("🟢 [usePermissions] Final params:", paramsWithExpiry);

        // Show preview to user BEFORE signing
        setGrantPreview({
          grantFile: null, // Will be populated after signing
          grantUrl: "",
          params: paramsWithExpiry,
          typedData: null,
          signature: null,
        });

        // If customParams provided, we're being called from the modal - go straight to signing
        if (customParams) {
          console.debug(
            "🟢 [usePermissions] Custom params provided, proceeding to sign",
          );
          console.debug(
            "🟢 [usePermissions] vana instance config:",
            vana?.getConfig?.(),
          );
          // Don't rely on state - pass params directly since state updates are async
          setIsGranting(true);
          setGrantTxHash("");
          setGrantStatus("Creating grant file...");

          // Debug: Check what's actually available
          console.debug("🟢 [usePermissions] About to call createAndSign");
          console.debug(
            "🟢 [usePermissions] vana.permissions context:",
            (vana.permissions as any).context,
          );
          const { typedData, signature } =
            await vana.permissions.createAndSign(paramsWithExpiry);

          setGrantStatus("Submitting to blockchain...");
          const txHandle = await vana.permissions.submitSignedGrant(
            typedData,
            signature,
          );
          const txHash = txHandle.hash;

          setGrantTxHash(txHash);
          setGrantStatus(`✅ Permission granted! Transaction: ${txHash}`);

          addToast({
            title: "Permission Granted",
            description: `Successfully granted permission. Transaction: ${txHash}`,
            variant: "solid",
            color: "success",
          });

          // Refresh permissions after delay
          setTimeout(() => {
            void loadUserPermissions();
          }, 3000);
        } else {
          // Otherwise, open the modal for user to configure
          console.debug("🟢 [usePermissions] Grant preview set, opening modal");
          setIsGranting(false); // Reset here since modal will take over
          onOpenGrant();
          console.debug("🟢 [usePermissions] Modal should be open now");
        }
      } catch (error) {
        console.error(
          "🟢 [usePermissions] Failed to prepare permission grant:",
          error,
        );
        setGrantStatus(
          `❌ Failed to prepare permission: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setIsGranting(false);
      }
    },
    [vana, applicationAddress, address, onOpenGrant],
  );

  const handleConfirmGrant = useCallback(
    async (updatedParams?: GrantPermissionParams & { expiresAt?: number }) => {
      console.debug("🔵 [usePermissions] handleConfirmGrant called");
      console.debug("🔵 [usePermissions] updatedParams:", updatedParams);
      console.debug("🔵 [usePermissions] grantPreview:", grantPreview);
      console.debug("🔵 [usePermissions] vana:", !!vana);

      if (!grantPreview || !vana) {
        console.debug(
          "🔵 [usePermissions] Missing grantPreview or vana, returning",
        );
        return;
      }

      // Use updated params if provided, otherwise use original grant preview params
      const paramsToUse = updatedParams ?? grantPreview.params;
      console.debug("🔵 [usePermissions] Using params:", paramsToUse);

      setIsGranting(true);
      setGrantTxHash("");
      setGrantStatus("Creating grant file...");

      try {
        console.debug(
          "🔵 [usePermissions] Calling vana.permissions.createAndSign",
        );
        // Create and sign the grant
        const { typedData, signature } =
          await vana.permissions.createAndSign(paramsToUse);

        console.debug(
          "🔵 [usePermissions] createAndSign successful, typedData:",
          typedData,
        );
        console.debug("🔵 [usePermissions] signature:", signature);

        setGrantStatus("Submitting to blockchain...");

        console.debug(
          "🔵 [usePermissions] Calling vana.permissions.submitSignedGrant",
        );
        // Submit the signed grant
        const txHandle = await vana.permissions.submitSignedGrant(
          typedData,
          signature,
        );

        const txHash = txHandle.hash;
        console.debug(
          "🔵 [usePermissions] submitSignedGrant successful, txHash:",
          txHash,
        );

        setGrantTxHash(txHash);
        setGrantStatus(`✅ Permission granted! Transaction: ${txHash}`);
        setLastGrantedPermissionId("");

        // Show success toast
        addToast({
          title: "Permission Granted",
          description: `Successfully granted permission. Transaction: ${txHash}`,
          variant: "solid",
          color: "success",
        });

        // Close the modal and reset state
        onCloseGrant();
        setGrantPreview(null);

        // Refresh permissions list after a short delay
        setTimeout(() => {
          void loadUserPermissions();
        }, 3000);
      } catch (error) {
        console.error("Failed to confirm grant:", error);
        setGrantStatus(
          `❌ Failed to grant permission: ${error instanceof Error ? error.message : "Unknown error"}`,
        );

        // Show error toast
        addToast({
          title: "Permission Grant Failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "solid",
          color: "danger",
        });
      } finally {
        setIsGranting(false);
      }
    },
    [grantPreview, vana, onCloseGrant, loadUserPermissions],
  );

  const handleCancelGrant = useCallback(() => {
    setGrantPreview(null);
    onCloseGrant();
    setIsGranting(false);
    setGrantStatus("");
  }, [onCloseGrant]);

  const handleRevokePermissionById = useCallback(
    async (permissionId: string) => {
      if (!vana || !permissionId.trim()) return;

      const handler = createApiHandler(
        async () => {
          const bigIntId = BigInt(permissionId);
          const params = {
            permissionId: bigIntId,
          };

          return vana.permissions.revoke(params);
        },
        {
          setLoading: setIsRevoking,
          loadingMessage: "Revoking permission...",
          toastTitle: "Failed to revoke permission",
          onSuccess: () => {
            // Refresh permissions list and clear resolved permission
            setResolvedPermissions((prev) => {
              const newMap = new Map(prev);
              newMap.delete(permissionId);
              return newMap;
            });
            void loadUserPermissions();
          },
        },
      );

      await handler();
    },
    [vana, loadUserPermissions],
  );

  const handleLookupPermission = useCallback(async () => {
    if (!vana || !permissionLookupId.trim()) return;

    const handler = createApiHandler(
      async () => {
        // Try to resolve the permission details first
        await resolvePermissionDetails(permissionLookupId);

        // Get the resolved permission if available
        const resolved = resolvedPermissions.get(permissionLookupId);
        if (resolved) {
          return resolved;
        }

        // Fallback to basic permission info if resolution failed
        const permissionIdBigInt = BigInt(permissionLookupId);
        const permissionInfo =
          await vana.permissions.getPermissionInfo(permissionIdBigInt);

        const basicPermission: GrantedPermission = {
          id: permissionIdBigInt,
          files: [], // Would need to resolve
          operation: "unknown", // Would need to resolve from grant file
          grant: permissionInfo.grant,
          grantee: "0x0000000000000000000000000000000000000000", // Would need to resolve
          grantor: permissionInfo.grantor,
          parameters: {}, // Would need to resolve
          active:
            permissionInfo.endBlock === BigInt(0) ||
            permissionInfo.endBlock > BigInt(0), // Active if no end block or end block in future
          nonce: Number(permissionInfo.nonce),
          grantedAt: 0, // Would need to get from transaction
          transactionHash: "", // Would need to get from lookup
          blockNumber: BigInt(0), // Would need to get from transaction
        };

        return basicPermission;
      },
      {
        setLoading: setIsLookingUpPermission,
        setStatus: setPermissionLookupStatus,
        loadingMessage: "Looking up permission...",
        successMessage: (permission) => `✅ Found permission: ${permission.id}`,
        errorMessage: (error) =>
          `Failed to lookup permission: ${error.message}`,
        onSuccess: (permission) => {
          setLookedUpPermission(permission);

          // Add to main permissions array if not already present (as on-chain data)
          setUserPermissions((prev) => {
            const exists = prev.find((p) => p.id === permission.id);
            if (exists) {
              return prev;
            } else {
              // Create an on-chain permission entry
              const onChainEntry: OnChainPermissionGrant = {
                id: permission.id,
                grantUrl: permission.grant,
                grantSignature: "", // Would need lookup
                nonce: BigInt(Number(permission.nonce) || 0),
                startBlock: BigInt(0), // Would need lookup
                addedAtBlock: BigInt(Number(permission.blockNumber) || 0),
                addedAtTimestamp: BigInt(Number(permission.grantedAt) || 0),
                transactionHash: permission.transactionHash ?? "",
                grantor: permission.grantor,
                grantee: {
                  id: "", // Would need lookup
                  address: "", // Would need lookup
                },
                active: permission.active,
              };
              return [...prev, onChainEntry];
            }
          });
        },
      },
    );

    await handler();
  }, [vana, permissionLookupId, resolvePermissionDetails, resolvedPermissions]);

  // Load permissions when Vana is initialized
  useEffect(() => {
    if (vana && address) {
      void loadUserPermissions();
    }
  }, [vana, address, loadUserPermissions]);

  // Clear permissions when wallet disconnects
  useEffect(() => {
    if (!address) {
      setUserPermissions([]);
      setResolvedPermissions(new Map());
      setResolvingPermissions(new Set());
      setLookedUpPermission(null);
      setGrantPreview(null);
    }
  }, [address]);

  return {
    // Fast on-chain state
    userPermissions,
    isLoadingPermissions,

    // Slow off-chain resolution state
    resolvedPermissions,
    resolvingPermissions,

    // Grant flow state
    isGranting,
    isRevoking,
    grantStatus,
    grantTxHash,
    grantPreview,
    showGrantPreview,
    lastGrantedPermissionId,

    // Permission lookup
    permissionLookupId,
    setPermissionLookupId,
    isLookingUpPermission,
    permissionLookupStatus,
    lookedUpPermission,

    // Actions
    loadUserPermissions,
    resolvePermissionDetails,
    handleGrantPermission,
    handleRevokePermissionById,
    handleLookupPermission,
    onOpenGrant,
    onCloseGrant,
    handleConfirmGrant,
    handleCancelGrant,
    setGrantPreview,
    setGrantStatus,
    setGrantTxHash,
    setUserPermissions,
  };
}
