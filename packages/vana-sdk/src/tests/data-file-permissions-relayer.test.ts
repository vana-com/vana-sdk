import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import {
  generateEncryptionKey,
  encryptWithWalletPublicKey,
} from "../utils/encryption";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../generated/abi";
import { type Address, type Hash } from "viem";

// Mock dependencies
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn(),
  encryptWithWalletPublicKey: vi.fn(),
  DEFAULT_ENCRYPTION_SEED: "Please sign to retrieve your encryption key",
}));

vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn(),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn(),
}));

vi.mock("../utils/transactionHandle", () => {
  class MockTransactionHandle {
    constructor(
      public context: any,
      public hash: string,
      public operation?: string,
    ) {}
  }
  return {
    TransactionHandle: MockTransactionHandle,
  };
});

describe("DataController - File Permission Relayer Support", () => {
  let controller: DataController;
  let mockContext: ControllerContext;
  let mockRelayerCallbacks: ControllerContext["relayerCallbacks"];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocked functions
    vi.mocked(getContractAddress).mockReturnValue("0xDataRegistry" as Address);
    vi.mocked(getAbi).mockReturnValue([]);
    vi.mocked(generateEncryptionKey).mockResolvedValue("user-encryption-key");
    vi.mocked(encryptWithWalletPublicKey).mockResolvedValue("encrypted-key");

    // Create mock relayer callbacks
    mockRelayerCallbacks = {
      submitFilePermission: vi
        .fn()
        .mockResolvedValue("0xRelayerTxHash" as Hash),
    };

    // Create mock context with relayer callbacks
    mockContext = {
      walletClient: {
        account: { address: "0xUserAddress" as Address },
        chain: { id: 14800, name: "Moksha Testnet" },
        writeContract: vi.fn().mockResolvedValue("0xDirectTxHash" as Hash),
        getAddresses: vi.fn().mockResolvedValue(["0xUserAddress" as Address]),
      } as any,
      publicClient: {} as any,
      platform: mockPlatformAdapter,
      relayerCallbacks: mockRelayerCallbacks,
    };

    controller = new DataController(mockContext);
  });

  describe("submitFilePermission with relayer", () => {
    it("should use relayer callback when available for gasless transaction", async () => {
      const fileId = 123;
      const account = "0xRecipientAddress" as Address;
      const publicKey = "recipient-public-key";

      const result = await controller.submitFilePermission(
        fileId,
        account,
        publicKey,
      );

      // Verify encryption key generation
      expect(generateEncryptionKey).toHaveBeenCalledWith(
        mockContext.walletClient,
        mockContext.platform,
        "Please sign to retrieve your encryption key",
      );

      // Verify key encryption with recipient's public key
      expect(encryptWithWalletPublicKey).toHaveBeenCalledWith(
        "user-encryption-key",
        publicKey,
        mockContext.platform,
      );

      // Verify relayer callback was used
      expect(mockRelayerCallbacks.submitFilePermission).toHaveBeenCalledWith({
        fileId,
        account,
        encryptedKey: "encrypted-key",
        userAddress: "0xUserAddress",
      });

      // Verify direct contract write was NOT called
      expect(mockContext.walletClient.writeContract).not.toHaveBeenCalled();

      // Verify transaction handle was created with relayer hash
      expect(result).toBeDefined();
      expect(result.hash).toBe("0xRelayerTxHash");
      expect(result.operation).toBe("addFilePermission");
    });

    it("should fall back to direct transaction when relayer is not available", async () => {
      // Remove relayer callbacks
      const contextWithoutRelayer = {
        ...mockContext,
        relayerCallbacks: undefined,
      };
      const controllerWithoutRelayer = new DataController(
        contextWithoutRelayer,
      );

      const fileId = 456;
      const account = "0xRecipientAddress" as Address;
      const publicKey = "recipient-public-key";

      const result = await controllerWithoutRelayer.submitFilePermission(
        fileId,
        account,
        publicKey,
      );

      // Verify encryption steps still occur
      expect(generateEncryptionKey).toHaveBeenCalled();
      expect(encryptWithWalletPublicKey).toHaveBeenCalledWith(
        "user-encryption-key",
        publicKey,
        mockContext.platform,
      );

      // Verify direct contract write was called
      expect(mockContext.walletClient.writeContract).toHaveBeenCalledWith({
        address: "0xDataRegistry",
        abi: [],
        functionName: "addFilePermission",
        args: [BigInt(fileId), account, "encrypted-key"],
        account: { address: "0xUserAddress" },
        chain: { id: 14800, name: "Moksha Testnet" },
      });

      // Verify transaction handle was created with direct hash
      expect(result).toBeDefined();
      expect(result.hash).toBe("0xDirectTxHash");
      expect(result.operation).toBe("addFilePermission");
    });

    it("should handle relayer callback errors gracefully", async () => {
      mockRelayerCallbacks.submitFilePermission = vi
        .fn()
        .mockRejectedValue(new Error("Relayer unavailable"));

      const fileId = 789;
      const account = "0xRecipientAddress" as Address;
      const publicKey = "recipient-public-key";

      await expect(
        controller.submitFilePermission(fileId, account, publicKey),
      ).rejects.toThrow(
        "Failed to add permission to file: Relayer unavailable",
      );
    });

    it("should handle missing chain ID error", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined,
        },
        relayerCallbacks: undefined, // Force direct transaction path
      };
      const controllerWithoutChain = new DataController(contextWithoutChain);

      const fileId = 999;
      const account = "0xRecipientAddress" as Address;
      const publicKey = "recipient-public-key";

      await expect(
        controllerWithoutChain.submitFilePermission(fileId, account, publicKey),
      ).rejects.toThrow(
        "Failed to add permission to file: Chain ID not available",
      );
    });

    it("should handle encryption key generation errors", async () => {
      vi.mocked(generateEncryptionKey).mockRejectedValue(
        new Error("User rejected signature"),
      );

      const fileId = 111;
      const account = "0xRecipientAddress" as Address;
      const publicKey = "recipient-public-key";

      await expect(
        controller.submitFilePermission(fileId, account, publicKey),
      ).rejects.toThrow(
        "Failed to add permission to file: User rejected signature",
      );
    });

    it("should handle public key encryption errors", async () => {
      vi.mocked(encryptWithWalletPublicKey).mockRejectedValue(
        new Error("Invalid public key format"),
      );

      const fileId = 222;
      const account = "0xRecipientAddress" as Address;
      const publicKey = "invalid-public-key";

      await expect(
        controller.submitFilePermission(fileId, account, publicKey),
      ).rejects.toThrow(
        "Failed to add permission to file: Invalid public key format",
      );
    });

    it("should get user address when account is not set", async () => {
      const contextWithoutAccount = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          account: undefined,
        },
      };

      // Mock getUserAddress method
      const getUserAddressSpy = vi
        .spyOn(DataController.prototype as any, "getUserAddress")
        .mockResolvedValue("0xDerivedAddress" as Address);

      const controllerWithoutAccount = new DataController(
        contextWithoutAccount,
      );

      const fileId = 333;
      const account = "0xRecipientAddress" as Address;
      const publicKey = "recipient-public-key";

      await controllerWithoutAccount.submitFilePermission(
        fileId,
        account,
        publicKey,
      );

      // Verify getUserAddress was called
      expect(getUserAddressSpy).toHaveBeenCalled();

      // Verify relayer was called with derived address
      expect(mockRelayerCallbacks.submitFilePermission).toHaveBeenCalledWith({
        fileId,
        account,
        encryptedKey: "encrypted-key",
        userAddress: "0xDerivedAddress",
      });

      getUserAddressSpy.mockRestore();
    });
  });

  describe("composeFilePermissionMessage", () => {
    it("should create valid EIP-712 typed data for file permission", async () => {
      // Access the private method through type assertion
      const composeMessage = (
        controller as any
      ).composeFilePermissionMessage.bind(controller);

      const params = {
        nonce: BigInt(5),
        fileId: 123,
        account: "0xRecipientAddress" as Address,
        encryptedKey: "encrypted-key-data",
      };

      const typedData = await composeMessage(params);

      // Verify domain
      expect(typedData.domain).toEqual({
        name: "VanaDataRegistry",
        version: "1",
        chainId: 14800,
        verifyingContract: "0xDataRegistry",
      });

      // Verify types
      expect(typedData.types).toEqual({
        FilePermission: [
          { name: "nonce", type: "uint256" },
          { name: "fileId", type: "uint256" },
          { name: "account", type: "address" },
          { name: "encryptedKey", type: "string" },
        ],
      });

      // Verify primary type
      expect(typedData.primaryType).toBe("FilePermission");

      // Verify message
      expect(typedData.message).toEqual({
        nonce: BigInt(5),
        fileId: 123,
        account: "0xRecipientAddress",
        encryptedKey: "encrypted-key-data",
      });
    });

    it("should throw error when chain ID is not available", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined,
        },
      };
      const controllerWithoutChain = new DataController(contextWithoutChain);

      const composeMessage = (
        controllerWithoutChain as any
      ).composeFilePermissionMessage.bind(controllerWithoutChain);

      const params = {
        nonce: BigInt(5),
        fileId: 123,
        account: "0xRecipientAddress" as Address,
        encryptedKey: "encrypted-key-data",
      };

      await expect(composeMessage(params)).rejects.toThrow(
        "Chain ID not available",
      );
    });
  });
});
