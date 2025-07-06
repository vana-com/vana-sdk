// Centralized storage configuration for the demo app
// This reduces duplication and provides consistent storage setup

import { StorageManager, PinataStorage, ServerIPFSStorage } from "vana-sdk";

/**
 * Create a configured storage manager with available providers
 * This centralizes storage configuration across the demo app
 */
export function createStorageManager(): StorageManager {
  const storageManager = new StorageManager();

  // Always provide server-managed IPFS as fallback
  const serverIPFS = new ServerIPFSStorage({
    baseUrl: "/api/ipfs",
  });
  storageManager.register("app-ipfs", serverIPFS);

  // Add Pinata if configured
  if (process.env.PINATA_JWT) {
    const pinataProvider = new PinataStorage({
      jwt: process.env.PINATA_JWT,
      gatewayUrl:
        process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud",
    });
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

  return new PinataStorage({
    jwt: process.env.PINATA_JWT,
    gatewayUrl:
      process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud",
  });
}

/**
 * Create a Pinata storage provider for client-side usage
 * Returns null if not configured
 */
export function createClientPinataProvider(jwt: string): PinataStorage | null {
  if (!jwt) {
    return null;
  }

  return new PinataStorage({
    jwt,
    gatewayUrl: "https://gateway.pinata.cloud",
  });
}
