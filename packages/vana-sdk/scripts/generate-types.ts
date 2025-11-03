#!/usr/bin/env node
/**
 * Generate TypeScript types from contract-event-mappings.json
 *
 * This script generates pure TypeScript types for compile-time type safety
 * and a runtime registry for event decoding. No JSON imports in generated types.
 *
 * Uses explicit metadata with abiModule and abiExport for each contract.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { keccak256 } from "viem";
import prettier from "prettier";
import Ajv from "ajv";

// Import all ABIs statically at build time
import * as allAbis from "../src/generated/abi/index";

// Get dirname equivalent in ES modules
const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = dirname(currentFilename);

// Paths
const PROJECT_ROOT = join(currentDirname, "..");
const SRC_DIR = join(PROJECT_ROOT, "src");
const GENERATED_DIR = join(SRC_DIR, "generated");
const MAPPINGS_PATH = join(currentDirname, "contract-event-mappings.json");
const EVENT_TYPES_PATH = join(GENERATED_DIR, "event-types.ts");
const EVENT_REGISTRY_PATH = join(GENERATED_DIR, "eventRegistry.ts");

// JSON Schema for validation
const MAPPING_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["contracts"],
  properties: {
    contracts: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["abiExport", "functions"],
        properties: {
          abiExport: {
            type: "string",
            pattern: "ABI$",
          },
          functions: {
            type: "object",
            additionalProperties: {
              oneOf: [
                { type: "string" },
                {
                  type: "array",
                  items: { type: "string" },
                  minItems: 0,
                },
              ],
            },
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

// Type definitions
interface EventMapping {
  contracts: {
    [contract: string]: {
      abiExport: string;
      functions: {
        [fn: string]: string | string[];
      };
    };
  };
}

interface EventABI {
  name: string;
  type: "event";
  inputs: Array<{
    name: string;
    type: string;
    indexed?: boolean;
    internalType?: string;
  }>;
}

/**
 * Load and validate mappings
 *
 * @returns The loaded mappings
 */
function loadMappings(): EventMapping {
  const content = readFileSync(MAPPINGS_PATH, "utf-8");
  const mappings = JSON.parse(content);

  // Validate against schema
  const ajv = new Ajv();
  const validate = ajv.compile(MAPPING_SCHEMA);

  if (!validate(mappings)) {
    const errors = validate.errors
      ?.map((e) => `  ${e.instancePath}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid mapping schema:\n${errors}`);
  }

  return mappings as unknown as EventMapping;
}

/**
 * Load ABI for a specific contract
 *
 * @param abiExport - The ABI export name
 * @returns The contract ABI events
 */
function loadContractABI(abiExport: string): EventABI[] {
  // All ABIs are statically imported at build time
  const abiRecord = allAbis as Record<string, unknown>;
  if (!(abiExport in abiRecord)) {
    throw new Error(`Export ${abiExport} not found in ABIs`);
  }

  const abi = abiRecord[abiExport] as unknown[];
  const events = abi.filter(
    (item): item is EventABI =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "event" &&
      "name" in item &&
      !!item.name,
  );

  return events;
}

/**
 * Convert Solidity type to TypeScript type
 *
 * @param type - The Solidity type
 * @returns The TypeScript type
 */
function solidityToTypeScript(type: string): string {
  // uint*, int* -> bigint
  if (type.match(/^u?int\d*$/)) return "bigint";

  // address -> 0x-prefixed string
  if (type === "address") return "`0x${string}`";

  // bytes32, bytes -> 0x-prefixed string
  if (type.match(/^bytes\d*$/)) return "`0x${string}`";

  // bool -> boolean
  if (type === "bool") return "boolean";

  // string -> string
  if (type === "string") return "string";

  // arrays
  if (type.endsWith("[]")) {
    const baseType = type.slice(0, -2);
    return `readonly ${solidityToTypeScript(baseType)}[]`;
  }

  // fixed arrays
  const fixedArrayMatch = type.match(/^(.+)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    const [, baseType, size] = fixedArrayMatch;
    return `readonly [${Array(parseInt(size)).fill(solidityToTypeScript(baseType)).join(", ")}]`;
  }

  // fallback
  return "unknown";
}

