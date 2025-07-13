/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { BrowserPlatformAdapter } from "../platform/browser";
import {
  generateEncryptionKey,
  encryptUserData,
  decryptUserData,
} from "../utils/encryption";

/**
 * Test that verifies the demo is using the correct wallet-based encryption architecture
 */

describe("Demo Integration - Correct Wallet-Based Encryption", () => {
  it("should reproduce the demo's wallet-based encryption workflow", async () => {
    // Mock wallet (same structure as demo)
    const mockWallet = {
      account: { address: "0x123456789abcdef" },
      signMessage: vi.fn().mockResolvedValue("0xsignature123"),
      signTypedData: vi.fn().mockResolvedValue("0xsignature123"),
    };

    const platformAdapter = new BrowserPlatformAdapter();
    const encryptionSeed = "Please sign to retrieve your encryption key";

    // Step 1: Generate encryption key from wallet signature (like demo's handleGenerateKey)
    const encryptionKey = await generateEncryptionKey(
      mockWallet as any,
      encryptionSeed,
    );
    expect(encryptionKey).toBe("0xsignature123");
    expect(mockWallet.signMessage).toHaveBeenCalledWith({
      account: mockWallet.account,
      message: encryptionSeed,
    });

    // Step 2: Encrypt data using the signature as password (like demo's handleEncryptData)
    const testData = "Hello Vana Demo!";
    const dataBlob = new Blob([testData], { type: "text/plain" });

    const encryptedData = await encryptUserData(
      dataBlob,
      encryptionKey,
      platformAdapter,
    );
    expect(encryptedData).toBeInstanceOf(Blob);

    // Step 3: Decrypt data using the same signature (like demo's handleDecryptData)
    const decryptedData = await decryptUserData(
      encryptedData,
      encryptionKey,
      platformAdapter,
    );
    const decryptedText = await decryptedData.text();

    expect(decryptedText).toBe(testData);
  });

  it("should work with the demo's default encryption seed", async () => {
    const mockWallet = {
      account: { address: "0x123456789abcdef" },
      signMessage: vi.fn().mockResolvedValue("0xdefaultkeysignature"),
    };

    const platformAdapter = new BrowserPlatformAdapter();

    // Use the same default seed as the demo
    const defaultSeed = "Please sign to retrieve your encryption key";

    const encryptionKey = await generateEncryptionKey(
      mockWallet as any,
      defaultSeed,
    );

    // Verify the correct seed was used
    expect(mockWallet.signMessage).toHaveBeenCalledWith({
      account: mockWallet.account,
      message: defaultSeed,
    });

    // Verify encryption/decryption works with this key
    const testData = new Blob(["Demo test data"], { type: "text/plain" });
    const encrypted = await encryptUserData(
      testData,
      encryptionKey,
      platformAdapter,
    );
    const decrypted = await decryptUserData(
      encrypted,
      encryptionKey,
      platformAdapter,
    );

    const originalText = await testData.text();
    const decryptedText = await decrypted.text();
    expect(decryptedText).toBe(originalText);
  });

  it("should handle different file types like the demo", async () => {
    const mockWallet = {
      account: { address: "0x123456789abcdef" },
      signMessage: vi.fn().mockResolvedValue("0xfiletestsignature"),
    };

    const platformAdapter = new BrowserPlatformAdapter();
    const encryptionKey = await generateEncryptionKey(mockWallet as any);

    // Test with JSON data (like demo's test data)
    const jsonData = JSON.stringify({
      message: "Hello Vana!",
      timestamp: new Date().toISOString(),
    });
    const jsonBlob = new Blob([jsonData], { type: "application/json" });

    const encryptedJson = await encryptUserData(
      jsonBlob,
      encryptionKey,
      platformAdapter,
    );
    const decryptedJson = await decryptUserData(
      encryptedJson,
      encryptionKey,
      platformAdapter,
    );
    const decryptedJsonText = await decryptedJson.text();

    expect(decryptedJsonText).toBe(jsonData);

    // Test with file data
    const fileContent = "This is a test file content for the demo";
    const fileBlob = new Blob([fileContent], { type: "text/plain" });

    const encryptedFile = await encryptUserData(
      fileBlob,
      encryptionKey,
      platformAdapter,
    );
    const decryptedFile = await decryptUserData(
      encryptedFile,
      encryptionKey,
      platformAdapter,
    );
    const decryptedFileText = await decryptedFile.text();

    expect(decryptedFileText).toBe(fileContent);
  });
});
