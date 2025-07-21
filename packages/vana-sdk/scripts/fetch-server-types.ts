#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import openapiTS, { astToString } from "openapi-typescript";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

// Configuration for the personal server OpenAPI spec
const OPENAPI_CONFIG = {
  url: "https://raw.githubusercontent.com/vana-com/vana-personal-server/main/openapi.yaml",
  outputPath: "src/types/server.ts",
  exportsPath: "src/types/server-exports.ts",
} as const;

/**
 * Generates TypeScript types from the OpenAPI specification
 *
 * @returns Promise resolving to the generated TypeScript definitions
 */
async function generateTypes(): Promise<string> {
  try {
    console.log(`🔄 Generating TypeScript types from OpenAPI spec...`);

    // Generate AST using openapi-typescript directly from URL
    const ast = await openapiTS(new URL(OPENAPI_CONFIG.url), {
      // TODO: Re-enable pathParamsAsTypes when vana-personal-server fixes
      // the conflicting /operations/cancel vs /operations/{id} paths
      // See: https://github.com/vana-com/vana-personal-server/issues/XXX
      pathParamsAsTypes: false,
      // Transform comments to be TypeDoc compatible
      transform: {
        schema: {
          comment: (comment: string) => {
            // Replace @description with standard JSDoc comment
            return comment.replace(/@description\s+/g, "");
          },
        },
      },
    });

    // Convert AST to string
    const types = astToString(ast);

    console.log(`✅ Successfully generated TypeScript types`);
    return types;
  } catch (error) {
    console.error(`❌ Failed to generate types:`, error);
    throw error;
  }
}

/**
 * Generates the final TypeScript file with proper header comments
 *
 * @param types - The generated TypeScript types
 * @returns The final file content with headers
 */
function generateTypesFile(types: string): string {
  const header = `// Vana Personal Server API Types
// Generated automatically from OpenAPI specification - do not edit manually
// Source: ${OPENAPI_CONFIG.url}
// Generated on: ${new Date().toISOString()}

`;

  return header + types;
}

/**
 * Ensures a directory exists, creating it if necessary
 *
 * @param dirPath - The path to the directory to ensure exists
 * @returns Promise that resolves when directory exists
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await access(dirPath);
  } catch {
    await mkdir(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

/**
 * Generates a simple re-export of all types from the server types file
 *
 * @returns String containing the server type exports
 */
function generateServerTypeExports(): string {
  return `// Server API types (auto-generated from OpenAPI spec)
// This file re-exports all types from the generated server types
// DO NOT EDIT - regenerated automatically by fetch-server-types.ts

// Re-export all types with original names
export * from "./server";

// Namespace all server types for clearer usage
export type {
  paths as ServerPaths,
  webhooks as ServerWebhooks,
  components as ServerComponents,
  operations as ServerOperations,
  $defs as ServerDefs,
} from "./server";

// Common server schema type aliases for easier usage
import type { components } from "./server";

// Operation types
export type CreateOperationRequest = components["schemas"]["CreateOperationRequest"];
export type CreateOperationResponse = components["schemas"]["CreateOperationResponse"];
export type GetOperationResponse = components["schemas"]["GetOperationResponse"];

// Identity types
export type IdentityResponseModel = components["schemas"]["IdentityResponseModel"];
export type PersonalServerModel = components["schemas"]["PersonalServerModel"];

// Error types
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type ValidationErrorResponse = components["schemas"]["ValidationErrorResponse"];
export type AuthenticationErrorResponse = components["schemas"]["AuthenticationErrorResponse"];
export type NotFoundErrorResponse = components["schemas"]["NotFoundErrorResponse"];
export type BlockchainErrorResponse = components["schemas"]["BlockchainErrorResponse"];
export type FileAccessErrorResponse = components["schemas"]["FileAccessErrorResponse"];
export type ComputeErrorResponse = components["schemas"]["ComputeErrorResponse"];
export type DecryptionErrorResponse = components["schemas"]["DecryptionErrorResponse"];
export type GrantValidationErrorResponse = components["schemas"]["GrantValidationErrorResponse"];
export type OperationErrorResponse = components["schemas"]["OperationErrorResponse"];
export type InternalServerErrorResponse = components["schemas"]["InternalServerErrorResponse"];
`;
}

/**
 * Generates a dedicated server exports file
 *
 * @returns Promise that resolves when exports file is created
 */
async function generateServerExportsFile(): Promise<void> {
  const exportsPath = path.join(process.cwd(), OPENAPI_CONFIG.exportsPath);

  try {
    // Generate the server exports file content (generic re-export)
    const serverExports = generateServerTypeExports();

    // Write the exports file
    await writeFile(exportsPath, serverExports);
    console.log(
      `✅ Generated server exports file: ${OPENAPI_CONFIG.exportsPath}`,
    );
  } catch (error) {
    console.error(
      `⚠️  Warning: Failed to generate server exports file:`,
      error,
    );
    throw error;
  }
}

/**
 * Main function to generate TypeScript types from OpenAPI spec
 *
 * @returns Promise that resolves when types are generated and saved
 */
async function fetchAndGenerateServerTypes(): Promise<void> {
  try {
    const typesDir = path.join(process.cwd(), "src", "types");
    const outputPath = path.join(process.cwd(), OPENAPI_CONFIG.outputPath);

    // Ensure output directory exists
    await ensureDirectoryExists(typesDir);

    // Generate TypeScript types directly from URL
    const types = await generateTypes();

    // Generate final file content with headers
    const fileContent = generateTypesFile(types);

    // Write the generated types to file
    await writeFile(outputPath, fileContent);
    console.log(`✅ Saved server types to ${OPENAPI_CONFIG.outputPath}`);

    // Generate server exports file
    await generateServerExportsFile();

    console.log(`🎉 Successfully generated Vana Personal Server types!`);
  } catch (error) {
    console.error(`❌ Failed to generate server types:`, error);
    throw error;
  }
}

/**
 * Main entry point for the server types fetching script
 *
 * @returns Promise that resolves when script execution completes
 */
async function main(): Promise<void> {
  try {
    await fetchAndGenerateServerTypes();
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }
}

// Run the script
main();
