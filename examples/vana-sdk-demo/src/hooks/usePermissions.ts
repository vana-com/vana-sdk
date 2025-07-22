"use client";

import { useState, useCallback, useEffect } from "react";
import {
  OnChainPermissionGrant,
  GrantedPermission,
  GrantPermissionParams,
  retrieveGrantFile,
  PermissionGrantTypedData,
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
  handleConfirmGrant: () => Promise<void>;
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

  const onOpenGrant = useCallback(() => setShowGrantPreview(true), []);
  const onCloseGrant = useCallback(() => setShowGrantPreview(false), []);

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
      const onChainPermissions =
        await vana.permissions.getUserPermissionGrantsOnChain({
          limit: 20,
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
        const [_permissionInfo, fileIds] = await Promise.all([
          vana.permissions.getPermissionInfo(BigInt(permissionId)),
          vana.permissions.getPermissionFileIds(BigInt(permissionId)),
        ]);

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
    ) => {
      if (!vana || selectedFiles.length === 0) return;

      if (!applicationAddress) {
        setGrantStatus(
          "❌ Application address not available. Please refresh the page.",
        );
        return;
      }

      setIsGranting(true);
      setGrantStatus("Checking for existing permissions...");
      setGrantTxHash("");

      try {
        // Check if permission already exists - use simplified on-chain check
        const onChainPermissions = await loadUserPermissions();

        const params: GrantPermissionParams = {
          grantee: applicationAddress as `0x${string}`,
          operation: customParams?.operation || "llm_inference",
          files: selectedFiles,
          parameters: customParams?.parameters || {
            prompt: promptText,
          },
          ...customParams,
        };

        // Simple check: if we have an active permission for this grantor, consider reusing it
        const potentialMatch = onChainPermissions.find(
          (perm: OnChainPermissionGrant) =>
            perm.grantor.toLowerCase() === address?.toLowerCase() &&
            perm.active,
        );

        if (potentialMatch) {
          // Try to resolve this permission to check if it matches
          try {
            await resolvePermissionDetails(potentialMatch.id.toString());
            const resolved = resolvedPermissions.get(
              potentialMatch.id.toString(),
            );
            if (
              resolved &&
              resolved.files.some((f: number) => selectedFiles.includes(f))
            ) {
              setGrantStatus(
                `✅ Using existing permission! ID: ${resolved.id}`,
              );
              setLastGrantedPermissionId(resolved.id.toString());
              setGrantTxHash("");

              addToast({
                title: "Permission Already Exists",
                description: `Found existing permission with ID: ${resolved.id}`,
                variant: "solid",
                color: "success",
              });

              setIsGranting(false);
              return;
            }
          } catch {
            // Continue with new permission if resolution fails
            console.debug(
              "Failed to resolve existing permission, creating new one",
            );
          }
        }

        // No existing permission found, proceed with creating new one
        setGrantStatus("Preparing new permission...");

        const paramsWithExpiry = customParams?.expiresAt
          ? { ...params, expiresAt: customParams.expiresAt }
          : params;

        console.debug("🔍 Debug - Permission params:", {
          selectedFiles,
          paramsFiles: params.files,
          filesLength: params.files.length,
          appAddress: applicationAddress,
          operation: params.operation,
          parameters: params.parameters,
          promptText: promptText,
          customParams: customParams,
        });

        // Show preview to user BEFORE signing
        setGrantPreview({
          grantFile: null, // Will be populated after signing
          grantUrl: "",
          params: paramsWithExpiry,
          typedData: null,
          signature: null,
        });
        setIsGranting(false); // Reset here since modal will take over
        onOpenGrant();
      } catch (error) {
        console.error("Failed to grant permission:", error);
        setGrantStatus(
          `❌ Failed to grant permission: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setIsGranting(false);
      }
    },
    [
      vana,
      applicationAddress,
      address,
      onOpenGrant,
      loadUserPermissions,
      resolvePermissionDetails,
      resolvedPermissions,
    ],
  );

  const handleConfirmGrant = useCallback(
    async (updatedParams?: GrantPermissionParams & { expiresAt?: number }) => {
      console.debug(
        "handleConfirmGrant called with updatedParams:",
        updatedParams,
      );
      console.debug("grantPreview:", grantPreview);
      console.debug("vana:", !!vana);

      if (!grantPreview || !vana) {
        console.debug("Missing grantPreview or vana, returning");
        return;
      }

      // Use updated params if provided, otherwise use original grant preview params
      const paramsToUse = updatedParams || grantPreview.params;
      console.debug("Using params:", paramsToUse);

      setIsGranting(true);
      setGrantTxHash("");
      setGrantStatus("Signing grant...");

      try {
        // Now create and sign the grant after user confirmation
        setGrantStatus("Creating grant file via SDK...");

        // Use the SDK to create and sign the grant with the latest params
        console.debug("Creating grant with params:", grantPreview.params);
        const { typedData, signature } = await vana.permissions.createAndSign(
          grantPreview.params,
        );

        // Extract grant file for preview from the SDK
        setGrantStatus("Retrieving grant file for preview...");

        // The SDK stores the grant file in IPFS and puts the URL in typedData.message.grant
        const grantUrl = typedData.message.grant;

        // Try to retrieve the stored grant file, but don't fail if CORS issues occur
        let grantFile = null;
        try {
          grantFile = await retrieveGrantFile(grantUrl);
        } catch (error) {
          console.warn(
            "Failed to retrieve grant file (likely CORS issue):",
            error,
          );
          // Create a minimal grant file from the typedData for preview
          grantFile = {
            grantee: grantPreview.params.grantee,
            operation: grantPreview.params.operation || "llm_inference",
            parameters: grantPreview.params.parameters || {},
            expires: grantPreview.params.expiresAt,
          };
        }

        // Update grant preview with signed data
        setGrantPreview({
          grantFile,
          grantUrl,
          params: grantPreview.params,
          typedData,
          signature,
        });

        setGrantStatus("Submitting to blockchain...");

        // Submit the signed grant
        const txHash = await vana.permissions.submitSignedGrant(
          typedData,
          signature as `0x${string}`,
        );

        setGrantTxHash(txHash);
        onCloseGrant();

        // Store the grant URL and nonce to identify the newly created permission
        const grantUrlToMatch = typedData.message.grant;
        const nonceToMatch = typedData.message.nonce;

        // Show status while looking for the new permission
        setGrantStatus("Finding your new permission...");

        const findNewPermission = async (attempt = 1) => {
          setGrantStatus(`Finding your new permission... (attempt ${attempt})`);

          const freshPermissions = await loadUserPermissions();

          // Find the newly created permission by matching grant URL and nonce
          const newPermission = freshPermissions.find(
            (p: OnChainPermissionGrant) =>
              p.grantUrl === grantUrlToMatch &&
              p.nonce === BigInt(nonceToMatch),
          );

          if (newPermission) {
            setGrantStatus(`✅ Permission granted! ID: ${newPermission.id}`);
            setLastGrantedPermissionId(newPermission.id.toString());

            // Show a success toast notification
            addToast({
              title: "Permission Granted",
              description: `Successfully granted permission with ID: ${newPermission.id}`,
              variant: "solid",
              color: "success",
            });

            return newPermission;
          } else if (attempt < 6) {
            // Try up to 6 times with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            setTimeout(() => findNewPermission(attempt + 1), delay);
          } else {
            setGrantStatus(
              "✅ Permission granted! (ID will appear in the table soon)",
            );
          }
        };

        // Start polling after a short delay for the blockchain to process
        setTimeout(() => findNewPermission(), 3000);
      } catch (error) {
        console.error("Failed to confirm grant:", error);
        setGrantStatus(
          `❌ Failed to grant permission: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
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

          return await vana.permissions.revoke(params);
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
            loadUserPermissions();
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
          active: permissionInfo.isActive,
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
                grantHash: "", // Would need computation
                nonce: BigInt(permission.nonce || 0),
                addedAtBlock: permission.blockNumber || BigInt(0),
                addedAtTimestamp: BigInt(permission.grantedAt || 0),
                transactionHash: permission.transactionHash || "",
                grantor: permission.grantor,
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
      loadUserPermissions();
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
