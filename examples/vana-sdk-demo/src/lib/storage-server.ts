/**
 * Server-side storage configuration
 * Used by Next.js API routes running in Node.js
 *
 * Design principle: Server has direct access to storage providers.
 * Credentials are read from environment variables, never exposed to client.
 * Fail fast if not configured - explicit errors over silent failures.
 */

import { PinataStorage, GoogleDriveStorage } from "@opendatalabs/vana-sdk/node";

/**
 * Create a Pinata storage provider for server-side usage
 * Throws if not configured - fail fast principle
 */
export function createPinataProvider(): PinataStorage {
  const jwt = process.env.PINATA_JWT;

  if (!jwt) {
    throw new Error(
      "PINATA_JWT environment variable is not configured. " +
        "Please set it in your .env.local file.",
    );
  }

  return new PinataStorage({
    jwt,
    gatewayUrl:
      process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud",
  });
}

/**
 * Create a Google Drive storage provider for server-side usage
 * Returns null if not configured
 */
export function createGoogleDriveProvider(): GoogleDriveStorage | null {
  const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;

  if (!accessToken) {
    return null;
  }

  return new GoogleDriveStorage({
    accessToken,
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
  });
}
