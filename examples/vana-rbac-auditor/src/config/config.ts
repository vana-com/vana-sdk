/**
 * RBAC Auditor Configuration
 * Contains only user-configurable business logic and known addresses
 *
 * Configuration is loaded from RBAC_CONFIG environment variable
 *
 * Setup:
 *   1. Copy config.yaml.example to config.yaml
 *   2. Edit config.yaml with your addresses
 *   3. Run: npm run generate-config-env (creates .env.local)
 *   4. Run: npm run dev
 */
import type { Address } from "viem";

/**
 * Known address configuration
 */
export interface KnownAddressConfig {
  label: string;
  description: string;
  category: "core-team" | "service-account" | "deactivated" | "deprecated";
}

/**
 * Anomaly detection configuration
 */
export interface AnomalyDetectionConfig {
  adminKeywords: string[];
  adminThreshold: number;
}

/**
 * Root configuration structure
 */
export interface RBACConfig {
  anomalyDetection: AnomalyDetectionConfig;
  legacyRoles: Record<string, string>;
  knownAddresses: Record<Address, KnownAddressConfig>;
}

/**
 * Load configuration from NEXT_PUBLIC_RBAC_CONFIG environment variable
 *
 * For local development: Run `npm run generate-config-env` to create .env.local
 * For Vercel: Set NEXT_PUBLIC_RBAC_CONFIG environment variable with the JSON string
 */
function loadConfig(): RBACConfig {
  if (process.env.NEXT_PUBLIC_RBAC_CONFIG) {
    try {
      return JSON.parse(process.env.NEXT_PUBLIC_RBAC_CONFIG) as RBACConfig;
    } catch (error) {
      console.error('Failed to parse NEXT_PUBLIC_RBAC_CONFIG environment variable:', error);
      console.error('Falling back to minimal configuration');
    }
  }

  // Minimal fallback - no sensitive data in checked-in code
  console.warn('⚠️  No NEXT_PUBLIC_RBAC_CONFIG found - using minimal fallback');
  console.warn('   Run: npm run generate-config-env');
  console.warn('   Then: npm run dev');

  return {
    anomalyDetection: {
      adminKeywords: ["ADMIN", "OWNER", "PAUSER"],
      adminThreshold: 3,
    },
    legacyRoles: {
      "0x4a9e0bcfdcf4f0a437aa6573b8f27b9835c3d0b1ea993474026f6c41467c1b64":
        "VANA_POOL_ENTITY",
    },
    knownAddresses: {},
  };
}

/**
 * Configuration instance (loaded once)
 */
export const config: RBACConfig = loadConfig();
