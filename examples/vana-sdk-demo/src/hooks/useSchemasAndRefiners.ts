"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  Schema,
  Refiner,
  CreateSchemaParams,
  CreateSchemaResult,
  AddRefinerParams,
  UpdateSchemaIdParams,
} from "@opendatalabs/vana-sdk/browser";
import { useVana } from "@/providers/VanaProvider";
import { useAccount } from "wagmi";
import { createApiHandler } from "./utils";

interface ExtendedSchema extends Schema {
  source?: "discovered" | "created";
}

interface ExtendedRefiner extends Refiner {
  source?: "discovered" | "created";
}

export interface UseSchemasAndRefinersReturn {
  // Schemas state
  schemas: ExtendedSchema[];
  isLoadingSchemas: boolean;
  schemasCount: number;

  // Schema creation state
  schemaName: string;
  schemaType: string;
  schemaDefinition: string;
  isCreatingSchema: boolean;
  schemaStatus: string;
  lastCreatedSchemaId: bigint | null;

  // Refiners state
  refiners: ExtendedRefiner[];
  isLoadingRefiners: boolean;
  refinersCount: number;

  // Refiner creation state
  refinerName: string;
  refinerDlpId: string;
  refinerSchemaId: string;
  refinerInstructionUrl: string;
  isCreatingRefiner: boolean;
  refinerStatus: string;
  lastCreatedRefinerId: number | null;

  // Schema update state
  updateRefinerId: string;
  updateSchemaId: string;
  isUpdatingSchema: boolean;
  updateSchemaStatus: string;

  // Actions
  loadSchemas: (page?: number, pageSize?: number) => Promise<void>;
  loadRefiners: () => Promise<void>;
  handleCreateSchema: () => Promise<void>;
  handleCreateRefiner: () => Promise<void>;
  handleUpdateSchemaId: () => Promise<void>;

  // Setters
  setSchemaName: (name: string) => void;
  setSchemaType: (type: string) => void;
  setSchemaDefinition: (definition: string) => void;
  setRefinerName: (name: string) => void;
  setRefinerDlpId: (id: string) => void;
  setRefinerSchemaId: (id: string) => void;
  setRefinerInstructionUrl: (url: string) => void;
  setUpdateRefinerId: (id: string) => void;
  setUpdateSchemaId: (id: string) => void;
}

