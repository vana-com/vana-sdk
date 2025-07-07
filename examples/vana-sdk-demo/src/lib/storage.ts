// Centralized storage configuration for the demo app
// This reduces duplication and provides consistent storage setup

import { StorageManager, PinataStorage, ServerIPFSStorage } from "vana-sdk";

/**
 * Get the Pinata gateway URL with fallback
 */
function getPinataGatewayUrl(): string {
  return process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud";
}

/**
 * Create a Pinata storage provider with the given JWT
 */
function createPinataStorageWithJWT(jwt: string): PinataStorage {
  return new PinataStorage({
    jwt,
    gatewayUrl: getPinataGatewayUrl(),
  });
}

/**
 * Create a configured storage manager with available providers
 * This centralizes storage configuration across the demo app
 */
export function createStorageManager(): StorageManager {
  const storageManager = new StorageManager();

  // Always provide server-managed IPFS as fallback
  const serverIPFS = new ServerIPFSStorage({
    uploadEndpoint: "/upload",
    baseUrl: "/api/ipfs",
  });
  storageManager.register("app-ipfs", serverIPFS);

  // Add Pinata if configured
  if (process.env.PINATA_JWT) {
    const pinataProvider = createPinataStorageWithJWT(process.env.PINATA_JWT);
    storageManager.register("pinata", pinataProvider);
  }

  return storageManager;
}

/**
 * Create a Pinata storage provider for server-side usage
 * Throws if not configured
 */
export function createPinataProvider(): PinataStorage {
  if (!process.env.PINATA_JWT) {
    throw new Error("PINATA_JWT not configured");
  }

  return createPinataStorageWithJWT(process.env.PINATA_JWT);
}

/**
 * Create a Pinata storage provider for client-side usage
 * Returns null if not configured
 */
export function createClientPinataProvider(jwt: string): PinataStorage | null {
  if (!jwt) {
    return null;
  }

  return createPinataStorageWithJWT(jwt);
}
