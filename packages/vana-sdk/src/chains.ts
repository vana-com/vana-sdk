/**
 * Chains entry point for SSR-safe chain configuration exports
 *
 * This module exports only chain configurations without any platform-specific
 * dependencies, making it safe for server-side rendering.
 */

export type { VanaChainConfig } from "./chains/definitions";
export {
  vanaMainnet,
  moksha,
  getChainConfig,
  getAllChains,
} from "./chains/definitions";
