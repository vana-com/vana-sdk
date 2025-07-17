import { Address, getContract, decodeEventLog } from "viem";
import { Schema, AddSchemaParams, AddSchemaResult } from "../types/index";
import { ControllerContext } from "./permissions";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import {
  validateDataSchema,
  SchemaValidationError,
  type DataSchema,
} from "../utils/schemaValidation";

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
  /** The type/category of the schema */
  type: string;
  /** The schema definition object or JSON string */
  definition: object | string;
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
  schemaId: number;
  /** The IPFS URL where the schema definition is stored */
  definitionUrl: string;
  /** The transaction hash of the schema registration */
  transactionHash: string;
}

/**
 * Manages data schemas and refiners on the Vana network.
 *
 * @remarks
 * This controller handles the complete lifecycle of data schemas including creation,
 * validation, IPFS upload, and blockchain registration. It provides methods for managing
 * both schemas (data structure definitions) and refiners (data processing definitions).
 *
 * Schemas are public protocol entities that define data structures and validation rules.
 * Unlike private user data, schemas are stored unencrypted on IPFS to enable public
 * access and reusability across the network.
 *
 * @example
 * ```typescript
 * // Create a new schema with automatic IPFS upload
 * const result = await vana.schemas.create({
 *   name: "User Profile",
 *   type: "personal",
 *   definition: {
 *     type: "object",
 *     properties: {
 *       name: { type: "string" },
 *       age: { type: "number" }
 *     },
 *     required: ["name"]
 *   }
 * });
 *
 * // Get an existing schema
 * const schema = await vana.schemas.get(1);
 *
 * // List all schemas
 * const count = await vana.schemas.count();
 * ```
 * @category Schema Management
 */
