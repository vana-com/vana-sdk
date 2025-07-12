import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getContractController, __contractCache } from "../contractController";
import { VanaContract } from "../../abi";
import { createClient } from "../../core/client";
import { vanaMainnet, mokshaTestnet } from "../../config/chains";
import type { PublicClient, WalletClient as _WalletClient } from "viem";

// Mock client interface for testing
interface _MockClient {
  chain?: { id: number } | null | undefined;
  transport: Record<string, unknown>;
  readContract: ReturnType<typeof vi.fn>;
  writeContract: ReturnType<typeof vi.fn>;
}

// Mock dependencies
vi.mock("../../core/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("../../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../../abi", () => ({
  getAbi: vi.fn().mockReturnValue([
    {
      inputs: [],
      name: "testMethod",
      outputs: [],
      stateMutability: "view",
      type: "function",
    },
  ]),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    getContract: vi.fn(() => ({
      address: "0x1234567890123456789012345678901234567890",
      read: { testMethod: vi.fn() },
      write: { testMethod: vi.fn() },
    })),
  };
});

describe("contractController", () => {
  const mockClient = {
    chain: { id: mokshaTestnet.id },
    transport: {},
    readContract: vi.fn(),
    writeContract: vi.fn(),
  };

  const mockClientWithoutChain = {
    chain: undefined,
    transport: {},
    readContract: vi.fn(),
    writeContract: vi.fn(),
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Clear the controllers cache to avoid cross-test contamination
    __contractCache.clear();

    // Mock createClient to return our mock client
    vi.mocked(createClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof createClient>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getContractController", () => {
    it("should create a new controller when not cached", async () => {
      const { getContract } = await import("viem");
      const { getContractAddress } = await import("../../config/addresses");
      const { getAbi } = await import("../../abi");

      const controller = getContractController("DataRegistry");

      expect(getContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        client: mockClient,
      });

      expect(getContractAddress).toHaveBeenCalledWith(
        mokshaTestnet.id,
        "DataRegistry",
      );
      expect(getAbi).toHaveBeenCalledWith("DataRegistry");
      expect(controller).toBeDefined();
      expect(controller.address).toBe(
        "0x1234567890123456789012345678901234567890",
      );
    });

    it("should return cached controller when available", async () => {
      const { getContract } = await import("viem");

      // First call creates the controller
      const controller1 = getContractController("DataRegistry");

      // Second call should return the cached controller
      const controller2 = getContractController("DataRegistry");

      expect(controller1).toBe(controller2);
      expect(getContract).toHaveBeenCalledTimes(1);
    });

    it("should create different controllers for different contract types", async () => {
      const { getContract } = await import("viem");

      const dataRegistryController = getContractController("DataRegistry");
      const teePoolController = getContractController("TeePool");

      expect(dataRegistryController).not.toBe(teePoolController);
      expect(getContract).toHaveBeenCalledTimes(2);
    });

    it("should use provided client instead of default", async () => {
      const customClient = {
        chain: { id: vanaMainnet.id },
        transport: {},
        readContract: vi.fn(),
        writeContract: vi.fn(),
      };

      const { getContract } = await import("viem");
      const { getContractAddress } = await import("../../config/addresses");

      const controller = getContractController(
        "DataRegistry",
        customClient as unknown as PublicClient,
      );

      expect(getContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        client: customClient,
      });

      expect(getContractAddress).toHaveBeenCalledWith(
        vanaMainnet.id,
        "DataRegistry",
      );
      expect(controller).toBeDefined();
    });

    it("should fall back to vanaMainnet.id when client.chain is undefined", async () => {
      const { getContract } = await import("viem");
      const { getContractAddress } = await import("../../config/addresses");

      const controller = getContractController(
        "DataRegistry",
        mockClientWithoutChain as unknown as PublicClient,
      );

      expect(getContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        client: mockClientWithoutChain,
      });

      expect(getContractAddress).toHaveBeenCalledWith(
        vanaMainnet.id,
        "DataRegistry",
      );
      expect(controller).toBeDefined();
    });

    it("should handle client with null chain", async () => {
      const clientWithNullChain = {
        chain: null,
        transport: {},
        readContract: vi.fn(),
        writeContract: vi.fn(),
      };

      const { getContractAddress } = await import("../../config/addresses");

      const controller = getContractController(
        "DataRegistry",
        clientWithNullChain as unknown as PublicClient,
      );

      expect(getContractAddress).toHaveBeenCalledWith(
        vanaMainnet.id,
        "DataRegistry",
      );
      expect(controller).toBeDefined();
    });

    it("should work with all contract types", async () => {
      const contractTypes: VanaContract[] = [
        "DataRegistry",
        "TeePool",
        "DataLiquidityPool",
        "DataPermissions",
        "DLPRegistry",
      ];

      const { getContract } = await import("viem");
      const controllers = [];

      for (const contractType of contractTypes) {
        const controller = getContractController(contractType);
        controllers.push(controller);
        expect(controller).toBeDefined();
      }

      // Each contract type should create a separate controller
      expect(getContract).toHaveBeenCalledTimes(contractTypes.length);

      // All controllers should be different
      for (let i = 0; i < controllers.length; i++) {
        for (let j = i + 1; j < controllers.length; j++) {
          expect(controllers[i]).not.toBe(controllers[j]);
        }
      }
    });

    it("should use default client when no client provided", async () => {
      const { getContract } = await import("viem");

      const controller = getContractController("DataRegistry");

      expect(createClient).toHaveBeenCalled();
      expect(getContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        client: mockClient,
      });

      expect(controller).toBeDefined();
    });
  });

  describe("caching behavior", () => {
    it("should cache controllers per contract type", async () => {
      const { getContract } = await import("viem");

      // Create multiple controllers of the same type
      const controller1 = getContractController("DataRegistry");
      const controller2 = getContractController("DataRegistry");
      const controller3 = getContractController("DataRegistry");

      expect(controller1).toBe(controller2);
      expect(controller2).toBe(controller3);
      expect(getContract).toHaveBeenCalledTimes(1);
    });

    it("should maintain separate cache entries for different contract types", async () => {
      const { getContract } = await import("viem");

      const dataRegistry1 = getContractController("DataRegistry");
      const teePool1 = getContractController("TeePool");
      const dataRegistry2 = getContractController("DataRegistry");
      const teePool2 = getContractController("TeePool");

      expect(dataRegistry1).toBe(dataRegistry2);
      expect(teePool1).toBe(teePool2);
      expect(dataRegistry1).not.toBe(teePool1);
      expect(getContract).toHaveBeenCalledTimes(2);
    });
  });
});