export function useSchemasAndRefiners(): UseSchemasAndRefinersReturn {
  const { vana } = useVana();
  const { address } = useAccount();

  // Schema state
  const [schemas, setSchemas] = useState<ExtendedSchema[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [schemasCount, setSchemasCount] = useState(0);

  // Schema creation state
  const [schemaName, setSchemaName] = useState<string>("");
  const [schemaType, setSchemaType] = useState<string>("");
  const [schemaDefinition, setSchemaDefinition] = useState<string>("");
  const [isCreatingSchema, setIsCreatingSchema] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState<string>("");
  const [lastCreatedSchemaId, setLastCreatedSchemaId] = useState<bigint | null>(
    null,
  );

  // Refiners state
  const [refiners, setRefiners] = useState<ExtendedRefiner[]>([]);
  const [isLoadingRefiners, setIsLoadingRefiners] = useState(false);
  const [refinersCount, setRefinersCount] = useState(0);

  // Refiner creation state
  const [refinerName, setRefinerName] = useState<string>("");
  const [refinerDlpId, setRefinerDlpId] = useState<string>("");
  const [refinerSchemaId, setRefinerSchemaId] = useState<string>("");
  const [refinerInstructionUrl, setRefinerInstructionUrl] =
    useState<string>("");
  const [isCreatingRefiner, setIsCreatingRefiner] = useState(false);
  const [refinerStatus, setRefinerStatus] = useState<string>("");
  const [lastCreatedRefinerId, setLastCreatedRefinerId] = useState<
    number | null
  >(null);

  // Schema update state
  const [updateRefinerId, setUpdateRefinerId] = useState<string>("");
  const [updateSchemaId, setUpdateSchemaId] = useState<string>("");
  const [isUpdatingSchema, setIsUpdatingSchema] = useState(false);
  const [updateSchemaStatus, setUpdateSchemaStatus] = useState<string>("");

  const loadSchemas = useCallback(
    async (page = 1, pageSize = 10) => {
      if (!vana) return;

      setIsLoadingSchemas(true);
      try {
        const count = await vana.schemas.count();
        setSchemasCount(count);

        // Calculate offset for pagination (page is 1-based)
        const offset = (page - 1) * pageSize;

        // Use SDK's pagination support
        const schemaList = await vana.schemas.list({
          limit: pageSize,
          offset,
        });

        // Mark schemas as discovered
        const extendedSchemas: ExtendedSchema[] = schemaList.map((schema) => ({
          ...schema,
          source: "discovered" as const,
        }));

        setSchemas(extendedSchemas);
      } catch (error) {
        console.error("Failed to load schemas:", error);
      } finally {
        setIsLoadingSchemas(false);
      }
    },
    [vana],
  );

  const loadRefiners = useCallback(async () => {
    if (!vana) return;

    setIsLoadingRefiners(true);
    try {
      const count = await vana.data.getRefinersCount();
      setRefinersCount(count);

      // Load first 10 refiners for display
      const refinerList: ExtendedRefiner[] = [];
      const maxToLoad = Math.min(count, 10);

      for (let i = 1; i <= maxToLoad; i++) {
        try {
          const refiner = await vana.data.getRefiner(i);
          refinerList.push({ ...refiner, source: "discovered" });
        } catch (error) {
          console.warn(`Failed to load refiner ${i}:`, error);
        }
      }

      setRefiners(refinerList);
    } catch (error) {
      console.error("Failed to load refiners:", error);
    } finally {
      setIsLoadingRefiners(false);
    }
  }, [vana]);

  const handleCreateSchema = useCallback(async () => {
    if (
      !vana ||
      !schemaName.trim() ||
      !schemaType.trim() ||
      !schemaDefinition.trim()
    ) {
      setSchemaStatus("❌ Please fill in all schema fields");
      return;
    }

    const handler = createApiHandler(
      async () => {
        // Parse the schema definition JSON
        let definitionObject;
        try {
          definitionObject = JSON.parse(schemaDefinition);
        } catch {
          throw new Error("Invalid JSON in schema definition");
        }

        const params: CreateSchemaParams = {
          name: schemaName,
          dialect: schemaType as "json" | "sqlite",
          schema: definitionObject,
        };

        return vana.schemas.create(params);
      },
      {
        setLoading: setIsCreatingSchema,
        setStatus: setSchemaStatus,
        loadingMessage: "Creating schema and uploading to IPFS...",
        successMessage: (result: CreateSchemaResult) =>
          `✅ Schema created with ID: ${result.schemaId}. Definition URL: ${result.definitionUrl}`,
        errorMessage: "Error",
        onSuccess: (result) => {
          setLastCreatedSchemaId(result.schemaId);
          // Clear form
          setSchemaName("");
          setSchemaType("");
          setSchemaDefinition("");
          // Update count (page component handles reloading current page)
          if (vana) {
            setTimeout(() => {
              vana.schemas.count().then(setSchemasCount).catch(console.error);
            }, 2000);
          }
        },
      },
    );

    await handler();
  }, [vana, schemaName, schemaType, schemaDefinition, loadSchemas]);

  const handleCreateRefiner = useCallback(async () => {
    if (
      !vana ||
      !refinerName.trim() ||
      !refinerDlpId.trim() ||
      !refinerSchemaId.trim() ||
      !refinerInstructionUrl.trim()
    ) {
      setRefinerStatus("❌ Please fill in all refiner fields");
      return;
    }

    const dlpId = parseInt(refinerDlpId);
    const schemaIdNum = parseInt(refinerSchemaId);

    if (isNaN(dlpId) || isNaN(schemaIdNum)) {
      setRefinerStatus("❌ DLP ID and Schema ID must be valid numbers");
      return;
    }

    const handler = createApiHandler(
      async () => {
        const params: AddRefinerParams = {
          name: refinerName,
          dlpId,
          schemaId: schemaIdNum,
          refinementInstructionUrl: refinerInstructionUrl,
        };

        return vana.data.addRefiner(params);
      },
      {
        setLoading: setIsCreatingRefiner,
        setStatus: setRefinerStatus,
        loadingMessage: "Creating refiner...",
        successMessage: (result) =>
          `✅ Refiner created with ID: ${result.refinerId}`,
        errorMessage: "Error",
        onSuccess: (result) => {
          setLastCreatedRefinerId(result.refinerId);
          // Clear form
          setRefinerName("");
          setRefinerDlpId("");
          setRefinerSchemaId("");
          setRefinerInstructionUrl("");
          // Refresh counts
          setTimeout(() => {
            void loadRefiners();
          }, 2000);
        },
      },
    );

    await handler();
  }, [
    vana,
    refinerName,
    refinerDlpId,
    refinerSchemaId,
    refinerInstructionUrl,
    loadRefiners,
  ]);

  const handleUpdateSchemaId = useCallback(async () => {
    if (!vana || !updateRefinerId.trim() || !updateSchemaId.trim()) {
      setUpdateSchemaStatus(
        "❌ Please provide both refiner ID and new schema ID",
      );
      return;
    }

    const refinerId = parseInt(updateRefinerId);
    const newSchemaId = parseInt(updateSchemaId);

    if (isNaN(refinerId) || isNaN(newSchemaId)) {
      setUpdateSchemaStatus("❌ Both IDs must be valid numbers");
      return;
    }

    const handler = createApiHandler(
      async () => {
        const params: UpdateSchemaIdParams = {
          refinerId,
          newSchemaId,
        };

        return vana.data.updateSchemaId(params);
      },
      {
        setLoading: setIsUpdatingSchema,
        setStatus: setUpdateSchemaStatus,
        loadingMessage: "Updating schema ID...",
        successMessage: "✅ Schema ID updated successfully!",
        errorMessage: "Error",
        onSuccess: () => {
          // Clear form
          setUpdateRefinerId("");
          setUpdateSchemaId("");
          // Refresh refiners list
          setTimeout(() => {
            void loadRefiners();
          }, 2000);
        },
      },
    );

    await handler();
  }, [vana, updateRefinerId, updateSchemaId, loadRefiners]);

  // Load only count on init (page component handles actual schema loading with pagination)
  useEffect(() => {
    if (vana && address) {
      void loadRefiners();
      // Load schema count only
      vana.schemas.count().then(setSchemasCount).catch(console.error);
    }
  }, [vana, address, loadRefiners]);

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!address) {
      setSchemas([]);
      setSchemasCount(0);
      setRefiners([]);
      setRefinersCount(0);
      setSchemaName("");
      setSchemaType("");
      setSchemaDefinition("");
      setRefinerName("");
      setRefinerDlpId("");
      setRefinerSchemaId("");
      setRefinerInstructionUrl("");
      setUpdateRefinerId("");
      setUpdateSchemaId("");
    }
  }, [address]);

  return {
    // Schemas state
    schemas,
    isLoadingSchemas,
    schemasCount,

    // Schema creation state
    schemaName,
    schemaType,
    schemaDefinition,
    isCreatingSchema,
    schemaStatus,
    lastCreatedSchemaId,

    // Refiners state
    refiners,
    isLoadingRefiners,
    refinersCount,

    // Refiner creation state
    refinerName,
    refinerDlpId,
    refinerSchemaId,
    refinerInstructionUrl,
    isCreatingRefiner,
    refinerStatus,
    lastCreatedRefinerId,

    // Schema update state
    updateRefinerId,
    updateSchemaId,
    isUpdatingSchema,
    updateSchemaStatus,

    // Actions
    loadSchemas,
    loadRefiners,
    handleCreateSchema,
    handleCreateRefiner,
    handleUpdateSchemaId,

    // Setters
    setSchemaName,
    setSchemaType,
    setSchemaDefinition,
    setRefinerName,
    setRefinerDlpId,
    setRefinerSchemaId,
    setRefinerInstructionUrl,
    setUpdateRefinerId,
    setUpdateSchemaId,
  };
}
