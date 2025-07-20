"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Schema,
  Refiner,
  AddSchemaParams,
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
  schemaDefinitionUrl: string;
  isCreatingSchema: boolean;
  schemaStatus: string;
  lastCreatedSchemaId: number | null;

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
  loadSchemas: () => Promise<void>;
  loadRefiners: () => Promise<void>;
  handleCreateSchema: () => Promise<void>;
  handleCreateRefiner: () => Promise<void>;
  handleUpdateSchemaId: () => Promise<void>;

  // Setters
  setSchemaName: (name: string) => void;
  setSchemaType: (type: string) => void;
  setSchemaDefinitionUrl: (url: string) => void;
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
  const [schemaDefinitionUrl, setSchemaDefinitionUrl] = useState<string>("");
  const [isCreatingSchema, setIsCreatingSchema] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState<string>("");
  const [lastCreatedSchemaId, setLastCreatedSchemaId] = useState<number | null>(
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

  const loadSchemas = useCallback(async () => {
    if (!vana) return;

    setIsLoadingSchemas(true);
    try {
      const count = await vana.schemas.count();
      setSchemasCount(count);

      // Load first 10 schemas for display
      const schemaList: ExtendedSchema[] = [];
      const maxToLoad = Math.min(count, 10);

      for (let i = 1; i <= maxToLoad; i++) {
        try {
          const schema = await vana.schemas.get(i);
          schemaList.push({ ...schema, source: "discovered" });
        } catch (error) {
          console.warn(`Failed to load schema ${i}:`, error);
        }
      }

      setSchemas(schemaList);
    } catch (error) {
      console.error("Failed to load schemas:", error);
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [vana]);

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
      !schemaDefinitionUrl.trim()
    ) {
      setSchemaStatus("❌ Please fill in all schema fields");
      return;
    }

    const handler = createApiHandler(
      async () => {
        const params: AddSchemaParams = {
          name: schemaName,
          type: schemaType,
          definitionUrl: schemaDefinitionUrl,
        };

        return await vana.data.addSchema(params);
      },
      {
        setLoading: setIsCreatingSchema,
        setStatus: setSchemaStatus,
        loadingMessage: "Creating schema...",
        successMessage: (result) =>
          `✅ Schema created with ID: ${result.schemaId}`,
        errorMessage: "Error",
        onSuccess: (result) => {
          setLastCreatedSchemaId(result.schemaId);
          // Clear form
          setSchemaName("");
          setSchemaType("");
          setSchemaDefinitionUrl("");
          // Refresh counts
          setTimeout(() => {
            loadSchemas();
          }, 2000);
        },
      },
    );

    await handler();
  }, [vana, schemaName, schemaType, schemaDefinitionUrl, loadSchemas]);

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
          dlpId: dlpId,
          schemaId: schemaIdNum,
          refinementInstructionUrl: refinerInstructionUrl,
        };

        return await vana.data.addRefiner(params);
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
            loadRefiners();
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

        return await vana.data.updateSchemaId(params);
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
            loadRefiners();
          }, 2000);
        },
      },
    );

    await handler();
  }, [vana, updateRefinerId, updateSchemaId, loadRefiners]);

  // Load schemas and refiners when Vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadSchemas();
      loadRefiners();
    }
  }, [vana, address, loadSchemas, loadRefiners]);

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!address) {
      setSchemas([]);
      setRefiners([]);
      setSchemaName("");
      setSchemaType("");
      setSchemaDefinitionUrl("");
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
    schemaDefinitionUrl,
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
    setSchemaDefinitionUrl,
    setRefinerName,
    setRefinerDlpId,
    setRefinerSchemaId,
    setRefinerInstructionUrl,
    setUpdateRefinerId,
    setUpdateSchemaId,
  };
}
