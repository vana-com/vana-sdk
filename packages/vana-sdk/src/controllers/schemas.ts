import type {
  Schema,
  SchemaMetadata,
  CompleteSchema,
  AddSchemaParams,
} from "../types/index";
// import type { TransactionResult } from "../types/operations";
import type { SchemaAddedResult } from "../types/transactionResults";
import type { ControllerContext } from "./permissions";
import { BaseController } from "./base";
import { getContractAddress } from "../generated/addresses";
import { getAbi } from "../generated/abi";
import { gasAwareMulticall } from "../utils/multicall";
import {
  validateDataSchemaAgainstMetaSchema,
  SchemaValidationError,
  type DataSchema,
} from "../utils/schemaValidation";
import {
  fetchSchemaFromChain,
  fetchSchemaCountFromChain,
} from "../utils/blockchain/registry";
import {
  GetSchemaDocument,
  ListSchemasDocument,
  CountSchemasDocument,
  type GetSchemaQuery,
  type ListSchemasQuery,
  type CountSchemasQuery,
} from "../generated/subgraph";
import { print } from "graphql";
import { fetchFromUrl, UrlResolutionError } from "../utils/urlResolver";

/**
 * Parameters for creating a new schema with automatic IPFS upload.
 *
 * @remarks
 * This interface is used with the high-level `schemas.create()` method which
 * automatically uploads the schema definition to IPFS and registers it on-chain.
 * @category Schema Management
 */
export interface CreateSchemaParams {
  /** The name of the schema */
  name: string;
  /** The dialect of the schema (e.g., 'json' or 'sqlite') */
  dialect: "json" | "sqlite";
  /** The schema definition object or JSON string */
  schema: object | string;
}

/**
 * Result of creating a new schema.
 *
 * @remarks
 * Returned by the `schemas.create()` method after successful upload and registration.
 * @category Schema Management
 */
export interface CreateSchemaResult {
  /** The schema ID assigned by the contract */
  schemaId: bigint;
  /** The IPFS URL where the schema definition is stored */
  definitionUrl: string;
  /** The transaction hash of the schema registration */
  transactionHash: string;
}

/**
 * Manages data schemas for validation and structure definition on Vana.
 *
 * @remarks
 * Handles schema lifecycle from creation through registration. Schemas define
 * data structure and validation rules, ensuring consistency across the network.
 * Stored unencrypted on IPFS for public reusability.
 *
 * **Architecture:**
 * Schemas use dual storage: definitions on IPFS (public), metadata on blockchain.
 * Supports JSON Schema and SQLite dialects for flexible data modeling.
 *
 * **Method Selection:**
 * - `create()` - Validate, upload to IPFS, register on blockchain
 * - `get()` - Retrieve schema with definition by ID
 * - `list()` - Paginated schema browsing with metadata
 * - `count()` - Total schemas for pagination
 * - `addSchema()` - Low-level registration with pre-uploaded URL
 *
 * **Storage Requirements:**
 * - Methods requiring storage: `create()`
 * - Methods without storage: `get()`, `list()`, `count()`, `addSchema()`
 *
 * @example
 * ```typescript
 * // Create schema with validation rules
 * const result = await vana.schemas.create({
 *   name: "User Profile",
 *   dialect: "json",
 *   schema: {
 *     type: "object",
 *     properties: {
 *       name: { type: "string", minLength: 1 },
 *       age: { type: "number", minimum: 0, maximum: 150 }
 *     },
 *     required: ["name"]
 *   }
 * });
 * console.log(`Schema ${result.schemaId} created`);
 *
 * // Retrieve for validation
 * const schema = await vana.schemas.get(result.schemaId);
 * console.log(`Schema: ${schema.name} (${schema.dialect})`);
 *
 * // Browse available schemas
 * const schemas = await vana.schemas.list({ limit: 10 });
 * schemas.forEach(s => console.log(`${s.id}: ${s.name}`));
 * ```
 *
 * @category Schema Management
 * @see For conceptual overview, visit {@link https://docs.vana.org/docs/schemas}
 */
export class SchemaController extends BaseController {
  constructor(context: ControllerContext) {
    super(context);
  }

