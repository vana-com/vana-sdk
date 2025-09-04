/**
 * RPC Endpoint Distribution Utilities
 * 
 * Distributes load across multiple RPC endpoints to avoid bottlenecks
 */

import type { LoadTestConfig } from '../config/types.js';

/**
 * Get an RPC endpoint using round-robin distribution
 * @param config - Load test configuration
 * @param index - Optional index for deterministic selection (e.g., user index)
 * @returns Selected RPC endpoint URL
 */
export function getRpcEndpoint(config: LoadTestConfig, index?: number): string {
  if (!config.rpcEndpoints || config.rpcEndpoints.length === 0) {
    throw new Error('No RPC endpoints configured');
  }
  
  // If only one endpoint, always return it
  if (config.rpcEndpoints.length === 1) {
    return config.rpcEndpoints[0];
  }
  
  // Round-robin distribution
  if (index !== undefined) {
    // Deterministic selection based on index
    return config.rpcEndpoints[index % config.rpcEndpoints.length];
  } else {
    // Random selection for better distribution
    const randomIndex = Math.floor(Math.random() * config.rpcEndpoints.length);
    return config.rpcEndpoints[randomIndex];
  }
}

/**
 * Get RPC endpoint for a specific wallet address (deterministic)
 * @param config - Load test configuration
 * @param address - Wallet address
 * @returns Selected RPC endpoint URL
 */
export function getRpcEndpointForWallet(config: LoadTestConfig, address: string): string {
  if (!config.rpcEndpoints || config.rpcEndpoints.length === 0) {
    throw new Error('No RPC endpoints configured');
  }
  
  // Use wallet address to deterministically select endpoint
  // This ensures the same wallet always uses the same RPC
  const hash = address.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  const index = Math.abs(hash) % config.rpcEndpoints.length;
  return config.rpcEndpoints[index];
}

/**
 * Log RPC distribution statistics
 * @param config - Load test configuration
 */
export function logRpcDistribution(config: LoadTestConfig): void {
  console.log(`📡 RPC Endpoints configured: ${config.rpcEndpoints.length}`);
  config.rpcEndpoints.forEach((endpoint, index) => {
    console.log(`   ${index + 1}. ${endpoint}`);
  });
}
