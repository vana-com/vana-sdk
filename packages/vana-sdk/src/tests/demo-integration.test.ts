import { describe, it, expect, vi } from "vitest";
import {
  generateEncryptionKey,
  encryptBlobWithSignedKey,
  decryptBlobWithSignedKey,
} from "../utils/encryption";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

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

    const encryptionSeed = "Please sign to retrieve your encryption key";

    // Step 1: Generate encryption key from wallet signature (like demo's handleGenerateKey)
    const encryptionKey = await generateEncryptionKey(
      mockWallet as any,
      mockPlatformAdapter,
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

    const encryptedData = await encryptBlobWithSignedKey(
      dataBlob,
      encryptionKey,
      mockPlatformAdapter,
    );
    expect(encryptedData).toBeInstanceOf(Blob);

    // Step 3: Decrypt data using the same signature (like demo's handleDecryptData)
    const decryptedData = await decryptBlobWithSignedKey(
      encryptedData,
      encryptionKey,
      mockPlatformAdapter,
    );
    const decryptedText = await decryptedData.text();

    expect(decryptedText).toBe(testData);
  });

  it("should work with the demo's default encryption seed", async () => {
    const mockWallet = {
      account: { address: "0x123456789abcdef" },
      signMessage: vi.fn().mockResolvedValue("0xdefaultkeysignature"),
    };

    // Use the same default seed as the demo
    const defaultSeed = "Please sign to retrieve your encryption key";

    const encryptionKey = await generateEncryptionKey(
      mockWallet as any,
      mockPlatformAdapter,
      defaultSeed,
    );

    // Verify the correct seed was used
    expect(mockWallet.signMessage).toHaveBeenCalledWith({
      account: mockWallet.account,
      message: defaultSeed,
    });

    // Verify encryption/decryption works with this key
    const testData = new Blob(["Demo test data"], { type: "text/plain" });
    const encrypted = await encryptBlobWithSignedKey(
      testData,
      encryptionKey,
      mockPlatformAdapter,
    );
    const decrypted = await decryptBlobWithSignedKey(
      encrypted,
      encryptionKey,
      mockPlatformAdapter,
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

    const encryptionKey = await generateEncryptionKey(
      mockWallet as any,
      mockPlatformAdapter,
    );

    // Test with JSON data (like demo's test data)
    const jsonData = JSON.stringify({
      message: "Hello Vana!",
      timestamp: new Date().toISOString(),
    });
    const jsonBlob = new Blob([jsonData], { type: "application/json" });

    const encryptedJson = await encryptBlobWithSignedKey(
      jsonBlob,
      encryptionKey,
      mockPlatformAdapter,
    );
    const decryptedJson = await decryptBlobWithSignedKey(
      encryptedJson,
      encryptionKey,
      mockPlatformAdapter,
    );
    const decryptedJsonText = await decryptedJson.text();

    expect(decryptedJsonText).toBe(jsonData);

    // Test with file data
    const fileContent = "This is a test file content for the demo";
    const fileBlob = new Blob([fileContent], { type: "text/plain" });

    const encryptedFile = await encryptBlobWithSignedKey(
      fileBlob,
      encryptionKey,
      mockPlatformAdapter,
    );
    const decryptedFile = await decryptBlobWithSignedKey(
      encryptedFile,
      encryptionKey,
      mockPlatformAdapter,
    );
    const decryptedFileText = await decryptedFile.text();

    expect(decryptedFileText).toBe(fileContent);
  });
});
