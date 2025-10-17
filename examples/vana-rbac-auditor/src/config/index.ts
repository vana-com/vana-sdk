/**
 * Configuration and constants for RBAC Auditor
 * Config contains only user-configurable values (known addresses, anomaly settings)
 * Constants are hardcoded values that never change
 */
import type { Address } from "viem";
import {
  config,
  type KnownAddressConfig,
  type AnomalyDetectionConfig,
  type RBACConfig,
} from "./config";

// Re-export types
export type { KnownAddressConfig, AnomalyDetectionConfig, RBACConfig };

/**
 * OpenZeppelin AccessControl event topic hashes
 * These are constants and never change
 */
export const EVENT_TOPICS = {
  RoleGranted:
    "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d",
  RoleRevoked:
    "0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b",
} as const;

/**
 * Special role hashes that always exist in AccessControl
 */
export const SPECIAL_ROLE_HASHES = {
  DEFAULT_ADMIN_ROLE:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  OWNER:
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
} as const;

/**
 * Get configuration instance
 */
export function getConfig() {
  return config;
}

/**
 * Get anomaly detection config
 */
export function getAnomalyDetectionConfig(): AnomalyDetectionConfig {
  const config = getConfig();
  return config.anomalyDetection;
}

/**
 * Get all known addresses
 */
export function getKnownAddresses(): Record<Address, KnownAddressConfig> {
  const config = getConfig();
  return config.knownAddresses;
}

/**
 * Get known address info (case-insensitive)
 */
export function getKnownAddress(
  address: Address
): KnownAddressConfig | undefined {
  const knownAddresses = getKnownAddresses();
  const normalized = address.toLowerCase().trim();

  for (const [key, value] of Object.entries(knownAddresses)) {
    if (key.toLowerCase() === normalized) {
      return value;
    }
  }
  return undefined;
}

/**
 * Get address label (case-insensitive)
 */
export function getAddressLabel(address: Address): string | undefined {
  return getKnownAddress(address)?.label;
}

/**
 * Check if address is known (case-insensitive)
 */
export function isKnownAddress(address: Address): boolean {
  return getKnownAddress(address) !== undefined;
}

/**
 * Check if address is deactivated
 */
export function isDeactivatedAddress(address: Address): boolean {
  return getKnownAddress(address)?.category === "deactivated";
}

/**
 * Check if address is deprecated
 */
export function isDeprecatedAddress(address: Address): boolean {
  return getKnownAddress(address)?.category === "deprecated";
}

/**
 * Check if address is core team
 */
export function isCoreTeamAddress(address: Address): boolean {
  return getKnownAddress(address)?.category === "core-team";
}

/**
 * Check if address is service account
 */
export function isServiceAccount(address: Address): boolean {
  return getKnownAddress(address)?.category === "service-account";
}

/**
 * Get legacy role mappings (roles still on-chain but not in current ABIs)
 */
export function getLegacyRoles(): Record<string, string> {
  return config.legacyRoles;
}
