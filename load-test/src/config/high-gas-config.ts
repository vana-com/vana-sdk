import type { LoadTestConfig } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';

/**
 * High gas configuration for dealing with network congestion during load tests.
 * Use this when experiencing timeout errors due to pending transactions.
 */
export const HIGH_GAS_CONFIG: Partial<LoadTestConfig> = {
  // Increase gas multiplier significantly
  premiumGasMultiplier: 20.0,      // 20x base gas (was 10x)
  maxGasPrice: "250",              // 250 gwei max (uses 0.15 VANA of 0.2 VANA budget)
  
  // Increase timeouts to match actual pending times
  transactionTimeoutMs: 1800000,    // 30 minutes (was 10 minutes)
  
  // Reduce concurrency to avoid mempool congestion
  maxConcurrentUsers: 100,         // Reduced from 1000
  
  // Enable debug logs to see gas prices
  enableDebugLogs: true,
};

/**
 * Progressive scaling configuration - start small and ramp up
 */
export const PROGRESSIVE_SCALE_CONFIG: Partial<LoadTestConfig> = {
  // Start with moderate gas
  premiumGasMultiplier: 20.0,
  maxGasPrice: "250",              // 250 gwei max (uses 0.15 VANA of 0.2 VANA budget)
  
  // Small batches
  totalUsers: 100,                 // Start with 100 users
  maxConcurrentUsers: 20,          // Only 20 at a time
  
  // Reasonable timeouts
  transactionTimeoutMs: 300000,    // 5 minutes
};

/**
 * Get configuration for high-gas scenario
 */
export function getHighGasConfig(): LoadTestConfig {
  return {
    ...DEFAULT_CONFIG,
    ...HIGH_GAS_CONFIG,
  };
}

/**
 * Get configuration for progressive scaling
 */
export function getProgressiveScaleConfig(): LoadTestConfig {
  return {
    ...DEFAULT_CONFIG,
    ...PROGRESSIVE_SCALE_CONFIG,
  };
}

