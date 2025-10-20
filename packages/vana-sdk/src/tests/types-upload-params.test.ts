import { describe, it, expect, expectTypeOf } from "vitest";
import type { Address } from "viem";
import type {
  UploadParams,
  FilePermissionParams,
  LegacyPermissionParams,
  EncryptedUploadParams,
  UnencryptedUploadParams,
} from "../types/data";

describe("Upload Types with Type Safety", () => {
  describe("FilePermissionParams", () => {
    it("should require both account and publicKey", () => {
      const permission: FilePermissionParams = {
        account: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        publicKey: "0x04abcdef...",
      };

      expect(permission.account).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(permission.publicKey).toBe("0x04abcdef...");
    });

    it("should be minimal with no operation fields", () => {
      const permission: FilePermissionParams = {
        account: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        publicKey: "0x04abcdef...",
      };

      // Verify no extra fields exist
      expect(Object.keys(permission)).toHaveLength(2);
      expect(Object.keys(permission)).toEqual(["account", "publicKey"]);
    });
  });

  describe("LegacyPermissionParams", () => {
    it("should maintain the old interface for migration reference", () => {
      const permission: LegacyPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
        publicKey: "0x04abcdef...",
      };

      expect(permission.grantee).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(permission.operation).toBe("llm_inference");
      expect(permission.parameters).toEqual({ model: "gpt-4" });
      expect(permission.publicKey).toBe("0x04abcdef...");
    });

    // This test documents the migration path
    it("should show migration from legacy to new types", () => {
      // Old way (deprecated):
      /*
      const permission: EncryptedPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
        // Missing publicKey would cause TypeScript error
      };
      */
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe("UploadParams (generic)", () => {
    it("should allow basic upload without permissions", () => {
      const params: UploadParams = {
        content: "Hello World",
        filename: "test.txt",
      };

      expect(params.content).toBe("Hello World");
      expect(params.encrypt).toBeUndefined(); // defaults to true
    });

    it("should allow file permissions with account and publicKey", () => {
      const params: UploadParams = {
        content: "Hello World",
        filename: "test.txt",
        permissions: [
          {
            account:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            publicKey: "0x04abcdef...",
          },
        ],
      };

      expect(params.permissions?.[0].account).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(params.permissions?.[0].publicKey).toBe("0x04abcdef...");
    });
  });

  describe("EncryptedUploadParams", () => {
    it("should use FilePermissionParams for encrypted uploads", () => {
      const params: EncryptedUploadParams = {
        content: "Encrypted data",
        filename: "secret.txt",
        encrypt: true,
        permissions: [
          {
            account:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            publicKey: "0x04abcdef...",
          },
        ],
      };

      expect(params.encrypt).toBe(true);
      expect(params.permissions?.[0].publicKey).toBe("0x04abcdef...");
      if (params.permissions?.[0]) {
        expectTypeOf(params.permissions[0].publicKey).toEqualTypeOf<string>();
      }
    });

    // This test demonstrates the clean interface
    it("should demonstrate the clean file permission interface", () => {
      // Clean interface - only what's needed for file encryption
      const params: EncryptedUploadParams = {
        content: "Encrypted data",
        filename: "secret.txt",
        encrypt: true,
        permissions: [
          {
            account:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            publicKey: "0x04abcdef...",
            // No operation or parameters fields - those belong in vana.permissions.grant()
          },
        ],
      };
      expect(params.permissions?.[0]).toHaveProperty("account");
      expect(params.permissions?.[0]).toHaveProperty("publicKey");
      expect(params.permissions?.[0]).not.toHaveProperty("operation");
    });
  });

  describe("UnencryptedUploadParams", () => {
    it("should use FilePermissionParams even when encrypt is false", () => {
      const params: UnencryptedUploadParams = {
        content: "Public data",
        filename: "public.txt",
        encrypt: false,
        permissions: [
          {
            account:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            publicKey: "0x04abcdef...", // Still required by interface
          },
        ],
      };

      expect(params.encrypt).toBe(false);
      expect(params.permissions?.[0].publicKey).toBe("0x04abcdef...");
    });

    it("should maintain clean interface for unencrypted uploads", () => {
      const params: UnencryptedUploadParams = {
        content: "Public data",
        filename: "public.txt",
        encrypt: false,
        // No permissions needed for public data
      };

      expect(params.permissions).toBeUndefined();
    });
  });

  describe("Type compatibility", () => {
    it("should allow EncryptedUploadParams to be used as UploadParams", () => {
      const encryptedParams: EncryptedUploadParams = {
        content: "Secret data",
        encrypt: true,
        permissions: [
          {
            account:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            publicKey: "0x04abcdef...",
          },
        ],
      };

      // Should be assignable to generic UploadParams
      const genericParams: UploadParams = encryptedParams;
      expect(genericParams.encrypt).toBe(true);
    });

    it("should allow UnencryptedUploadParams to be used as UploadParams", () => {
      const unencryptedParams: UnencryptedUploadParams = {
        content: "Public data",
        encrypt: false,
        // No permissions for unencrypted public data
      };

      // Should be assignable to generic UploadParams
      const genericParams: UploadParams = unencryptedParams;
      expect(genericParams.encrypt).toBe(false);
    });
  });

  describe("Real-world usage examples", () => {
    it("should support typical encrypted upload scenario", () => {
      // Step 1: Upload with file permissions
      const uploadParams: EncryptedUploadParams = {
        content: JSON.stringify({
          userId: 123,
          preferences: { theme: "dark" },
        }),
        filename: "user-preferences.json",
        schemaId: 5,
        encrypt: true,
        permissions: [
          {
            account:
              "0x1234567890123456789012345678901234567890" as `0x${string}`, // Server address
            publicKey: "0x04abcdef123456789...", // Server's public key
          },
        ],
      };

      expect(uploadParams.encrypt).toBe(true);
      expect(uploadParams.permissions).toHaveLength(1);
      expect(uploadParams.permissions?.[0].publicKey).toBeTruthy();

      // Step 2: Grant operation permissions separately (not shown in type test)
      // Would use vana.permissions.grant() with operation: "llm_inference", etc.
    });

    it("should support unencrypted public data scenario", () => {
      const params: UnencryptedUploadParams = {
        content: "This is public information",
        filename: "public-announcement.txt",
        encrypt: false,
        // No permissions needed for public unencrypted data
        // Operation permissions would be granted separately if needed
      };

      expect(params.encrypt).toBe(false);
      expect(params.permissions).toBeUndefined();
    });

    it("should support the two-step process for secure data sharing", () => {
      // Step 1: Upload encrypted file with decryption permissions
      const step1UploadParams: EncryptedUploadParams = {
        content: "Sensitive medical data",
        filename: "health-records.json",
        encrypt: true,
        permissions: [
          {
            account: "0xAIServerAddress..." as `0x${string}`,
            publicKey: "0x04ServerPublicKey...",
          },
        ],
      };

      // Step 2: Grant operation permissions (type shown for documentation)
      // This would be done with vana.permissions.grant()
      interface GrantParams {
        grantee: Address;
        fileIds: bigint[];
        operation: string;
        parameters: Record<string, unknown>;
      }

      const step2GrantParams: GrantParams = {
        grantee: "0xAIServerAddress...",
        fileIds: [123n], // fileId from upload result
        operation: "medical_analysis",
        parameters: {
          model: "medical-ai-v2",
          analysisType: "comprehensive",
        },
      };

      expect(step1UploadParams.encrypt).toBe(true);
      expect(step1UploadParams.permissions).toHaveLength(1);
      expect(step2GrantParams.operation).toBe("medical_analysis");
    });
  });
});
