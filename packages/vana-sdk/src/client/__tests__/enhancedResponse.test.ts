import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Hash, TransactionReceipt } from "viem";
import {
  EnhancedTransactionResponse,
  canEnhanceResponse,
  enhanceResponse,
} from "../enhancedResponse";
import type { UnifiedRelayerResponse } from "../../types/relayer";
import { PollingManager } from "../../core/pollingManager";

// Mock the PollingManager
vi.mock("../../core/pollingManager");

describe("EnhancedTransactionResponse", () => {
  let mockSdk: any;
  const mockHash = "0x123456789" as Hash;
  const mockOperationId = "op-123";
  const mockReceipt: TransactionReceipt = {
    transactionHash: mockHash,
    blockNumber: 100n,
    status: "success",
  } as TransactionReceipt;

  beforeEach(() => {
    // Create a mock SDK instance
    mockSdk = {
      publicClient: {
        waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      },
      waitForTransactionEvents: vi.fn().mockResolvedValue({
        hash: mockHash,
        receipt: mockReceipt,
        expectedEvents: {
          FileAdded: {
            fileId: 123n,
            owner: "0xowner",
          },
        },
      }),
      relayer: vi.fn(),
    } as any;

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should extract hash and context from submitted response", () => {
      const response: UnifiedRelayerResponse = {
        type: "submitted",
        hash: mockHash,
        context: {
          contract: "DataRegistry",
          fn: "addFile" as any,
          from: "0xuser",
        },
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);

      expect(enhanced.hash).toBe(mockHash);
      expect(enhanced.context).toEqual({
        contract: "DataRegistry",
        fn: "addFile",
        from: "0xuser",
      });
      expect(enhanced.operationId).toBeUndefined();
    });

    it("should extract hash from signed response", () => {
      const response: UnifiedRelayerResponse = {
        type: "signed",
        hash: mockHash,
        context: {
          contract: "DataPortabilityPermissions",
          fn: "grant" as any,
          from: "0xuser",
        },
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);

      expect(enhanced.hash).toBe(mockHash);
      expect(enhanced.context).toEqual({
        contract: "DataPortabilityPermissions",
        fn: "grant",
        from: "0xuser",
      });
    });

    it("should extract operationId from pending response", () => {
      const response: UnifiedRelayerResponse = {
        type: "pending",
        operationId: mockOperationId,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);

      expect(enhanced.operationId).toBe(mockOperationId);
      expect(enhanced.hash).toBeUndefined();
      expect(enhanced.context).toBeUndefined();
    });
  });

  describe("wait()", () => {
    it("should return immediately for confirmed response", async () => {
      const response: UnifiedRelayerResponse = {
        type: "confirmed",
        hash: mockHash,
        receipt: mockReceipt,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      const result = await enhanced.wait();

      expect(result).toEqual({
        hash: mockHash,
        receipt: mockReceipt,
      });
      expect(mockSdk.waitForTransactionEvents).not.toHaveBeenCalled();
      expect(
        mockSdk.publicClient.waitForTransactionReceipt,
      ).not.toHaveBeenCalled();
    });

    it("should use waitForTransactionEvents for submitted response with context", async () => {
      const response: UnifiedRelayerResponse = {
        type: "submitted",
        hash: mockHash,
        context: {
          contract: "DataRegistry",
          fn: "addFile" as any,
          from: "0xuser",
        },
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      const result = await enhanced.wait();

      expect(mockSdk.waitForTransactionEvents).toHaveBeenCalledWith({
        hash: mockHash,
        from: "0xuser",
        contract: "DataRegistry",
        fn: "addFile",
      });
      expect(result).toEqual({
        hash: mockHash,
        receipt: mockReceipt,
        expectedEvents: {
          FileAdded: {
            fileId: 123n,
            owner: "0xowner",
          },
        },
      });
    });

    it("should use waitForTransactionReceipt for submitted response without context", async () => {
      const response: UnifiedRelayerResponse = {
        type: "submitted",
        hash: mockHash,
        // No context provided
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      const result = await enhanced.wait();

      expect(
        mockSdk.publicClient.waitForTransactionReceipt,
      ).toHaveBeenCalledWith({
        hash: mockHash,
      });
      expect(mockSdk.waitForTransactionEvents).not.toHaveBeenCalled();
      expect(result).toEqual({
        hash: mockHash,
        receipt: mockReceipt,
      });
    });

    it("should use PollingManager for pending response", async () => {
      const response: UnifiedRelayerResponse = {
        type: "pending",
        operationId: mockOperationId,
      };

      const mockPollingResult = {
        hash: mockHash,
        receipt: mockReceipt,
      };

      const mockStartPolling = vi.fn().mockResolvedValue(mockPollingResult);
      (PollingManager as any).mockImplementation(() => ({
        startPolling: mockStartPolling,
      }));

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      const result = await enhanced.wait({
        timeout: 5000,
        onStatusUpdate: vi.fn(),
      });

      expect(PollingManager).toHaveBeenCalledWith(mockSdk.relayer);
      expect(mockStartPolling).toHaveBeenCalledWith(
        mockOperationId,
        expect.objectContaining({
          timeout: 5000,
          onStatusUpdate: expect.any(Function),
        }),
      );
      expect(result).toEqual(mockPollingResult);
    });

    it("should throw error for pending response without relayer callback", async () => {
      const response: UnifiedRelayerResponse = {
        type: "pending",
        operationId: mockOperationId,
      };

      // SDK without relayer callback
      const sdkNoRelayer = {
        ...mockSdk,
        relayer: undefined,
      } as any;

      const enhanced = new EnhancedTransactionResponse(response, sdkNoRelayer);

      await expect(enhanced.wait()).rejects.toThrow(
        "Relayer callback not configured for polling",
      );
    });

    it("should throw error for unsupported response type", async () => {
      const response: UnifiedRelayerResponse = {
        type: "direct",
        result: { someData: "value" },
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);

      await expect(enhanced.wait()).rejects.toThrow(
        "Cannot wait on response type: direct",
      );
    });

    it("should throw error for error response type", async () => {
      const response: UnifiedRelayerResponse = {
        type: "error",
        error: "Something went wrong",
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);

      await expect(enhanced.wait()).rejects.toThrow(
        "Cannot wait on response type: error",
      );
    });
  });

  describe("canWait()", () => {
    it("should return true for submitted response", () => {
      const response: UnifiedRelayerResponse = {
        type: "submitted",
        hash: mockHash,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.canWait()).toBe(true);
    });

    it("should return true for signed response", () => {
      const response: UnifiedRelayerResponse = {
        type: "signed",
        hash: mockHash,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.canWait()).toBe(true);
    });

    it("should return true for pending response", () => {
      const response: UnifiedRelayerResponse = {
        type: "pending",
        operationId: mockOperationId,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.canWait()).toBe(true);
    });

    it("should return true for confirmed response", () => {
      const response: UnifiedRelayerResponse = {
        type: "confirmed",
        hash: mockHash,
        receipt: mockReceipt,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.canWait()).toBe(true);
    });

    it("should return false for direct response", () => {
      const response: UnifiedRelayerResponse = {
        type: "direct",
        result: { someData: "value" },
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.canWait()).toBe(false);
    });

    it("should return false for error response", () => {
      const response: UnifiedRelayerResponse = {
        type: "error",
        error: "Something went wrong",
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.canWait()).toBe(false);
    });
  });

  describe("getStatus()", () => {
    it("should return status for pending response", () => {
      const response: UnifiedRelayerResponse = {
        type: "pending",
        operationId: mockOperationId,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.getStatus()).toBe(
        `Operation pending (ID: ${mockOperationId})`,
      );
    });

    it("should return status for submitted response", () => {
      const response: UnifiedRelayerResponse = {
        type: "submitted",
        hash: mockHash,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.getStatus()).toBe(
        `Transaction submitted (Hash: ${mockHash})`,
      );
    });

    it("should return status for signed response", () => {
      const response: UnifiedRelayerResponse = {
        type: "signed",
        hash: mockHash,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.getStatus()).toBe(
        `Transaction submitted (Hash: ${mockHash})`,
      );
    });

    it("should return status for confirmed response", () => {
      const response: UnifiedRelayerResponse = {
        type: "confirmed",
        hash: mockHash,
        receipt: mockReceipt,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.getStatus()).toBe(
        `Transaction confirmed (Hash: ${mockHash})`,
      );
    });

    it("should return status for direct response", () => {
      const response: UnifiedRelayerResponse = {
        type: "direct",
        result: { someData: "value" },
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.getStatus()).toBe("Operation completed");
    });

    it("should return status for error response", () => {
      const errorMessage = "Transaction failed";
      const response: UnifiedRelayerResponse = {
        type: "error",
        error: errorMessage,
      };

      const enhanced = new EnhancedTransactionResponse(response, mockSdk);
      expect(enhanced.getStatus()).toBe(`Error: ${errorMessage}`);
    });
  });
});

describe("canEnhanceResponse", () => {
  it("should return true for enhanceable response types", () => {
    const enhanceableTypes: UnifiedRelayerResponse[] = [
      { type: "submitted", hash: "0x123" as Hash },
      { type: "signed", hash: "0x123" as Hash },
      { type: "pending", operationId: "op-123" },
      { type: "confirmed", hash: "0x123" as Hash },
    ];

    enhanceableTypes.forEach((response) => {
      expect(canEnhanceResponse(response)).toBe(true);
    });
  });

  it("should return false for non-enhanceable response types", () => {
    const nonEnhanceableTypes: UnifiedRelayerResponse[] = [
      { type: "direct", result: {} },
      { type: "error", error: "Failed" },
    ];

    nonEnhanceableTypes.forEach((response) => {
      expect(canEnhanceResponse(response)).toBe(false);
    });
  });
});

describe("enhanceResponse", () => {
  let mockSdk: any;

  beforeEach(() => {
    mockSdk = {
      publicClient: {},
      waitForTransactionEvents: vi.fn(),
    } as any;
  });

  it("should return EnhancedTransactionResponse for enhanceable response", () => {
    const response: UnifiedRelayerResponse = {
      type: "submitted",
      hash: "0x123" as Hash,
    };

    const enhanced = enhanceResponse(response, mockSdk);

    expect(enhanced).toBeInstanceOf(EnhancedTransactionResponse);
    expect(enhanced?.response).toBe(response);
  });

  it("should return null for non-enhanceable response", () => {
    const response: UnifiedRelayerResponse = {
      type: "direct",
      result: { someData: "value" },
    };

    const enhanced = enhanceResponse(response, mockSdk);

    expect(enhanced).toBeNull();
  });

  it("should preserve context when enhancing", () => {
    const response: UnifiedRelayerResponse = {
      type: "submitted",
      hash: "0x123" as Hash,
      context: {
        contract: "DataRegistry",
        fn: "addFile",
        from: "0xuser",
      },
    };

    const enhanced = enhanceResponse(response, mockSdk);

    expect(enhanced?.context).toEqual({
      contract: "DataRegistry",
      fn: "addFile",
      from: "0xuser",
    });
  });
});