export class SchemaController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Creates a new schema with automatic validation and IPFS upload.
   *
   * @remarks
   * This is the primary method for creating schemas on the Vana network. It handles
   * the complete workflow including schema validation, IPFS upload, and blockchain
   * registration. The schema definition is stored unencrypted on IPFS to enable
   * public access and reusability.
   *
   * The method automatically:
   * - Validates the schema definition against the Vana metaschema
   * - Uploads the definition to IPFS to generate a permanent URL
   * - Registers the schema on the blockchain with the generated URL
   *
   * @param params - Schema creation parameters including name, type, and definition
   * @returns Promise resolving to creation results with schema ID and transaction hash
   * @throws {SchemaValidationError} When the schema definition is invalid
   * @throws {Error} When IPFS upload or blockchain registration fails
   * @example
   * ```typescript
   * // Create a JSON schema for user profiles
   * const result = await vana.schemas.create({
   *   name: "User Profile",
   *   type: "personal",
   *   definition: {
   *     type: "object",
   *     properties: {
   *       name: { type: "string" },
   *       age: { type: "number", minimum: 0 }
   *     },
   *     required: ["name"]
   *   }
   * });
   *
   * console.log(`Schema created with ID: ${result.schemaId}`);
   * ```
   */
  async create(params: CreateSchemaParams): Promise<CreateSchemaResult> {
    const { name, type, definition } = params;

    try {
      // Step 1: Normalize and validate the schema definition
      let schemaDefinition: object;
      if (typeof definition === "string") {
        try {
          schemaDefinition = JSON.parse(definition);
        } catch {
          throw new SchemaValidationError(
            "Invalid JSON in schema definition",
            [],
          );
        }
      } else {
        schemaDefinition = definition;
      }

      // Step 2: Validate against metaschema
      const dataSchema: DataSchema = {
        name,
        version: "1.0.0",
        dialect: "json",
        schema: schemaDefinition,
      };

      validateDataSchema(dataSchema);

      // Step 3: Upload to IPFS (unencrypted for public access)
      if (!this.context.storageManager) {
        throw new Error(
          "Storage manager not configured. Please provide storage providers in VanaConfig.",
        );
      }

      const schemaBlob = new Blob([JSON.stringify(schemaDefinition)], {
        type: "application/json",
      });

      const uploadResult = await this.context.storageManager.upload(
        schemaBlob,
        `${name.replace(/[^a-zA-Z0-9]/g, "_")}.json`,
        "ipfs", // Use IPFS for public schema storage
      );

      // Step 4: Register on blockchain
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const userAddress = await this.getUserAddress();

      const txHash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "addSchema",
        args: [name, type, uploadResult.url],
        account: this.context.walletClient.account || userAddress,
        chain: this.context.walletClient.chain || null,
      });

      // Wait for transaction receipt to parse the SchemaAdded event
      const receipt = await this.context.publicClient.waitForTransactionReceipt(
        {
          hash: txHash,
          timeout: 30_000, // 30 seconds timeout
        },
      );

      // Parse the SchemaAdded event to get the actual schemaId
      let schemaId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: dataRefinerRegistryAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "SchemaAdded") {
            schemaId = Number(decoded.args.schemaId);
            break;
          }
        } catch {
          // Skip logs that can't be decoded
        }
      }

      return {
        schemaId,
        definitionUrl: uploadResult.url,
        transactionHash: txHash,
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
   * Retrieves a schema by its ID.
   *
   * @param schemaId - The ID of the schema to retrieve
   * @returns Promise resolving to the schema object
   * @throws {Error} When the schema is not found or chain is unavailable
   * @example
   * ```typescript
   * const schema = await vana.schemas.get(1);
   * console.log(`Schema: ${schema.name} (${schema.type})`);
   * ```
   */
  async get(schemaId: number): Promise<Schema> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const dataRefinerRegistry = getContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        client: this.context.publicClient,
      });

      const schemaData = await dataRefinerRegistry.read.schemas([
        BigInt(schemaId),
      ]);

      if (
        !schemaData ||
        !Array.isArray(schemaData) ||
        schemaData.length === 0
      ) {
        throw new Error(`Schema with ID ${schemaId} not found`);
      }

      const [name, schemaType, definitionUrl] = schemaData as unknown as [
        string,
        string,
        string,
      ];

      return {
        id: schemaId,
        name,
        type: schemaType,
        definitionUrl,
      };
    } catch (error) {
      throw new Error(
        `Failed to get schema: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets the total number of schemas registered on the network.
   *
   * @returns Promise resolving to the total schema count
   * @throws {Error} When the count cannot be retrieved
   * @example
   * ```typescript
   * const count = await vana.schemas.count();
   * console.log(`Total schemas: ${count}`);
   * ```
   */
  async count(): Promise<number> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const dataRefinerRegistry = getContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        client: this.context.publicClient,
      });

      const count = await dataRefinerRegistry.read.schemasCount();
      return Number(count);
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
   * @returns Promise resolving to an array of schemas
   * @example
   * ```typescript
   * // Get all schemas
   * const schemas = await vana.schemas.list();
   *
   * // Get schemas with pagination
   * const schemas = await vana.schemas.list({ limit: 10, offset: 0 });
   * ```
   */
  async list(
    options: { limit?: number; offset?: number } = {},
  ): Promise<Schema[]> {
    const { limit = 100, offset = 0 } = options;

    try {
      const totalCount = await this.count();
      const schemas: Schema[] = [];

      const start = offset;
      const end = Math.min(start + limit, totalCount);

      for (let i = start; i < end; i++) {
        try {
          const schema = await this.get(i + 1); // Schema IDs are 1-based
          schemas.push(schema);
        } catch (error) {
          // Skip schemas that can't be retrieved
          console.warn(`Failed to retrieve schema ${i + 1}:`, error);
        }
      }

      return schemas;
    } catch (error) {
      throw new Error(
        `Failed to list schemas: ${error instanceof Error ? error.message : "Unknown error"}`,
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
  async addSchema(params: AddSchemaParams): Promise<AddSchemaResult> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const userAddress = await this.getUserAddress();

      const txHash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "addSchema",
        args: [params.name, params.type, params.definitionUrl],
        account: this.context.walletClient.account || userAddress,
        chain: this.context.walletClient.chain || null,
      });

      return {
        schemaId: 0, // TODO: Parse from transaction receipt
        transactionHash: txHash,
      };
    } catch (error) {
      throw new Error(
        `Failed to add schema: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets the user's wallet address.
   *
   * @private
   * @returns Promise resolving to the user's address
   */
  private async getUserAddress(): Promise<Address> {
    if (!this.context.walletClient.account) {
      throw new Error("No wallet account connected");
    }

    // Return the account address directly if available
    if (typeof this.context.walletClient.account === "string") {
      return this.context.walletClient.account as Address;
    }

    // If account is an object, get the address property
    if (
      typeof this.context.walletClient.account === "object" &&
      this.context.walletClient.account.address
    ) {
      return this.context.walletClient.account.address;
    }

    throw new Error("Unable to determine wallet address");
  }
}
