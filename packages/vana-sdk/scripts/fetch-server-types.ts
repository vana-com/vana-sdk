#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import openapiTS, { astToString } from "openapi-typescript";
import {
  mokshaServices,
  mainnetServices,
} from "../src/config/default-services.js";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

/**
 * Get OpenAPI configuration for a specific network
 * @param network - Network to fetch server types for (moksha or mainnet)
 */
function getOpenAPIConfig(network: "moksha" | "mainnet" = "mainnet") {
  const services = network === "moksha" ? mokshaServices : mainnetServices;
  return {
    url:
      services.personalServerUrl.replace(/\/api\/v1\/?$/, "") + "/openapi.json",
    outputPath: "src/generated/server/server.ts",
    exportsPath: "src/generated/server/server-exports.ts",
    network,
  } as const;
}

/**
 * Generates TypeScript types from the OpenAPI specification
 *
 * @param config - OpenAPI configuration
 * @returns Promise resolving to the generated TypeScript definitions
 */
async function generateTypes(
  config: ReturnType<typeof getOpenAPIConfig>,
): Promise<string> {
  try {
    console.log(`🔄 Generating TypeScript types from: ${config.url}`);

    // Generate AST using openapi-typescript directly from URL
    const ast = await openapiTS(new URL(config.url), {
      // TODO: Re-enable pathParamsAsTypes when vana-personal-server fixes
      // the conflicting /operations/cancel vs /operations/{id} paths
      // See: https://github.com/vana-com/vana-personal-server/issues/XXX
      pathParamsAsTypes: false,
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
 * @param config - OpenAPI configuration
 * @returns The final file content with headers
 */
function generateTypesFile(
  types: string,
  config: ReturnType<typeof getOpenAPIConfig>,
): string {
  const header = `// Vana Personal Server API Types
// Generated automatically from OpenAPI specification - do not edit manually
// Network: ${config.network}
// Source: ${config.url}
// Generated on: ${new Date().toISOString()}

`;

  // Note: We intentionally preserve @description tags from openapi-typescript
  // to maintain OpenAPI fidelity. TypeDoc is configured to accept them.
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
 * Fetches the OpenAPI spec JSON to extract paths
 *
 * @param url - URL to the OpenAPI JSON spec
 * @returns The OpenAPI spec object
 */
async function fetchOpenAPISpec(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Converts snake_case to camelCase
 *
 * @param str - String in snake_case format
 * @returns String in camelCase format
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Extracts path information from OpenAPI spec and generates SERVER_PATHS code
 *
 * @param spec - The OpenAPI specification object
 * @returns Generated TypeScript code for SERVER_PATHS constant
 */
function generateServerPaths(spec: any): string {
  const paths = spec.paths ?? {};
  const pathEntries: string[] = [];

  for (const [path, pathConfig] of Object.entries(paths)) {
    // Get the operation info from the first HTTP method
    const methods = pathConfig as Record<string, any>;
    const firstMethod = Object.values(methods)[0] as any;

    // Use operationId from spec, converted to camelCase
    const operationId = firstMethod?.operationId;
    if (!operationId) {
      console.warn(`⚠️  No operationId for path: ${path} - skipping`);
      continue;
    }

    const camelCaseName = snakeToCamel(operationId);
    const description = firstMethod?.summary ?? firstMethod?.description ?? "";

    // Check if path has parameters
    const paramMatches = path.match(/\{([^}]+)\}/g);

    if (paramMatches) {
      // Extract parameter names
      const params = paramMatches.map((p) => p.slice(1, -1));
      const paramTypes = params.map((p) => `${p}: string`).join(", ");

      // Generate function that returns the path
      const pathTemplate = path.replace(/\{([^}]+)\}/g, "${$1}");
      pathEntries.push(
        `  /** ${description} */\n  ${camelCaseName}: (${paramTypes}) => \`${pathTemplate}\`,`,
      );
    } else {
      // Simple string constant
      pathEntries.push(
        `  /** ${description} */\n  ${camelCaseName}: "${path}",`,
      );
    }
  }

  return `/**
 * Personal Server API endpoint paths.
 *
 * @remarks
 * These paths are extracted from the OpenAPI spec to ensure consistency
 * between the SDK and the server implementation. All paths are relative
 * to the personal server base URL.
 *
 * @category Server
 */
export const SERVER_PATHS = {
${pathEntries.join("\n")}
} as const;`;
}

/**
 * Generates a complete server exports file with paths and type re-exports
 *
 * @param spec - The OpenAPI specification object
 * @returns String containing the complete server type exports
 */
function generateServerTypeExports(spec: any): string {
  const serverPaths = generateServerPaths(spec);

  // Extract all schemas from the spec
  const schemas = spec.components?.schemas ?? {};
  const schemaNames = Object.keys(schemas);

  // Generate type aliases for all schemas
  const typeAliases = schemaNames
    .map(
      (schemaName) =>
        `export type ${schemaName} = components["schemas"]["${schemaName}"];`,
    )
    .join("\n");

  return `// Server API types (auto-generated from OpenAPI spec)
// This file re-exports all types from the generated server types
// DO NOT EDIT - regenerated automatically by fetch-server-types.ts

// Re-export all types with original names
export * from "./server";

${serverPaths}

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

// Auto-generated type aliases for all schemas
${typeAliases}
`;
}

/**
 * Generates a dedicated server exports file
 *
 * @param config - OpenAPI configuration
 * @returns Promise that resolves when exports file is created
 */
async function generateServerExportsFile(
  config: ReturnType<typeof getOpenAPIConfig>,
): Promise<void> {
  const exportsPath = path.join(process.cwd(), config.exportsPath);

  try {
    // Fetch the OpenAPI spec to extract paths
    console.log(`🔄 Fetching OpenAPI spec for path extraction...`);
    const spec = await fetchOpenAPISpec(config.url);

    // Generate the server exports file content with extracted paths
    const serverExports = generateServerTypeExports(spec);

    // Write the exports file
    await writeFile(exportsPath, serverExports);
    console.log(`✅ Generated server exports file: ${config.exportsPath}`);
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
 * @param network - Network to fetch server types for
 * @returns Promise that resolves when types are generated and saved
 */
async function fetchAndGenerateServerTypes(
  network: "moksha" | "mainnet" = "mainnet",
): Promise<void> {
  try {
    const config = getOpenAPIConfig(network);
    const serverDir = path.join(process.cwd(), "src", "generated", "server");
    const outputPath = path.join(process.cwd(), config.outputPath);

    console.log(`🔄 Fetching server types for ${network}...`);

    // Ensure output directory exists
    await ensureDirectoryExists(serverDir);

    // Generate TypeScript types directly from URL
    const types = await generateTypes(config);

    // Generate final file content with headers
    const fileContent = generateTypesFile(types, config);

    // Write the generated types to file
    await writeFile(outputPath, fileContent);
    console.log(`✅ Saved server types to ${config.outputPath}`);

    // Generate server exports file
    await generateServerExportsFile(config);

    console.log(
      `🎉 Successfully generated Vana Personal Server types for ${network}!`,
    );
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
  const network = (process.argv[2] as "moksha" | "mainnet") || "mainnet";

  if (!["moksha", "mainnet"].includes(network)) {
    console.error("Usage: npm run fetch-server-types [moksha|mainnet]");
    console.error("Defaults to mainnet if not specified");
    process.exit(1);
  }

  try {
    await fetchAndGenerateServerTypes(network);
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }
}

// Run the script
void main();