/**
 * Generate EventArgs interfaces from contract event mappings
 *
 * @param mappings - The event mappings configuration
 * @returns TypeScript interface definitions for event arguments
 */
async function generateEventArgs(mappings: EventMapping): Promise<string> {
  const eventArgsMap = new Map<string, string>();

  for (const [contractName, contract] of Object.entries(mappings.contracts)) {
    try {
      const events = loadContractABI(contract.abiExport);

      for (const event of events) {
        if (eventArgsMap.has(event.name)) continue;

        const fields = event.inputs
          .map((input) => {
            const tsType = solidityToTypeScript(input.type);
            const name = input.name || `arg${event.inputs.indexOf(input)}`;
            return `  ${name}: ${tsType};`;
          })
          .join("\n");

        eventArgsMap.set(event.name, fields);
      }
    } catch (error) {
      console.warn(
        `Warning: Could not load ABI for ${contractName}: ${String(error)}`,
      );
    }
  }

  // Sort for deterministic output
  const sortedEvents = Array.from(eventArgsMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const interfaces = sortedEvents
    .map(([name, fields]) => `  ${name}: {\n${fields}\n  };`)
    .join("\n");

  return `export interface EventArgs {\n${interfaces}\n}`;
}

/**
 * Generate flat EventNameMap type from contract mappings
 *
 * @param mappings - The event mappings configuration
 * @returns TypeScript type definition for event name map
 */
function generateEventNameMap(mappings: EventMapping): string {
  const entries: string[] = [];

  // Sort contracts for deterministic output
  const sortedContracts = Object.keys(mappings.contracts).sort();

  for (const contract of sortedContracts) {
    const { functions } = mappings.contracts[contract];
    const sortedFunctions = Object.keys(functions).sort();

    for (const fn of sortedFunctions) {
      const events = functions[fn];
      const key = `"${contract}.${fn}"`;

      if (events.length === 0) {
        // No events for this function
        entries.push(`  ${key}: never;`);
      } else if (typeof events === "string") {
        entries.push(`  ${key}: "${events}";`);
      } else if (Array.isArray(events) && events.length === 1) {
        entries.push(`  ${key}: "${events[0]}";`);
      } else if (Array.isArray(events)) {
        const eventUnion = events.map((e) => `"${e}"`).join(" | ");
        entries.push(`  ${key}: ${eventUnion};`);
      }
    }
  }

  return `export type EventNameMap = {\n${entries.join("\n")}\n};`;
}

/**
 * Calculate SHA256 hash for content versioning
 *
 * @param content - The content to hash
 * @returns First 8 characters of the hex hash
 */
function calculateHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

/**
 * Generate TypeScript type definitions for contract events
 *
 * @param mappings - The event mappings configuration
 * @returns Complete TypeScript file content for event types
 */
async function generateEventTypes(mappings: EventMapping): Promise<string> {
  const mappingsHash = calculateHash(JSON.stringify(mappings));

  // Extract all contract names
  const contracts = Object.keys(mappings.contracts).sort();
  const contractUnion = contracts.map((c) => `"${c}"`).join(" | ");

  // Generate function unions per contract
  const fnUnions: string[] = [];
  for (const contract of contracts) {
    const fns = Object.keys(mappings.contracts[contract].functions).sort();
    const fnUnion = fns.map((f) => `"${f}"`).join(" | ");
    fnUnions.push(`  C extends "${contract}" ? ${fnUnion} :`);
  }
  fnUnions.push("  never");

  const eventArgs = await generateEventArgs(mappings);
  const eventNameMap = generateEventNameMap(mappings);

  const content = `/**
 * Generated TypeScript types for contract events
 *
 * @mappings-hash ${mappingsHash}
 *
 * DO NOT EDIT - This file is generated by scripts/generate-types.ts
 */

// Contract names union
export type Contract = ${contractUnion};

// Function names per contract
export type Fn<C extends Contract> =
${fnUnions.join("\n")};

// Helper for joining contract and function names
export type Join<C extends string, F extends string> = \`\${C}.\${F}\`;

// Flat mapping of "Contract.function" to event names
${eventNameMap}

// Event argument types
${eventArgs}

// Safe map lookup (no error if key not present)
type Lookup<M, K extends PropertyKey> = K extends keyof M ? M[K] : never;

// Get expected event names for a contract function
export type ExpectedEventNames<
  C extends Contract,
  F extends Fn<C>
> = Lookup<EventNameMap, Extract<Join<C & string, F & string>, keyof EventNameMap>>;

// Get expected events object with proper types
export type ExpectedEvents<
  C extends Contract,
  F extends Fn<C>
> = [ExpectedEventNames<C, F>] extends [never]
  ? {}
  : {
      [K in ExpectedEventNames<C, F>]?: K extends keyof EventArgs
        ? EventArgs[K]
        : Record<string, unknown>;
    };

// Transaction result with typed events
export type TypedTransactionResult<C extends Contract, F extends Fn<C>> = {
  hash: \`0x\${string}\`;
  from?: \`0x\${string}\`;
  contract: C;
  fn: F;
  expectedEvents: ExpectedEvents<C, F>;
  allEvents: Array<{
    contractAddress: string;
    eventName: string;
    args: Record<string, unknown>;
    logIndex: number;
  }>;
  hasExpectedEvents: boolean;
};
`;

  // Format with prettier using project config
  const prettierConfig = await prettier.resolveConfig(EVENT_TYPES_PATH);
  const formatted = await prettier.format(content, {
    ...prettierConfig,
    parser: "typescript",
  });

  return formatted;
}

/**
 * Generate runtime event registry for transaction parsing
 *
 * @param mappings - The event mappings configuration
 * @returns Complete TypeScript file content for event registry
 */
async function generateEventRegistry(mappings: EventMapping): Promise<string> {
  const mappingsHash = calculateHash(JSON.stringify(mappings));
  const registryEntries: string[] = [];

  // First pass: collect all event ABIs and group by topic
  const topicData: Record<string, { seen: Set<string>; abis: EventABI[] }> = {};

  for (const [contract, contractDef] of Object.entries(mappings.contracts)) {
    try {
      const contractEvents = loadContractABI(contractDef.abiExport);

      for (const event of contractEvents) {
        const signature = `${event.name}(${event.inputs.map((i) => i.type).join(",")})`;
        // Hash the UTF-8 bytes of the signature string
        const encoder = new TextEncoder();
        const bytes = encoder.encode(signature);
        const hash = keccak256(bytes);

        // Deterministic deduplication key
        const indexedMask = event.inputs
          .map((i) => (i.indexed ? "1" : "0"))
          .join("");
        const dedupeKey = `${signature}|${indexedMask}`;

        // Group by topic with Set-based deduping (cleaner than array.some)
        const entry =
          topicData[hash] ?? (topicData[hash] = { seen: new Set(), abis: [] });
        if (!entry.seen.has(dedupeKey)) {
          entry.seen.add(dedupeKey);
          entry.abis.push(event);
        }
      }
    } catch (error) {
      console.warn(
        `Warning: Could not load events for ${contract}: ${String(error)}`,
      );
    }
  }

  // Convert to the structure we need
  const byTopic: Record<string, EventABI[]> = {};
  for (const [topic, data] of Object.entries(topicData)) {
    byTopic[topic] = data.abis;
  }

  // Second pass: create function-specific entries
  const sortedContracts = Object.keys(mappings.contracts).sort();

  for (const contract of sortedContracts) {
    const contractDef = mappings.contracts[contract];
    const sortedFunctions = Object.keys(contractDef.functions).sort();

    for (const fn of sortedFunctions) {
      const events = contractDef.functions[fn];
      const eventList = typeof events === "string" ? [events] : events;
      const key = `${contract}.${fn}`;

      registryEntries.push(`  "${key}": {
    contract: "${contract}",
    fn: "${fn}",
    eventNames: [${eventList.map((e) => `"${e}"`).join(", ")}] as const
  }`);
    }
  }

  // Sort topics for deterministic output
  const sortedTopics = Object.keys(byTopic).sort();

  // Build topic map entries with proper grouping
  const topicMapEntries = sortedTopics
    .map((topic) => {
      const abis = byTopic[topic]
        .sort((a, b) => a.name.localeCompare(b.name)) // Deterministic sort
        .map((abi) => JSON.stringify(abi));
      return `  ['${topic}' as \`0x\${string}\`, [${abis.join(", ")}] as const]`;
    })
    .join(",\n");

  const content = `/**
 * Runtime event registry for decoding
 *
 * @mappings-hash ${mappingsHash}
 *
 * DO NOT EDIT - This file is generated by scripts/generate-types.ts
 */

import type { AbiEvent } from 'viem';

// Function-specific expected events registry
export const EVENT_REGISTRY: Record<string, {
  contract: string;
  fn: string;
  eventNames: readonly string[];
}> = {
${registryEntries.join(",\n")}
} as const;

// O(1) candidate retrieval: topic -> one or more ABI variants
// Properly handles collisions where multiple events have same signature
// Use TOPIC_TO_ABIS.has(topic) for O(1) filtering - no need for separate Set
export const TOPIC_TO_ABIS = /*#__PURE__*/ new Map<\`0x\${string}\`, readonly AbiEvent[]>([
${topicMapEntries}
] as const);
`;

  // Format with prettier using project config
  const prettierConfig = await prettier.resolveConfig(EVENT_REGISTRY_PATH);
  const formatted = await prettier.format(content, {
    ...prettierConfig,
    parser: "typescript",
  });

  return formatted;
}

/**
 * Validate that all mapped events exist in ABIs
 *
 * @param mappings - The event mappings to validate
 */
async function validateMappings(mappings: EventMapping): Promise<void> {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [contract, contractDef] of Object.entries(mappings.contracts)) {
    try {
      const contractEvents = loadContractABI(contractDef.abiExport);
      const eventNames = new Set(contractEvents.map((e) => e.name));

      for (const [fn, events] of Object.entries(contractDef.functions)) {
        const eventList = typeof events === "string" ? [events] : events;

        for (const eventName of eventList) {
          if (!eventNames.has(eventName)) {
            const msg = `Event ${eventName} not found in ${contract} ABI (function: ${fn})`;
            warnings.push(msg);
            console.warn(`Warning: ${msg}`);
          }
        }
      }
    } catch (error) {
      errors.push(`Failed to load ${contract}: ${String(error)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Validation errors:\n${errors.join("\n")}`);
  }

  // Strict mode for CI: treat warnings as errors
  if (process.env.STRICT_EVENT_MAP && warnings.length > 0) {
    throw new Error(
      `Mapping drift detected (STRICT_EVENT_MAP=1):\n${warnings.join("\n")}`,
    );
  }
}

/**
 * Main generator
 *
 * @param checkMode - Whether to run in check mode
 * @returns Success status
 */
async function generate(checkMode = false): Promise<boolean> {
  try {
    console.log("Loading contract-event-mappings.json...");
    const mappings = loadMappings();

    console.log("Validating mappings...");
    await validateMappings(mappings);

    console.log("Generating event-types.ts...");
    const eventTypes = await generateEventTypes(mappings);

    console.log("Generating eventRegistry.ts...");
    const eventRegistry = await generateEventRegistry(mappings);

    if (checkMode) {
      // Check if files would change
      const existingTypes = existsSync(EVENT_TYPES_PATH)
        ? readFileSync(EVENT_TYPES_PATH, "utf-8")
        : "";
      const existingRegistry = existsSync(EVENT_REGISTRY_PATH)
        ? readFileSync(EVENT_REGISTRY_PATH, "utf-8")
        : "";

      if (existingTypes !== eventTypes || existingRegistry !== eventRegistry) {
        console.error(
          'Generated files would change. Run "npm run generate:types" to update.',
        );
        return false;
      }
      console.log("Generated files are up to date.");
      return true;
    } else {
      // Write files
      writeFileSync(EVENT_TYPES_PATH, eventTypes);
      console.log(`✅ Written ${EVENT_TYPES_PATH}`);

      writeFileSync(EVENT_REGISTRY_PATH, eventRegistry);
      console.log(`✅ Written ${EVENT_REGISTRY_PATH}`);

      return true;
    }
  } catch (error) {
    console.error("Generation failed:", error);
    return false;
  }
}

// CLI entry point
const checkMode = process.argv.includes("--check");
void generate(checkMode).then((success) => {
  process.exit(success ? 0 : 1);
});

export { generate };
