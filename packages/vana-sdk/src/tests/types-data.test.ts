import { describe, it, expect } from "vitest";
import type { Address, Hash } from "viem";
import type {
  UserFile,
  FileMetadata,
  UploadFileParams,
  UploadFileResult,
  UploadEncryptedFileResult,
  EncryptionInfo,
  GetUserFilesParams,
  GetFileParams,
  DownloadFileParams,
  DownloadFileResult,
  DeleteFileParams,
  DeleteFileResult,
  FileAccessPermissions,
  FileSharingConfig,
  BatchUploadParams,
  BatchUploadResult,
  Schema,
  Refiner,
  AddSchemaParams,
  AddSchemaResult,
  AddRefinerParams,
  AddRefinerResult,
  UpdateSchemaIdParams,
  UpdateSchemaIdResult,
} from "../types/data";

describe("Data Types", () => {
  describe("UserFile", () => {
    it("should properly structure user file data", () => {
      const userFile: UserFile = {
        id: 123,
        url: "ipfs://QmTestHash",
        ownerAddress: "0x1234567890123456789012345678901234567890",
        addedAtBlock: 12345n,
        schemaId: 5,
        addedAtTimestamp: 1640995200n,
        transactionHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        metadata: {
          name: "test-file.json",
          size: 1024,
          mimeType: "application/json",
        },
      };

      expect(userFile.id).toBe(123);
      expect(userFile.url).toBe("ipfs://QmTestHash");
      expect(userFile.ownerAddress).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(userFile.addedAtBlock).toBe(12345n);
      expect(userFile.schemaId).toBe(5);
      expect(userFile.addedAtTimestamp).toBe(1640995200n);
      expect(userFile.metadata?.name).toBe("test-file.json");
    });

    it("should handle optional fields", () => {
      const minimalUserFile: UserFile = {
        id: 456,
        url: "ipfs://QmMinimalHash",
        ownerAddress: "0x9876543210987654321098765432109876543210",
        addedAtBlock: 54321n,
      };

      expect(minimalUserFile.schemaId).toBeUndefined();
      expect(minimalUserFile.addedAtTimestamp).toBeUndefined();
      expect(minimalUserFile.transactionHash).toBeUndefined();
      expect(minimalUserFile.metadata).toBeUndefined();
    });
  });

  describe("FileMetadata", () => {
    it("should structure file metadata correctly", () => {
      const metadata: FileMetadata = {
        name: "document.pdf",
        size: 2048576,
        mimeType: "application/pdf",
        checksum: "sha256:abc123def456",
        uploadedAt: "2023-01-01T12:00:00Z",
        custom: {
          department: "Engineering",
          classification: "Internal",
          version: 1.2,
        },
      };

      expect(metadata.name).toBe("document.pdf");
      expect(metadata.size).toBe(2048576);
      expect(metadata.mimeType).toBe("application/pdf");
      expect(metadata.checksum).toBe("sha256:abc123def456");
      expect(metadata.uploadedAt).toBe("2023-01-01T12:00:00Z");
      expect(metadata.custom?.department).toBe("Engineering");
      expect(metadata.custom?.version).toBe(1.2);
    });

    it("should handle empty metadata", () => {
      const emptyMetadata: FileMetadata = {};

      expect(Object.keys(emptyMetadata)).toHaveLength(0);
    });
  });

  describe("UploadFileParams", () => {
    it("should structure upload parameters correctly", () => {
      const uploadParams: UploadFileParams = {
        content: new Uint8Array([1, 2, 3, 4, 5]),
        metadata: {
          name: "test-data.bin",
          size: 5,
          mimeType: "application/octet-stream",
        },
        storageProvider: "ipfs",
        encrypt: true,
        encryptionKey: "test-key-123",
      };

      expect(uploadParams.content).toBeInstanceOf(Uint8Array);
      expect(uploadParams.content).toHaveLength(5);
      expect(uploadParams.metadata?.name).toBe("test-data.bin");
      expect(uploadParams.storageProvider).toBe("ipfs");
      expect(uploadParams.encrypt).toBe(true);
      expect(uploadParams.encryptionKey).toBe("test-key-123");
    });

    it("should handle different content types", () => {
      const stringUpload: UploadFileParams = {
        content: "Hello, world!",
      };

      const bufferUpload: UploadFileParams = {
        content: Buffer.from("Buffer content"),
      };

      const uint8ArrayUpload: UploadFileParams = {
        content: new Uint8Array([65, 66, 67]),
      };

      expect(typeof stringUpload.content).toBe("string");
      expect(bufferUpload.content).toBeInstanceOf(Buffer);
      expect(uint8ArrayUpload.content).toBeInstanceOf(Uint8Array);
    });
  });

  describe("UploadFileResult", () => {
    it("should structure upload result correctly", () => {
      const result: UploadFileResult = {
        url: "ipfs://QmUploadedFile",
        size: 1024,
        checksum: "sha256:def789ghi012",
        encryption: {
          algorithm: "AES-256-GCM",
          kdf: "scrypt",
          iv: "randomiv123",
          salt: "randomsalt456",
          keyId: "key-identifier",
        },
      };

      expect(result.url).toBe("ipfs://QmUploadedFile");
      expect(result.size).toBe(1024);
      expect(result.checksum).toBe("sha256:def789ghi012");
      expect(result.encryption?.algorithm).toBe("AES-256-GCM");
      expect(result.encryption?.kdf).toBe("scrypt");
    });
  });

  describe("UploadEncryptedFileResult", () => {
    it("should extend UploadFileResult with file ID and transaction", () => {
      const result: UploadEncryptedFileResult = {
        url: "ipfs://QmEncryptedFile",
        size: 2048,
        fileId: 789,
        transactionHash:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12" as Hash,
        encryption: {
          algorithm: "ChaCha20-Poly1305",
        },
      };

      expect(result.fileId).toBe(789);
      expect(result.transactionHash).toBe(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
      );
      expect(result.url).toBe("ipfs://QmEncryptedFile");
      expect(result.size).toBe(2048);
      expect(result.encryption?.algorithm).toBe("ChaCha20-Poly1305");
    });
  });

  describe("EncryptionInfo", () => {
    it("should structure encryption information correctly", () => {
      const encryptionInfo: EncryptionInfo = {
        algorithm: "AES-256-CTR",
        kdf: "pbkdf2",
        iv: "initialization_vector",
        salt: "random_salt_value",
        keyId: "encryption_key_id",
      };

      expect(encryptionInfo.algorithm).toBe("AES-256-CTR");
      expect(encryptionInfo.kdf).toBe("pbkdf2");
      expect(encryptionInfo.iv).toBe("initialization_vector");
      expect(encryptionInfo.salt).toBe("random_salt_value");
      expect(encryptionInfo.keyId).toBe("encryption_key_id");
    });

    it("should handle minimal encryption info", () => {
      const minimalInfo: EncryptionInfo = {
        algorithm: "AES-128-GCM",
      };

      expect(minimalInfo.algorithm).toBe("AES-128-GCM");
      expect(minimalInfo.kdf).toBeUndefined();
      expect(minimalInfo.iv).toBeUndefined();
    });
  });

  describe("GetUserFilesParams", () => {
    it("should structure file query parameters correctly", () => {
      const params: GetUserFilesParams = {
        owner: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef" as `0x${string}`,
        fromBlock: 1000n,
        toBlock: 2000n,
        limit: 50,
        offset: 100,
      };

      expect(params.owner).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef");
      expect(params.fromBlock).toBe(1000n);
      expect(params.toBlock).toBe(2000n);
      expect(params.limit).toBe(50);
      expect(params.offset).toBe(100);
    });

    it("should handle empty parameters", () => {
      const emptyParams: GetUserFilesParams = {};

      expect(Object.keys(emptyParams)).toHaveLength(0);
    });
  });

  describe("GetFileParams", () => {
    it("should structure single file query parameters", () => {
      const params: GetFileParams = {
        fileId: 123,
        includeMetadata: true,
      };

      expect(params.fileId).toBe(123);
      expect(params.includeMetadata).toBe(true);
    });

    it("should handle minimal parameters", () => {
      const minimalParams: GetFileParams = {
        fileId: 456,
      };

      expect(minimalParams.fileId).toBe(456);
      expect(minimalParams.includeMetadata).toBeUndefined();
    });
  });

  describe("DownloadFileParams and Result", () => {
    it("should structure download parameters correctly", () => {
      const stringParams: DownloadFileParams = {
        file: "ipfs://QmDownloadFile",
        storageProvider: "ipfs",
        decryptionKey: "decrypt-key-123",
      };

      const numberParams: DownloadFileParams = {
        file: 789,
        storageProvider: "arweave",
      };

      expect(stringParams.file).toBe("ipfs://QmDownloadFile");
      expect(typeof stringParams.file).toBe("string");
      expect(numberParams.file).toBe(789);
      expect(typeof numberParams.file).toBe("number");
    });

    it("should structure download result correctly", () => {
      const result: DownloadFileResult = {
        content: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
        metadata: {
          name: "downloaded-file.txt",
          size: 5,
          mimeType: "text/plain",
        },
        wasEncrypted: true,
      };

      expect(result.content).toBeInstanceOf(Uint8Array);
      expect(result.content).toHaveLength(5);
      expect(result.metadata?.name).toBe("downloaded-file.txt");
      expect(result.wasEncrypted).toBe(true);
    });
  });

  describe("DeleteFileParams and Result", () => {
    it("should structure delete parameters correctly", () => {
      const params: DeleteFileParams = {
        fileId: 999,
        deleteFromStorage: true,
        storageProvider: "pinata",
      };

      expect(params.fileId).toBe(999);
      expect(params.deleteFromStorage).toBe(true);
      expect(params.storageProvider).toBe("pinata");
    });

    it("should structure delete result correctly", () => {
      const result: DeleteFileResult = {
        registryDeleted: true,
        storageDeleted: true,
        transactionHash:
          "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" as Hash,
      };

      expect(result.registryDeleted).toBe(true);
      expect(result.storageDeleted).toBe(true);
      expect(result.transactionHash).toBe(
        "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      );
    });
  });

  describe("FileAccessPermissions", () => {
    it("should structure access permissions correctly", () => {
      const permissions: FileAccessPermissions = {
        read: true,
        write: false,
        delete: false,
        share: true,
      };

      expect(permissions.read).toBe(true);
      expect(permissions.write).toBe(false);
      expect(permissions.delete).toBe(false);
      expect(permissions.share).toBe(true);
    });

    it("should handle all permissions granted", () => {
      const fullPermissions: FileAccessPermissions = {
        read: true,
        write: true,
        delete: true,
        share: true,
      };

      expect(Object.values(fullPermissions).every(Boolean)).toBe(true);
    });
  });

  describe("FileSharingConfig", () => {
    it("should structure sharing configuration correctly", () => {
      const config: FileSharingConfig = {
        allowedAddresses: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
        ],
        expiresAt: new Date("2024-12-31T23:59:59Z"),
        permissions: {
          read: true,
          write: false,
          delete: false,
          share: false,
        },
      };

      expect(config.allowedAddresses).toHaveLength(2);
      expect(config.allowedAddresses?.[0]).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(config.expiresAt).toBeInstanceOf(Date);
      expect(config.permissions.read).toBe(true);
      expect(config.permissions.write).toBe(false);
    });
  });

  describe("BatchUploadParams and Result", () => {
    it("should structure batch upload parameters correctly", () => {
      const params: BatchUploadParams = {
        files: [
          {
            content: new Uint8Array([1, 2, 3]),
            metadata: { name: "file1.bin" },
          },
          {
            content: "File 2 content",
            metadata: { name: "file2.txt" },
          },
        ],
        storageProvider: "ipfs",
        encrypt: true,
        encryptionKey: "batch-key-456",
      };

      expect(params.files).toHaveLength(2);
      expect(params.files[0].content).toBeInstanceOf(Uint8Array);
      expect(typeof params.files[1].content).toBe("string");
      expect(params.storageProvider).toBe("ipfs");
      expect(params.encrypt).toBe(true);
    });

    it("should structure batch upload result correctly", () => {
      const result: BatchUploadResult = {
        results: [
          {
            url: "ipfs://QmFile1",
            size: 100,
            fileId: 1,
          },
          {
            url: "ipfs://QmFile2",
            size: 200,
            fileId: 2,
          },
        ],
        success: true,
        errors: [],
      };

      expect(result.results).toHaveLength(2);
      expect(result.results[0].fileId).toBe(1);
      expect(result.results[1].fileId).toBe(2);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should handle batch upload errors", () => {
      const failedResult: BatchUploadResult = {
        results: [],
        success: false,
        errors: ["File 1 upload failed", "File 2 encryption error"],
      };

      expect(failedResult.success).toBe(false);
      expect(failedResult.errors).toHaveLength(2);
      expect(failedResult.errors?.[0]).toBe("File 1 upload failed");
    });
  });

  describe("Schema", () => {
    it("should structure schema data correctly", () => {
      const schema: Schema = {
        id: 42,
        name: "Social Media Profile",
        dialect: "json",
        definitionUrl: "ipfs://QmSchemaDefinition",
      };

      expect(schema.id).toBe(42);
      expect(schema.name).toBe("Social Media Profile");
      expect(schema.dialect).toBe("json");
      expect(schema.definitionUrl).toBe("ipfs://QmSchemaDefinition");
    });
  });

  describe("Refiner", () => {
    it("should structure refiner data correctly", () => {
      const refiner: Refiner = {
        id: 10,
        dlpId: 5,
        owner: "0x3333333333333333333333333333333333333333" as `0x${string}`,
        name: "Data Processor",
        schemaId: 42,
        refinementInstructionUrl: "ipfs://QmRefinementInstructions",
      };

      expect(refiner.id).toBe(10);
      expect(refiner.dlpId).toBe(5);
      expect(refiner.owner).toBe("0x3333333333333333333333333333333333333333");
      expect(refiner.name).toBe("Data Processor");
      expect(refiner.schemaId).toBe(42);
      expect(refiner.refinementInstructionUrl).toBe(
        "ipfs://QmRefinementInstructions",
      );
    });
  });

  describe("AddSchemaParams and Result", () => {
    it("should structure add schema parameters correctly", () => {
      const params: AddSchemaParams = {
        name: "E-commerce Data",
        dialect: "JSON Schema",
        definitionUrl: "ipfs://QmEcommerceSchema",
      };

      expect(params.name).toBe("E-commerce Data");
      expect(params.dialect).toBe("JSON Schema");
      expect(params.definitionUrl).toBe("ipfs://QmEcommerceSchema");
    });

    it("should structure add schema result correctly", () => {
      const result: AddSchemaResult = {
        schemaId: 100,
        transactionHash:
          "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123" as Hash,
      };

      expect(result.schemaId).toBe(100);
      expect(result.transactionHash).toBe(
        "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123",
      );
    });
  });

  describe("AddRefinerParams and Result", () => {
    it("should structure add refiner parameters correctly", () => {
      const params: AddRefinerParams = {
        dlpId: 15,
        name: "Advanced Analytics Refiner",
        schemaId: 100,
        refinementInstructionUrl: "ipfs://QmAdvancedInstructions",
      };

      expect(params.dlpId).toBe(15);
      expect(params.name).toBe("Advanced Analytics Refiner");
      expect(params.schemaId).toBe(100);
      expect(params.refinementInstructionUrl).toBe(
        "ipfs://QmAdvancedInstructions",
      );
    });

    it("should structure add refiner result correctly", () => {
      const result: AddRefinerResult = {
        refinerId: 25,
        transactionHash:
          "0x789def012345789def012345789def012345789def012345789def012345789def" as Hash,
      };

      expect(result.refinerId).toBe(25);
      expect(result.transactionHash).toBe(
        "0x789def012345789def012345789def012345789def012345789def012345789def",
      );
    });
  });

  describe("UpdateSchemaIdParams and Result", () => {
    it("should structure update schema parameters correctly", () => {
      const params: UpdateSchemaIdParams = {
        refinerId: 25,
        newSchemaId: 150,
      };

      expect(params.refinerId).toBe(25);
      expect(params.newSchemaId).toBe(150);
    });

    it("should structure update schema result correctly", () => {
      const result: UpdateSchemaIdResult = {
        transactionHash:
          "0x456789abc123456789abc123456789abc123456789abc123456789abc123456789" as Hash,
      };

      expect(result.transactionHash).toBe(
        "0x456789abc123456789abc123456789abc123456789abc123456789abc123456789",
      );
    });
  });

  describe("Type Safety and Integration", () => {
    it("should ensure Address and Hash types are properly typed", () => {
      const address: Address = "0x1234567890123456789012345678901234567890";
      const hash: Hash =
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash;

      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should work with bigint values correctly", () => {
      const userFile: UserFile = {
        id: 1,
        url: "test-url",
        ownerAddress: "0x1234567890123456789012345678901234567890",
        addedAtBlock: BigInt("12345"),
        addedAtTimestamp: BigInt("1640995200"),
      };

      expect(typeof userFile.addedAtBlock).toBe("bigint");
      expect(typeof userFile.addedAtTimestamp).toBe("bigint");
      expect(userFile.addedAtBlock > 0n).toBe(true);
    });

    it("should handle complex nested structures", () => {
      const complexUpload: UploadFileParams = {
        content: new Uint8Array([1, 2, 3, 4, 5]),
        metadata: {
          name: "complex-file.json",
          size: 5,
          mimeType: "application/json",
          custom: {
            nested: {
              data: "value",
              array: [1, 2, 3],
              boolean: true,
            },
            timestamp: Date.now(),
          },
        },
        encrypt: true,
      };

      expect(complexUpload.metadata?.custom?.nested).toBeDefined();

      // Type the custom metadata structure for this test
      type CustomMetadata = {
        nested: {
          data: string;
          array: number[];
          boolean: boolean;
        };
        timestamp: number;
      };

      expect(
        Array.isArray(
          (complexUpload.metadata?.custom as CustomMetadata)?.nested?.array,
        ),
      ).toBe(true);
      expect(typeof complexUpload.metadata?.custom?.timestamp).toBe("number");
    });
  });
});
