/**
 * GraphQL Code Generator configuration for Vana subgraph types
 *
 * This file configures the generation of TypeScript types from GraphQL schema and operations
 * for the Vana subgraph. It automatically generates typed document nodes that provide
 * type-safe GraphQL queries with automatic completion and error checking.
 *
 * Generated files:
 * - src/generated/subgraph.ts: TypeScript types and typed document nodes for subgraph queries
 *
 * Environment variables:
 * - VANA_CODEGEN_NETWORK: Controls which network's subgraph to use ('moksha' or 'mainnet')
 *
 * Usage:
 * - npm run codegen:subgraph        (uses moksha by default)
 * - npm run codegen:subgraph:moksha (explicitly use moksha testnet)
 * - npm run codegen:subgraph:mainnet (explicitly use mainnet)
 *
 * DO NOT EDIT generated files manually - they are regenerated automatically.
 */

import type { CodegenConfig } from "@graphql-codegen/cli";
import { moksha, vanaMainnet } from "./src/chains/definitions";

// Use moksha as default for development, can be overridden via environment variable
const DEFAULT_NETWORK = process.env.VANA_CODEGEN_NETWORK || "moksha";

const getSubgraphUrl = () => {
  switch (DEFAULT_NETWORK) {
    case "mainnet":
      return vanaMainnet.subgraphUrl;
    case "moksha":
    default:
      return moksha.subgraphUrl;
  }
};

const config: CodegenConfig = {
  schema: getSubgraphUrl(),
  documents: ["src/subgraph/queries/**/*.graphql"],
  generates: {
    "src/generated/subgraph.ts": {
      plugins: ["typescript", "typescript-operations", "typed-document-node"],
      config: {
        // Only generate types, no SDK/client
        skipTypename: true,
        enumsAsTypes: true,
        scalars: {
          BigInt: "string",
          Bytes: "string",
          BigDecimal: "string",
        },
      },
    },
  },
};

export default config;
