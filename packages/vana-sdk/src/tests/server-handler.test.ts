import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRelayerRequest } from "../server/handler";
import { SignatureError } from "../errors";
import type { Vana } from "../index.node";
import type { GenericTypedData } from "../types";
import { recoverTypedDataAddress } from "viem";

// Mock viem
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    recoverTypedDataAddress: vi.fn(),
  };
});

describe("handleRelayerRequest", () => {
  let mockVana: Vana;
  let mockTypedData: GenericTypedData;
  const mockSignature = "0x1234567890abcdef" as const;
  const mockUserAddress = "0xuser123" as const;
  const mockTxHash = "0xtxhash123" as const;

  beforeEach(() => {
    // Mock Vana SDK instance
    mockVana = {
      permissions: {
        submitSignedGrant: vi.fn().mockResolvedValue(mockTxHash),
        submitSignedRevoke: vi.fn().mockResolvedValue(mockTxHash),
        submitSignedTrustServer: vi.fn().mockResolvedValue(mockTxHash),
        submitSignedUntrustServer: vi.fn().mockResolvedValue(mockTxHash),
      },
    } as unknown as Vana;

    // Mock typed data
    mockTypedData = {
      domain: {
        name: "TestDomain",
        version: "1",
        chainId: 1,
        verifyingContract: "0xcontract",
      },
      types: {
        TestType: [{ name: "test", type: "string" }],
      },
      primaryType: "Permission",
      message: { test: "value" },
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  describe("signature verification", () => {
    it("should successfully verify valid signature", async () => {
      vi.mocked(recoverTypedDataAddress).mockResolvedValue(mockUserAddress);

      const result = await handleRelayerRequest(mockVana, {
        typedData: mockTypedData,
        signature: mockSignature,
        expectedUserAddress: mockUserAddress,
      });

      expect(result).toBe(mockTxHash);
      expect(recoverTypedDataAddress).toHaveBeenCalledWith({
        domain: mockTypedData.domain,
        types: mockTypedData.types,
        primaryType: mockTypedData.primaryType,
        message: mockTypedData.message,
        signature: mockSignature,
      });
    });

    it("should throw SignatureError when signature recovery fails", async () => {
      vi.mocked(recoverTypedDataAddress).mockResolvedValue(
        null as unknown as `0x${string}`,
      );

      await expect(
        handleRelayerRequest(mockVana, {
          typedData: mockTypedData,
          signature: mockSignature,
        }),
      ).rejects.toThrow(
        new SignatureError(
          "Invalid signature - could not recover signer address",
        ),
      );
    });

    it("should throw SignatureError when signer mismatch occurs", async () => {
      vi.mocked(recoverTypedDataAddress).mockResolvedValue("0xdifferent");

      await expect(
        handleRelayerRequest(mockVana, {
          typedData: mockTypedData,
          signature: mockSignature,
          expectedUserAddress: mockUserAddress,
        }),
      ).rejects.toThrow(SignatureError);
    });

    it("should work without expectedUserAddress verification", async () => {
      vi.mocked(recoverTypedDataAddress).mockResolvedValue("0xanyone");

      const result = await handleRelayerRequest(mockVana, {
        typedData: mockTypedData,
        signature: mockSignature,
        // No expectedUserAddress provided
      });

      expect(result).toBe(mockTxHash);
    });
  });

  describe("transaction type routing", () => {
    beforeEach(() => {
      vi.mocked(recoverTypedDataAddress).mockResolvedValue(mockUserAddress);
    });

    it("should route Permission type to submitSignedGrant", async () => {
      mockTypedData.primaryType = "Permission";

      await handleRelayerRequest(mockVana, {
        typedData: mockTypedData,
        signature: mockSignature,
      });

      expect(mockVana.permissions.submitSignedGrant).toHaveBeenCalledWith(
        mockTypedData,
        mockSignature,
      );
    });

    it("should route PermissionRevoke type to submitSignedRevoke", async () => {
      mockTypedData.primaryType = "PermissionRevoke";

      await handleRelayerRequest(mockVana, {
        typedData: mockTypedData,
        signature: mockSignature,
      });

      expect(mockVana.permissions.submitSignedRevoke).toHaveBeenCalledWith(
        mockTypedData,
        mockSignature,
      );
    });

    it("should route TrustServer type to submitSignedTrustServer", async () => {
      mockTypedData.primaryType = "TrustServer";

      await handleRelayerRequest(mockVana, {
        typedData: mockTypedData,
        signature: mockSignature,
      });

      expect(mockVana.permissions.submitSignedTrustServer).toHaveBeenCalledWith(
        mockTypedData,
        mockSignature,
      );
    });

    it("should route UntrustServer type to submitSignedUntrustServer", async () => {
      mockTypedData.primaryType = "UntrustServer";

      await handleRelayerRequest(mockVana, {
        typedData: mockTypedData,
        signature: mockSignature,
      });

      expect(
        mockVana.permissions.submitSignedUntrustServer,
      ).toHaveBeenCalledWith(mockTypedData, mockSignature);
    });

    it("should throw error for unsupported transaction type", async () => {
      mockTypedData.primaryType = "UnsupportedType";

      await expect(
        handleRelayerRequest(mockVana, {
          typedData: mockTypedData,
          signature: mockSignature,
        }),
      ).rejects.toThrow("Unsupported operation type: UnsupportedType");
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.mocked(recoverTypedDataAddress).mockResolvedValue(mockUserAddress);
    });

    it("should propagate SDK errors", async () => {
      const sdkError = new Error("SDK operation failed");
      vi.mocked(mockVana.permissions.submitSignedGrant).mockRejectedValue(
        sdkError,
      );

      await expect(
        handleRelayerRequest(mockVana, {
          typedData: mockTypedData,
          signature: mockSignature,
        }),
      ).rejects.toThrow(sdkError);
    });
  });
});