  /**
   * Creates a schema with validation and IPFS upload.
   *
   * @remarks
   * Primary method for schema creation. Validates definition,
   * uploads to IPFS (unencrypted for reusability), and registers
   * on blockchain. Schema becomes immediately available network-wide.
   *
   * @param params - Creation configuration
   * @param params.name - Human-readable schema name
   * @param params.dialect - Schema format (`"json"` or `"sqlite"`)
   * @param params.schema - Definition object or JSON string
   *
   * @returns Schema ID, IPFS URL, and transaction hash
   *
   * @throws {SchemaValidationError} Invalid schema definition.
   *   Verify schema follows JSON Schema or SQLite format.
   * @throws {Error} Storage not configured.
   *   Configure storage providers in VanaConfig.
   * @throws {Error} IPFS upload failed.
   *   Check network and storage provider status.
   *
   * @example
   * ```typescript
   * const result = await vana.schemas.create({
   *   name: "User Profile",
   *   dialect: "json",
   *   schema: {
   *     type: "object",
   *     properties: {
   *       name: { type: "string", minLength: 1 },
   *       age: { type: "number", minimum: 0 }
   *     },
   *     required: ["name"]
   *   }
   * });
   * console.log(`Schema ${result.schemaId} at ${result.definitionUrl}`);
   * ```
   */
  async create(params: CreateSchemaParams): Promise<CreateSchemaResult> {
    this.assertWallet();
    const { name, dialect, schema } = params;

    try {
      // Step 1: Normalize and validate the schema definition
      let schemaDefinition: object;
      if (typeof schema === "string") {
        try {
          schemaDefinition = JSON.parse(schema);
        } catch {
          throw new SchemaValidationError(
            "Invalid JSON in schema definition",
            [],
          );
        }
      } else {
        schemaDefinition = schema;
      }

      // Step 2: Validate against metaschema
      const dataSchema: DataSchema = {
        name,
        version: "1.0.0",
        dialect,
        schema: schemaDefinition,
      };

      validateDataSchemaAgainstMetaSchema(dataSchema);

      // Step 3: Upload to IPFS (unencrypted for public access)
      if (!this.context.storageManager) {
        // Use centralized validation if available, otherwise fall back to old behavior
        if (this.context.validateStorageRequired) {
          this.context.validateStorageRequired();
          // The validateStorageRequired method throws, so this line should never be reached
          // but TypeScript doesn't know that, so we need this fallback
          throw new Error("Storage validation failed");
        } else {
          throw new Error(
            "Storage manager not configured. Please provide storage providers in VanaConfig.",
          );
        }
      }

      const schemaBlob = new Blob([JSON.stringify(dataSchema)], {
        type: "application/json",
      });

      const uploadResult = await this.context.storageManager.upload(
        schemaBlob,
        `${name.replace(/[^a-zA-Z0-9]/g, "_")}.json`,
      );

      // Step 4: Register on blockchain
      const chainId =
        this.context.walletClient?.chain?.id ??
        this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const account =
        this.context.walletClient.account ?? this.context.userAddress;
      const from = typeof account === "string" ? account : account?.address;

      const hash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "addSchema",
        args: [name, dialect, uploadResult.url],
        account,
        chain: this.context.walletClient.chain ?? null,
      });

      const { tx } = await import("../utils/transactionHelpers");
      const txResult = tx({
        hash,
        from: from!,
        contract: "DataRefinerRegistry",
        fn: "addSchema",
      });

      // Wait for events and extract domain data
      if (!this.context.waitForTransactionEvents) {
        throw new Error("waitForTransactionEvents not configured");
      }

      const result = await this.context.waitForTransactionEvents(txResult);
      const event = result.expectedEvents.SchemaAdded;
      if (!event) {
        throw new Error("SchemaAdded event not found in transaction");
      }

