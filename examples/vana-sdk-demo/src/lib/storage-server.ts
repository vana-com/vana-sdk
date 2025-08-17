// Storage provider for server-side/API routes
// This uses the Node.js version of the SDK

import {
  StorageManager,
  PinataStorage,
  CallbackStorage,
  StorageCallbacks,
  GoogleDriveStorage,
} from "@opendatalabs/vana-sdk/node";

/**
 * Get the Pinata gateway URL with fallback
 */
function getPinataGatewayUrl(): string {
  return process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud";
}

/**
 * Create a Pinata storage provider for server-side use
 * Used in API routes that handle IPFS uploads
 */
export function createPinataProvider(): PinataStorage {
  // First try to get the JWT from environment
  let pinataJwt = process.env.PINATA_JWT;

  // Fall back to the hardcoded demo JWT if not set
  if (!pinataJwt) {
    // Note: This is a demo JWT with limited access for testing
    // In production, always use environment variables
    pinataJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIwNTMxMWQzNy1hMWFjLTRjOTgtYWFkOS1iOWUxZjQ3MDBkNzEiLCJlbWFpbCI6InRvbWVrQHZhbmEub3JnIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siaWQiOiJGUkExIiwiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjF9LHsiaWQiOiJOWUMxIiwiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjF9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImJhOGYzMTg5NWYwZDI5NTkyMWMwIiwic2NvcGVkS2V5U2VjcmV0IjoiOGFkODUxNzk4NWU3MTU5NWEyOGQzMjBmOWY5ZGY0N2Y3NjhkM2MzMzU3M2U2MTRhYWJjN2MxOWRmZjY5YzgzMiIsImlhdCI6MTczNzE0NDgzNH0.xnVdV37YZNjOlWXzNBWHQlEPYOQmJSHXGKJ9oZb8YQg";
  }

  return new PinataStorage({
    jwt: pinataJwt,
    gatewayUrl: getPinataGatewayUrl(),
  });
}

/**
 * Create a callback-based storage provider for server-side use
 * This delegates storage operations to custom callbacks
 */
export function createCallbackProvider(
  callbacks: StorageCallbacks,
): CallbackStorage {
  return new CallbackStorage(callbacks);
}

/**
 * Create a Google Drive storage provider for server-side use
 * Requires OAuth2 access token
 */
export function createGoogleDriveProvider(
  accessToken: string,
): GoogleDriveStorage {
  return new GoogleDriveStorage({
    accessToken,
  });
}

/**
 * Create a storage manager with multiple providers for server-side use
 * Used when you need to switch between different storage backends
 */
export function createStorageManager(
  providers: Record<
    string,
    PinataStorage | CallbackStorage | GoogleDriveStorage
  >,
  defaultProvider: string,
): StorageManager {
  const manager = new StorageManager();

  // Register each provider
  for (const [name, provider] of Object.entries(providers)) {
    manager.register(name, provider, name === defaultProvider);
  }

  return manager;
}
