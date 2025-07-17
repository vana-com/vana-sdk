/**
 * Node.js-specific chains entry point
 *
 * This is identical to the base chains export since chain configurations
 * are environment-agnostic.
 */

export type { VanaChainConfig } from "./chains/definitions";
export {
  vanaMainnet,
  moksha,
  getChainConfig,
  getAllChains,
} from "./chains/definitions";