      return {
        schemaId: event.schemaId,
        definitionUrl: uploadResult.url,
        transactionHash: hash,
      };
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw error;
      }
      throw new Error(
        `Schema creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves a complete schema by its ID with definition fetched and flattened.
   *
   * @param schemaId - The ID of the schema to retrieve
   * @param options - Optional parameters
   * @param options.subgraphUrl - Custom subgraph URL to use instead of default
   * @returns Promise resolving to the complete schema object with all fields populated
   * @throws {Error} When the schema is not found, definition cannot be fetched, or chain is unavailable
   * @example
   * ```typescript
   * const schema = await vana.schemas.get(1);
   * console.log(`Schema: ${schema.name} (${schema.dialect})`);
   * console.log(`Version: ${schema.version}`);
   * console.log(`Description: ${schema.description}`);
   * console.log('Schema:', schema.schema);
   *
   * // Use directly with validator (schema has all required fields)
   * validator.validateDataAgainstSchema(data, schema);
   * ```
   */
  async get(
    schemaId: number,
    options: { subgraphUrl?: string } = {},
  ): Promise<CompleteSchema> {
    const subgraphUrl = options.subgraphUrl ?? this.context.subgraphUrl;

    let metadata: SchemaMetadata;

    // Try subgraph first if available
    if (subgraphUrl) {
      try {
        metadata = await this._getSchemaViaSubgraph({ schemaId, subgraphUrl });
      } catch (error) {
        console.debug("Subgraph query failed, falling back to RPC:", error);
        // Fall through to RPC
        try {
          metadata = await fetchSchemaFromChain(this.context, schemaId);
        } catch (rpcError) {
          throw new Error(
            `Failed to get schema: ${rpcError instanceof Error ? rpcError.message : "Unknown error"}`,
          );
        }
      }
    } else {
      // Use RPC directly
      try {
        metadata = await fetchSchemaFromChain(this.context, schemaId);
      } catch (error) {
        throw new Error(
          `Failed to get schema: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // Fetch the definition (should be a complete DataSchema)
    const definition = await fetchFromUrl(
      metadata.definitionUrl,
      this.context.downloadRelayer,
    );

    if (!definition || typeof definition !== "object") {
      throw new Error(
        `Invalid schema definition format for schema ${schemaId}`,
      );
    }

    // Validate the fetched DataSchema
    validateDataSchemaAgainstMetaSchema(definition);
    const dataSchema = definition as DataSchema;

    // Verify on-chain and off-chain data match
    if (dataSchema.name !== metadata.name) {
      console.warn(
        `Schema name mismatch for ID ${schemaId}: on-chain="${metadata.name}" off-chain="${dataSchema.name}" (using on-chain value)`,
      );
    }
    if (dataSchema.dialect !== metadata.dialect) {
      console.warn(
        `Schema dialect mismatch for ID ${schemaId}: on-chain="${metadata.dialect}" off-chain="${dataSchema.dialect}" (using on-chain value)`,
      );
    }

    // Return using on-chain values as authoritative source
    return {
      ...metadata,
      version: dataSchema.version,
      description: dataSchema.description,
      schema: dataSchema.schema,
    };
  }

  /**
   * Gets the total number of schemas registered on the network.
   *
   * @param options - Optional parameters
   * @param options.subgraphUrl - Custom subgraph URL to use instead of default
   * @returns Promise resolving to the total schema count
   * @throws {Error} When the count cannot be retrieved
   * @example
   * ```typescript
   * const count = await vana.schemas.count();
   * console.log(`Total schemas: ${count}`);
   *
   * // With custom subgraph
   * const count = await vana.schemas.count({
   *   subgraphUrl: 'https://custom-subgraph.com/graphql'
   * });
   * ```
   */
  async count(options: { subgraphUrl?: string } = {}): Promise<number> {
    const subgraphUrl = options.subgraphUrl ?? this.context.subgraphUrl;

    // Try subgraph first if available
    if (subgraphUrl) {
      try {
        return await this._countSchemasViaSubgraph({ subgraphUrl });
      } catch (error) {
        console.debug("Subgraph query failed, falling back to RPC:", error);
        // Fall through to RPC
      }
    }

    // Use RPC (as fallback or primary method)
    try {
      return await fetchSchemaCountFromChain(this.context);
    } catch (error) {
      throw new Error(
        `Failed to get schemas count: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Lists all schemas with pagination.
   *
   * @param options - Optional parameters for listing schemas
   * @param options.limit - Maximum number of schemas to return
   * @param options.offset - Number of schemas to skip
   * @param options.subgraphUrl - Custom subgraph URL to use instead of default
   * @param options.includeDefinitions - Whether to fetch and include schema definitions (default: false for performance)
   * @returns Promise resolving to an array of schemas
   * @example
   * ```typescript
   * // Get all schemas (without definitions for performance)
   * const schemas = await vana.schemas.list();
   *
   * // Get schemas with definitions
   * const schemas = await vana.schemas.list({ includeDefinitions: true });
   *
   * // Get schemas with pagination
   * const schemas = await vana.schemas.list({ limit: 10, offset: 0 });
   * ```
   */
  async list(
    options: {
      limit?: number;
      offset?: number;
      subgraphUrl?: string;
      includeDefinitions?: boolean;
      minBlock?: number;
      waitForSync?: number;
    } = {},
  ): Promise<Schema[]> {
    const {
      limit = 100,
      offset = 0,
      includeDefinitions = false,
      minBlock,
      waitForSync,
    } = options;
    const subgraphUrl = options.subgraphUrl ?? this.context.subgraphUrl;

    // Check consistency requirements if using subgraph
    if (subgraphUrl && (minBlock || waitForSync)) {
      const { checkSubgraphConsistency } = await import(
        "../utils/subgraphConsistency"
      );
      await checkSubgraphConsistency(subgraphUrl, { minBlock, waitForSync });
    }

    // Try subgraph first if available
    if (subgraphUrl) {
      try {
        return await this._listSchemasViaSubgraph({
          limit,
          offset,
          subgraphUrl,
        });
      } catch (error) {
        console.debug("Subgraph query failed, falling back to RPC:", error);
        // Fall through to RPC
      }
    }

    try {
      const totalCount = await this.count();
      const start = offset;
      const end = Math.min(start + limit, totalCount);

      if (end <= start) {
        return [];
      }

      // Get contract address and ABI
      const chainId =
        this.context.walletClient?.chain?.id ??
        this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }
      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      // Build multicall batch for fetching schemas
      const schemaCalls = [];
      for (let i = start; i < end; i++) {
        schemaCalls.push({
          address: dataRefinerRegistryAddress,
          abi: dataRefinerRegistryAbi,
          functionName: "schemas",
          args: [BigInt(i + 1)], // Schema IDs are 1-based
        } as const);
      }

      // Fetch all schemas in batches using gasAwareMulticall
      const schemaResults = await gasAwareMulticall<
        typeof schemaCalls,
        true // Allow failures for individual schema lookups
      >(this.context.publicClient, {
        contracts: schemaCalls,
        allowFailure: true,
      });

      // Process results
      const schemas: Schema[] = [];
      schemaResults.forEach((result, index) => {
        if (result.status === "success" && result.result) {
          const schemaId = start + index + 1; // Schema IDs are 1-based
          const schemaData = result.result as {
            name: string;
            dialect: string;
            definitionUrl: string;
          };

          if (
            schemaData.name &&
            schemaData.dialect &&
            schemaData.definitionUrl
          ) {
            schemas.push({
              id: schemaId,
              name: schemaData.name,
              dialect: schemaData.dialect as "json" | "sqlite",
              definitionUrl: schemaData.definitionUrl,
            });
          } else {
            console.warn(`Incomplete schema data for ID ${schemaId}`);
          }
        } else {
          // Skip schemas that can't be retrieved
          console.warn(`Failed to retrieve schema ${start + index + 1}`);
        }
      });

      // Optionally fetch definitions for all schemas
      if (includeDefinitions) {
        await this._fetchDefinitionsForSchemas(schemas);
      }

      return schemas;
    } catch (error) {
      throw new Error(
        `Failed to list schemas: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves schema definition content directly from a URL.
   *
   * @remarks
   * Use this method to fetch and format schema definitions from IPFS or HTTP URLs.
   * Automatically uses the SDK's configured download proxy to bypass CORS restrictions.
   * Returns formatted JSON string if content is valid JSON, otherwise raw content.
   *
   * @param url - The definition URL (typically from schema.definitionUrl)
   * @returns Promise resolving to the formatted definition content
   * @throws {Error} When the content cannot be fetched or network errors occur
   * @example
   * ```typescript
   * const schema = await vana.schemas.get(1);
   * const definition = await vana.schemas.retrieveDefinition(schema.definitionUrl);
   * console.log(definition); // Pretty-printed JSON
   * ```
   */
  async retrieveDefinition(url: string): Promise<string> {
    try {
      const { universalFetch } = await import("../utils/download");
      const response = await universalFetch(url, this.context.downloadRelayer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      // Try to parse and format as JSON for better readability
      try {
        const json = JSON.parse(text);
        return JSON.stringify(json, null, 2);
      } catch {
        // Not JSON, return as-is
        return text;
      }
    } catch (error) {
      throw new Error(
        `Failed to retrieve schema definition: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves refinement instruction content from a URL.
   *
   * @remarks
   * Use this method to fetch refinement instructions from IPFS or HTTP URLs.
   * Temporarily housed in SchemaController since refiners use schemas and we don't
   * have a dedicated RefinerController yet. Uses the SDK's configured download proxy.
   *
   * @param url - The instruction URL (typically from refiner.refinementInstructionUrl)
   * @returns Promise resolving to the formatted instruction content
   * @throws {Error} When the content cannot be fetched or network errors occur
   * @example
   * ```typescript
   * const instructions = await vana.schemas.retrieveRefinementInstructions(
   *   refiner.refinementInstructionUrl
   * );
   * console.log(instructions);
   * ```
   */
  async retrieveRefinementInstructions(url: string): Promise<string> {
    try {
      // Reuse the same logic as retrieveDefinition
      return await this.retrieveDefinition(url);
    } catch (error) {
      // Re-throw with more specific error message
      throw new Error(
        `Failed to retrieve refinement instructions: ${
          error instanceof Error
            ? error.message.replace(
                "Failed to retrieve schema definition: ",
                "",
              )
            : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Adds a schema using the legacy method (low-level API).
   *
   * @deprecated Use create() instead for the high-level API with automatic IPFS upload
   * @param params - Schema parameters including pre-generated definition URL
   * @returns Promise resolving to the add schema result
   */
  async addSchema(params: AddSchemaParams): Promise<SchemaAddedResult> {
    this.assertWallet();
    try {
      const chainId =
        this.context.walletClient?.chain?.id ??
        this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const account =
        this.context.walletClient.account ?? this.context.userAddress;
      const from = typeof account === "string" ? account : account?.address;

      const hash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "addSchema",
        args: [params.name, params.dialect, params.definitionUrl],
        account,
        chain: this.context.walletClient.chain ?? null,
      });

      // Create TransactionResult POJO
      const { tx } = await import("../utils/transactionHelpers");
      const txResult = tx({
        hash,
        from: from!,
        contract: "DataRefinerRegistry",
        fn: "addSchema",
      });

      // Wait for events and extract domain data
      if (!this.context.waitForTransactionEvents) {
        throw new Error("waitForTransactionEvents not configured");
      }

      const result = await this.context.waitForTransactionEvents(txResult);
      const event = result.expectedEvents.SchemaAdded;
      if (!event) {
        throw new Error("SchemaAdded event not found in transaction");
      }

      const receipt = await this.context.publicClient.getTransactionReceipt({
        hash,
      });

      return {
        transactionHash: hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        schemaId: event.schemaId,
        name: event.name,
        dialect: event.dialect,
        definitionUrl: event.definitionUrl,
      };
    } catch (error) {
      throw new Error(
        `Failed to add schema: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Internal method: Query schema via subgraph
   *
   * @param params - Query parameters
   * @param params.schemaId - The ID of the schema to retrieve
   * @param params.subgraphUrl - The subgraph URL to query
   * @returns Promise resolving to the schema object
   * @private
   */
  private async _getSchemaViaSubgraph(params: {
    schemaId: number;
    subgraphUrl: string;
  }): Promise<SchemaMetadata> {
    const { schemaId, subgraphUrl } = params;

    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: print(GetSchemaDocument),
        variables: { id: schemaId.toString() },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Subgraph request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      data?: GetSchemaQuery;
      errors?: { message: string }[];
    };

    if (result.errors) {
      throw new Error(
        `Subgraph query errors: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    if (!result.data?.schema) {
      throw new Error(`Schema ${schemaId} not found in subgraph`);
    }

    // Map subgraph schema to SDK schema type
    const subgraphSchema = result.data.schema;
    return {
      id: parseInt(subgraphSchema.id),
      name: subgraphSchema.name,
      dialect: subgraphSchema.dialect as "json" | "sqlite",
      definitionUrl: subgraphSchema.definitionUrl,
    };
  }

  /**
   * Internal method: List schemas via subgraph
   *
   * @param params - Query parameters
   * @param params.limit - Maximum number of schemas to return
   * @param params.offset - Number of schemas to skip
   * @param params.subgraphUrl - The subgraph URL to query
   * @returns Promise resolving to an array of schemas
   * @private
   */
  private async _listSchemasViaSubgraph(params: {
    limit: number;
    offset: number;
    subgraphUrl: string;
  }): Promise<Schema[]> {
    const { limit, offset, subgraphUrl } = params;

    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: print(ListSchemasDocument),
        variables: { first: limit, skip: offset },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Subgraph request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      data?: ListSchemasQuery;
      errors?: { message: string }[];
    };

    if (result.errors) {
      throw new Error(
        `Subgraph query errors: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    if (!result.data?.schemas) {
      return [];
    }

    // Map subgraph schemas to SDK schema type
    const schemas = result.data.schemas.map((schema) => ({
      id: parseInt(schema.id),
      name: schema.name,
      dialect: schema.dialect as "json" | "sqlite",
      definitionUrl: schema.definitionUrl,
    }));

    // Optionally fetch definitions if requested
    const { includeDefinitions } = params as { includeDefinitions?: boolean };
    if (includeDefinitions) {
      await this._fetchDefinitionsForSchemas(schemas);
    }

    return schemas;
  }

  /**
   * Internal method: Count schemas via subgraph
   *
   * @param params - Query parameters
   * @param params.subgraphUrl - The subgraph URL to query
   * @returns Promise resolving to the total schema count
   * @private
   */
  private async _countSchemasViaSubgraph(params: {
    subgraphUrl: string;
  }): Promise<number> {
    const { subgraphUrl } = params;

    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: print(CountSchemasDocument),
        variables: {},
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Subgraph request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      data?: CountSchemasQuery;
      errors?: { message: string }[];
    };

    if (result.errors) {
      throw new Error(
        `Subgraph query errors: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    return result.data?.schemas?.length ?? 0;
  }

  /**
   * Gets the user's wallet address.
   *
   * @private
   * @returns Promise resolving to the user's address
   */

  /**
   * Fetches and attaches definitions to an array of schemas.
   *
   * @param schemas - Array of schemas to fetch definitions for
   * @private
   */
  private async _fetchDefinitionsForSchemas(schemas: Schema[]): Promise<void> {
    // Fetch definitions concurrently for performance
    await Promise.all(
      schemas.map(async (schema) => {
        if (!schema.definitionUrl) return;

        try {
          const definition = await fetchFromUrl(
            schema.definitionUrl,
            this.context.downloadRelayer,
          );

          if (definition && typeof definition === "object") {
            // Validate the fetched DataSchema
            validateDataSchemaAgainstMetaSchema(definition);
            const dataSchema = definition as DataSchema;

            // Populate flat fields
            schema.version = dataSchema.version;
            schema.description = dataSchema.description;
            schema.schema = dataSchema.schema;
          }
        } catch (error) {
          // Don't fail the entire list operation if one definition fails
          console.error(
            `Failed to fetch/validate definition for schema ${schema.id}:`,
            error instanceof UrlResolutionError ||
              error instanceof SchemaValidationError
              ? error.message
              : error,
          );
        }
      }),
    );
  }
}
