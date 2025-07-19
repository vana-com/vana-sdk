"use client";

import { useState, useCallback, useEffect } from "react";
import { 
  GrantedPermission, 
  GrantPermissionParams,
  DEFAULT_ENCRYPTION_SEED,
  retrieveGrantFile,
  PermissionGrantTypedData,
} from "@opendatalabs/vana-sdk/browser";
import { useVana } from "@/providers/VanaProvider";
import { useAccount } from "wagmi";
import { addToast } from "@heroui/react";

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
  // State
  userPermissions: GrantedPermission[];
  isLoadingPermissions: boolean;
  isGranting: boolean;
  isRevoking: boolean;
  grantStatus: string;
  grantTxHash: string;
  grantPreview: GrantPreview | null;
  showGrantPreview: boolean;
  
  // Permission lookup
  permissionLookupId: string;
  setPermissionLookupId: (id: string) => void;
  isLookingUpPermission: boolean;
  permissionLookupStatus: string;
  lookedUpPermission: GrantedPermission | null;
  
  // Actions
  loadUserPermissions: () => Promise<GrantedPermission[]>;
  handleGrantPermission: (
    selectedFiles: number[],
    promptText: string,
    customParams?: GrantPermissionParams & { expiresAt?: number }
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
  setUserPermissions: (permissions: GrantedPermission[] | ((prev: GrantedPermission[]) => GrantedPermission[])) => void;
}

