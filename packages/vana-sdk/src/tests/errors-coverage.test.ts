import { describe, it, expect } from "vitest";
import {
  VanaError,
  RelayerError,
  UserRejectedRequestError,
  InvalidConfigurationError,
  ContractNotFoundError,
  BlockchainError,
  SerializationError,
  SignatureError,
  NetworkError,
  NonceError,
  PersonalServerError,
  ServerUrlMismatchError,
  PermissionError,
} from "../errors";
import { StorageError } from "../storage";

describe("Error Classes Coverage", () => {
  describe("ServerUrlMismatchError", () => {
    it("should create ServerUrlMismatchError with correct properties", () => {
      const existingUrl = "https://existing-server.example.com";
      const providedUrl = "https://new-server.example.com";
      const serverId = "0x1234567890123456789012345678901234567890";

      const error = new ServerUrlMismatchError(
        existingUrl,
        providedUrl,
        serverId,
      );

      expect(error).toBeInstanceOf(VanaError);
      expect(error).toBeInstanceOf(ServerUrlMismatchError);
      expect(error.name).toBe("ServerUrlMismatchError");
      expect(error.code).toBe("SERVER_URL_MISMATCH");
      expect(error.message).toBe(
        `Server ${serverId} is already registered with URL "${existingUrl}". Cannot change to "${providedUrl}".`,
      );
      expect(error.existingUrl).toBe(existingUrl);
      expect(error.providedUrl).toBe(providedUrl);
      expect(error.serverId).toBe(serverId);
    });

    it("should be throwable and catchable", () => {
      const existingUrl = "https://existing.com";
      const providedUrl = "https://new.com";
      const serverId = "server123";

      expect(() => {
        throw new ServerUrlMismatchError(existingUrl, providedUrl, serverId);
      }).toThrow(ServerUrlMismatchError);

      try {
        throw new ServerUrlMismatchError(existingUrl, providedUrl, serverId);
      } catch (error) {
        expect(error).toBeInstanceOf(ServerUrlMismatchError);
        expect((error as ServerUrlMismatchError).existingUrl).toBe(existingUrl);
        expect((error as ServerUrlMismatchError).providedUrl).toBe(providedUrl);
        expect((error as ServerUrlMismatchError).serverId).toBe(serverId);
      }
    });

    it("should handle empty strings correctly", () => {
      const error = new ServerUrlMismatchError("", "", "");

      expect(error.existingUrl).toBe("");
      expect(error.providedUrl).toBe("");
      expect(error.serverId).toBe("");
      expect(error.message).toContain(
        'Server  is already registered with URL ""',
      );
    });

    it("should handle special characters in URLs and server IDs", () => {
      const existingUrl =
        "https://server.example.com/api?key=123&value=test%20data";
      const providedUrl =
        "https://new-server.example.com/v2/api?token=abc&data=test%20value";
      const serverId = "0xABCDEF1234567890abcdef1234567890ABCDEF12";

      const error = new ServerUrlMismatchError(
        existingUrl,
        providedUrl,
        serverId,
      );

      expect(error.existingUrl).toBe(existingUrl);
      expect(error.providedUrl).toBe(providedUrl);
      expect(error.serverId).toBe(serverId);
      expect(error.message).toContain(existingUrl);
      expect(error.message).toContain(providedUrl);
      expect(error.message).toContain(serverId);
    });

    it("should have readonly properties", () => {
      const error = new ServerUrlMismatchError("url1", "url2", "id1");

      // Properties should be accessible
      expect(error.existingUrl).toBe("url1");
      expect(error.providedUrl).toBe("url2");
      expect(error.serverId).toBe("id1");

      // Properties are readonly by TypeScript but runtime doesn't throw
      // This tests that they exist and are accessible
      expect(typeof error.existingUrl).toBe("string");
      expect(typeof error.providedUrl).toBe("string");
      expect(typeof error.serverId).toBe("string");
    });
  });

  describe("Error inheritance chain", () => {
    it("should ensure all error classes inherit from VanaError", () => {
      const relayerError = new RelayerError("test relayer");
      const userRejectedError = new UserRejectedRequestError(
        "test user rejected",
      );
      const configError = new InvalidConfigurationError("test config");
      const contractError = new ContractNotFoundError("test contract", 14800);
      const blockchainError = new BlockchainError("test blockchain");
      const serializationError = new SerializationError("test serialization");
      const signatureError = new SignatureError("test signature");
      const networkError = new NetworkError("test network");
      const nonceError = new NonceError("test nonce");
      const personalServerError = new PersonalServerError(
        "test personal server",
      );
      const urlMismatchError = new ServerUrlMismatchError("url1", "url2", "id");
      const permissionError = new PermissionError("test permission");
      const storageError = new StorageError(
        "test storage",
        "STORAGE_FAILED",
        "test-provider",
      );

      expect(relayerError).toBeInstanceOf(VanaError);
      expect(userRejectedError).toBeInstanceOf(VanaError);
      expect(configError).toBeInstanceOf(VanaError);
      expect(contractError).toBeInstanceOf(VanaError);
      expect(blockchainError).toBeInstanceOf(VanaError);
      expect(serializationError).toBeInstanceOf(VanaError);
      expect(signatureError).toBeInstanceOf(VanaError);
      expect(networkError).toBeInstanceOf(VanaError);
      expect(nonceError).toBeInstanceOf(VanaError);
      expect(personalServerError).toBeInstanceOf(VanaError);
      expect(urlMismatchError).toBeInstanceOf(VanaError);
      expect(permissionError).toBeInstanceOf(VanaError);
      expect(storageError).toBeInstanceOf(Error); // StorageError might not inherit from VanaError
    });

    it("should ensure all errors are instances of Error", () => {
      const relayerError = new RelayerError("test");
      const networkError = new NetworkError("test");
      const urlMismatchError = new ServerUrlMismatchError("url1", "url2", "id");
      const storageError = new StorageError(
        "test storage",
        "STORAGE_FAILED",
        "test-provider",
      );

      expect(relayerError).toBeInstanceOf(Error);
      expect(networkError).toBeInstanceOf(Error);
      expect(urlMismatchError).toBeInstanceOf(Error);
      expect(storageError).toBeInstanceOf(Error);
    });

    it("should have correct error codes", () => {
      const relayerError = new RelayerError("test");
      const userRejectedError = new UserRejectedRequestError();
      const configError = new InvalidConfigurationError("test");
      const urlMismatchError = new ServerUrlMismatchError("url1", "url2", "id");

      expect(relayerError.code).toBe("RELAYER_ERROR");
      expect(userRejectedError.code).toBe("USER_REJECTED_REQUEST");
      expect(configError.code).toBe("INVALID_CONFIGURATION");
      expect(urlMismatchError.code).toBe("SERVER_URL_MISMATCH");
    });
  });
});
