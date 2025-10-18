/**
 * Known addresses configuration
 * Re-exports from centralized config
 *
 * @deprecated This file is kept for backward compatibility.
 * Import from '@/config' instead.
 */

// Re-export all address-related functions from config
export {
  getAddressLabel,
  isKnownAddress,
  getKnownAddress,
  isDeactivatedAddress,
  isDeprecatedAddress,
  isCoreTeamAddress,
  isServiceAccount,
} from "./index";