export function usePermissions(): UsePermissionsReturn {
  const { vana, applicationAddress } = useVana();
  const { address } = useAccount();
  
  // Permissions state
  const [userPermissions, setUserPermissions] = useState<GrantedPermission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [grantStatus, setGrantStatus] = useState<string>("");
  const [grantTxHash, setGrantTxHash] = useState<string>("");
  
  // Grant preview state
  const [grantPreview, setGrantPreview] = useState<GrantPreview | null>(null);
  const [showGrantPreview, setShowGrantPreview] = useState(false);
  
  // Permission lookup state
  const [permissionLookupId, setPermissionLookupId] = useState<string>("");
  const [isLookingUpPermission, setIsLookingUpPermission] = useState(false);
  const [permissionLookupStatus, setPermissionLookupStatus] = useState<string>("");
  const [lookedUpPermission, setLookedUpPermission] = useState<GrantedPermission | null>(null);
  
  const onOpenGrant = useCallback(() => setShowGrantPreview(true), []);
  const onCloseGrant = useCallback(() => setShowGrantPreview(false), []);
  
  const loadUserPermissions = useCallback(async () => {
    if (!vana) return [];
    
    setIsLoadingPermissions(true);
    try {
      const permissions = await vana.permissions.getUserPermissions({
        limit: 20,
      });
      setUserPermissions(permissions);
      return permissions;
    } catch (error) {
      console.error("Failed to load user permissions:", error);
      return [];
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [vana]);
  
  const handleGrantPermission = useCallback(async (
    selectedFiles: number[],
    promptText: string,
    customParams?: GrantPermissionParams & { expiresAt?: number }
  ) => {
    if (!vana || selectedFiles.length === 0) return;
    
    if (!applicationAddress) {
      setGrantStatus("❌ Application address not available. Please refresh the page.");
      return;
    }
    
    setIsGranting(true);
    setGrantStatus("Preparing permission...");
    setGrantTxHash("");
    
    try {
      // Skip server access check as it's not part of the SDK API
      
      const params: GrantPermissionParams = {
        to: applicationAddress as `0x${string}`,
        operation: customParams?.operation || "llm_inference",
        files: selectedFiles,
        parameters: customParams?.parameters || {
          prompt: promptText,
        },
        ...customParams,
      };
      
      const paramsWithExpiry = customParams?.expiresAt 
        ? { ...params, expiresAt: customParams.expiresAt }
        : params;
      
      console.debug("🔍 Debug - Permission params:", {
        selectedFiles,
        paramsFiles: params.files,
        filesLength: params.files.length,
        appAddress: applicationAddress,
      });
      
      // Show preview to user BEFORE signing
      setGrantPreview({
        grantFile: null, // Will be populated after signing
        grantUrl: "",
        params: paramsWithExpiry,
        typedData: null,
        signature: null,
      });
      onOpenGrant();
    } catch (error) {
      console.error("Failed to grant permission:", error);
      setGrantStatus(
        `❌ Failed to grant permission: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsGranting(false);
    }
  }, [vana, applicationAddress, onOpenGrant]);
  
  const handleConfirmGrant = useCallback(async () => {
    if (!grantPreview || !vana) return;
    
    setIsGranting(true);
    setGrantTxHash("");
    setGrantStatus("Signing grant...");
    
    try {
      // Now create and sign the grant after user confirmation
      setGrantStatus("Creating grant file via SDK...");
      
      // Use the SDK to create and sign the grant
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
        console.warn("Failed to retrieve grant file (likely CORS issue):", error);
        // Create a minimal grant file from the typedData for preview
        grantFile = {
          grantee: grantPreview.params.to,
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
          (p) =>
            p.grant === grantUrlToMatch && p.nonce === Number(nonceToMatch),
        );
        
        if (newPermission) {
          setGrantStatus(`✅ Permission granted! ID: ${newPermission.id}`);
          
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
          setGrantStatus("✅ Permission granted! (ID will appear in the table soon)");
        }
      };
      
      // Start polling after a short delay for the blockchain to process
      setTimeout(() => findNewPermission(), 3000);
    } catch (error) {
      console.error("Failed to confirm grant:", error);
      setGrantStatus(
        `❌ Failed to grant permission: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsGranting(false);
    }
  }, [grantPreview, vana, onCloseGrant, loadUserPermissions]);
  
  const handleCancelGrant = useCallback(() => {
    setGrantPreview(null);
    onCloseGrant();
    setIsGranting(false);
    setGrantStatus("");
  }, [onCloseGrant]);
  
  const handleRevokePermissionById = useCallback(async (permissionId: string) => {
    if (!vana || !permissionId.trim()) return;
    
    setIsRevoking(true);
    try {
      const bigIntId = BigInt(permissionId);
      const params = {
        permissionId: bigIntId,
      };
      
      await vana.permissions.revoke(params);
      
      // Refresh permissions list
      loadUserPermissions();
    } catch (error) {
      console.error("Failed to revoke permission:", error);
    } finally {
      setIsRevoking(false);
    }
  }, [vana, loadUserPermissions]);
  
  const handleLookupPermission = useCallback(async () => {
    if (!vana || !permissionLookupId.trim()) return;
    
    setIsLookingUpPermission(true);
    setPermissionLookupStatus("Looking up permission...");
    
    try {
      const permissionIdBigInt = BigInt(permissionLookupId);
      // Get permission details using SDK method
      const permissionInfo = await vana.permissions.getPermissionInfo(permissionIdBigInt);
      const fileIds = await vana.permissions.getPermissionFileIds(permissionIdBigInt);
      
      // Create a GrantedPermission object from the lookup result
      const permission: GrantedPermission = {
        id: permissionIdBigInt,
        operation: "data_access", // Default operation - this would need to be determined from the grant
        files: fileIds.map((id) => Number(id)),
        parameters: undefined,
        grant: permissionInfo.grant,
        grantor: permissionInfo.grantor,
        grantee: address!, // Get the current user's address from useAccount hook
        active: true, // Assume it's active if we can look it up
      };
      
      setPermissionLookupStatus(`✅ Found permission: ${permission.id}`);
      setLookedUpPermission(permission);
      
      // Add to main permissions array if not already present
      setUserPermissions((prev) => {
        const exists = prev.find((p) => p.id === permissionIdBigInt);
        if (exists) {
          return prev; // Already exists, no need to add
        } else {
          return [...prev, permission];
        }
      });
    } catch (error) {
      console.error("Failed to lookup permission:", error);
      setPermissionLookupStatus(
        `❌ Failed to lookup permission: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLookingUpPermission(false);
    }
  }, [vana, permissionLookupId]);
  
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
      setLookedUpPermission(null);
      setGrantPreview(null);
    }
  }, [address]);
  
  return {
    // State
    userPermissions,
    isLoadingPermissions,
    isGranting,
    isRevoking,
    grantStatus,
    grantTxHash,
    grantPreview,
    showGrantPreview,
    
    // Permission lookup
    permissionLookupId,
    setPermissionLookupId,
    isLookingUpPermission,
    permissionLookupStatus,
    lookedUpPermission,
    
    // Actions
    loadUserPermissions,
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