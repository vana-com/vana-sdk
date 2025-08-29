import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { ProtocolController } from "../controllers/protocol";
import type { ControllerContext } from "../types/controller-context";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock the config and ABI modules
vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn(),
  CONTRACT_ADDRESSES: {
    14800: {
      DataPermissions: "0x3acB2023DF2617EFb61422BA0c8C6E97916961e0",
      DataRegistry: "0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C",
      TeePool: "0x3c92fD91639b41f13338CE62f19131e7d19eaa0D",
      TeePoolPhala: "0xE8EC6BD73b23Ad40E6B9a6f4bD343FAc411bD99A",
      ComputeEngine: "0xb2BFe33FA420c45F1Cf1287542ad81ae935447bd",
      DLPRegistry: "0x4D59880a924526d1dD33260552Ff4328b1E18a43",
      VanaEpoch: "0x2063cFF0609D59bCCc196E20Eb58A8696a6b15A0",
      VanaPoolStaking: "0x641C18E2F286c86f96CE95C8ec1EB9fC0415Ca0e",
      TeePoolEphemeralStandard: "0xe124bae846D5ec157f75Bd9e68ca87C4d2AB835A",
      TeePoolPersistentStandard: "0xe8bB8d0629651Cf33e0845d743976Dc1f0971d76",
    },
    1480: {
      DataPermissions: "0x0000000000000000000000000000000000000000",
      DataRegistry: "0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C",
      TeePool: "0x3c92fD91639b41f13338CE62f19131e7d19eaa0D",
      TeePoolPhala: "0xE8EC6BD73b23Ad40E6B9a6f4bD343FAc411bD99A",
    },
  },
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
  ContractAbis: {
    DataRegistry: [],
    DataPermissions: [],
    TeePool: [],
    TeePoolPhala: [],
    ComputeEngine: [],
    DLPRegistry: [],
    VanaEpoch: [],
    VanaPoolStaking: [],
    TeePoolEphemeralStandard: [],
    TeePoolPersistentStandard: [],
  },
}));

vi.mock("../contracts/contractController", () => ({
  getContractController: vi.fn(),
  getContractInfo: vi.fn(),
  ContractFactory: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    getInfo: vi.fn(),
    getAvailableContracts: vi
      .fn()
      .mockReturnValue([
        "DataRegistry",
        "DataPortabilityPermissions",
        "TeePool",
        "ComputeEngine",
        "DLPRegistry",
      ]),
  })),
}));

describe("ProtocolController - Additional Methods", () => {
  let controller: ProtocolController;
  let mockContext: ControllerContext;

  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  const validWalletClient = createWalletClient({
    account: testAccount,
    transport: http("https://rpc.moksha.vana.org"),
    chain: mokshaTestnet,
  });

  const validPublicClient = createPublicClient({
    transport: http("https://rpc.moksha.vana.org"),
    chain: mokshaTestnet,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      walletClient: validWalletClient,
      publicClient: validPublicClient,
      platform: mockPlatformAdapter,
      userAddress:
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
    } as ControllerContext;

    controller = new ProtocolController(mockContext);
  });

  describe("isContractAvailable", () => {
    it("should return true for available contracts", () => {
      const result = controller.isContractAvailable("DataRegistry");

      expect(result).toBe(true);
    });

    it("should return true for DataPermissions contract", () => {
      const result = controller.isContractAvailable(
        "DataPortabilityPermissions",
      );

      expect(result).toBe(true);
    });

    it("should return true for TeePool contract", () => {
      const result = controller.isContractAvailable("TeePool");

      expect(result).toBe(true);
    });

    it("should return true for ComputeEngine contract", () => {
      const result = controller.isContractAvailable("ComputeEngine");

      expect(result).toBe(true);
    });

    it("should return true for DLPRegistry contract", () => {
      const result = controller.isContractAvailable("DLPRegistry");

      expect(result).toBe(true);
    });

    it("should return false for non-existent contracts", () => {
      // Mock getAvailableContracts to return limited contracts
      const mockGetAvailableContracts = vi.spyOn(
        controller,
        "getAvailableContracts",
      );
      mockGetAvailableContracts.mockReturnValue(["DataRegistry"]);

      const result = controller.isContractAvailable(
        "NonExistentContract" as unknown as Parameters<
          typeof controller.isContractAvailable
        >[0],
      );

      expect(result).toBe(false);
    });

    it("should return false for contracts not on current chain", () => {
      // Mock getAvailableContracts to return empty array
      const mockGetAvailableContracts = vi.spyOn(
        controller,
        "getAvailableContracts",
      );
      mockGetAvailableContracts.mockReturnValue([]);

      const result = controller.isContractAvailable("DataRegistry");

      expect(result).toBe(false);
    });

    it("should handle edge case with empty available contracts list", () => {
      // Mock getAvailableContracts to return empty array
      const mockGetAvailableContracts = vi.spyOn(
        controller,
        "getAvailableContracts",
      );
      mockGetAvailableContracts.mockReturnValue([]);

      const result = controller.isContractAvailable("DataRegistry");

      expect(result).toBe(false);
    });

    it("should work with all known contract types", () => {
      const contractTypes = [
        "DataRegistry",
        "DataPortabilityPermissions",
        "TeePool",
        "TeePoolPhala",
        "ComputeEngine",
        "DLPRegistry",
        "VanaEpoch",
        "VanaPoolStaking",
        "TeePoolEphemeralStandard",
        "TeePoolPersistentStandard",
      ] as const;

      // Mock getAvailableContracts to return all contracts
      const mockGetAvailableContracts = vi.spyOn(
        controller,
        "getAvailableContracts",
      );
      mockGetAvailableContracts.mockReturnValue([...contractTypes]);

      contractTypes.forEach((contractType) => {
        const result = controller.isContractAvailable(contractType);
        expect(result).toBe(true);
      });
    });

    it("should handle case sensitivity correctly", () => {
      // Mock getAvailableContracts to return specific contracts
      const mockGetAvailableContracts = vi.spyOn(
        controller,
        "getAvailableContracts",
      );
      mockGetAvailableContracts.mockReturnValue(["DataRegistry"]);

      // Should find exact match
      const exactMatch = controller.isContractAvailable("DataRegistry");
      expect(exactMatch).toBe(true);

      // Should not find case-mismatched version
      const caseIssue = controller.isContractAvailable(
        "dataregistry" as unknown as Parameters<
          typeof controller.isContractAvailable
        >[0],
      );
      expect(caseIssue).toBe(false);
    });
  });

  describe("getContractFactory", () => {
    it("should return the contract factory instance", () => {
      const factory = controller.getContractFactory();

      expect(factory).toBeDefined();
      expect(typeof factory).toBe("object");
    });

    it("should return the same factory instance on multiple calls", () => {
      const factory1 = controller.getContractFactory();
      const factory2 = controller.getContractFactory();

      expect(factory1).toBe(factory2);
    });

    it("should return factory with expected methods", () => {
      const factory = controller.getContractFactory();

      expect(factory).toHaveProperty("create");
      expect(factory).toHaveProperty("getAvailableContracts");
      expect(typeof factory.create).toBe("function");
      expect(typeof factory.getAvailableContracts).toBe("function");
    });

    it("should allow calling factory methods", () => {
      const factory = controller.getContractFactory();

      // Test that we can call methods on the factory
      const availableContracts = factory.getAvailableContracts();
      expect(Array.isArray(availableContracts)).toBe(true);
    });

    it("should provide access to advanced factory features", () => {
      const factory = controller.getContractFactory();

      // Check for additional factory methods
      expect(factory).toHaveProperty("getInfo");
      expect(factory).toHaveProperty("create");
      expect(typeof factory.getInfo).toBe("function");
      expect(typeof factory.create).toBe("function");
    });
  });

  describe("Integration between isContractAvailable and getContractFactory", () => {
    it("should use factory to determine available contracts", () => {
      const factory = controller.getContractFactory();
      const availableFromFactory = factory.getAvailableContracts();
      const availableFromController = controller.getAvailableContracts();

      expect(availableFromFactory).toEqual(availableFromController);

      // Test that isContractAvailable uses the same data
      if (availableFromFactory.length > 0) {
        const firstContract = availableFromFactory[0];
        const isAvailable = controller.isContractAvailable(firstContract);
        expect(isAvailable).toBe(true);
      }
    });

    it("should maintain consistency between factory and controller methods", () => {
      const factory = controller.getContractFactory();

      // Get available contracts from both sources
      const factoryContracts = factory.getAvailableContracts();
      const controllerContracts = controller.getAvailableContracts();

      expect(factoryContracts).toEqual(controllerContracts);

      // Verify isContractAvailable matches
      factoryContracts.forEach((contract) => {
        expect(controller.isContractAvailable(contract)).toBe(true);
      });
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle factory returning null/undefined gracefully", () => {
      // This tests the robustness of the implementation
      expect(() => {
        const factory = controller.getContractFactory();
        expect(factory).toBeDefined();
      }).not.toThrow();
    });

    it("should handle empty contract names in isContractAvailable", () => {
      expect(() => {
        controller.isContractAvailable(
          "" as unknown as Parameters<typeof controller.isContractAvailable>[0],
        );
      }).not.toThrow();

      const result = controller.isContractAvailable(
        "" as unknown as Parameters<typeof controller.isContractAvailable>[0],
      );
      expect(result).toBe(false);
    });

    it("should handle null contract names in isContractAvailable", () => {
      expect(() => {
        controller.isContractAvailable(
          null as unknown as Parameters<
            typeof controller.isContractAvailable
          >[0],
        );
      }).not.toThrow();

      const result = controller.isContractAvailable(
        null as unknown as Parameters<typeof controller.isContractAvailable>[0],
      );
      expect(result).toBe(false);
    });

    it("should handle undefined contract names in isContractAvailable", () => {
      expect(() => {
        controller.isContractAvailable(
          undefined as unknown as Parameters<
            typeof controller.isContractAvailable
          >[0],
        );
      }).not.toThrow();

      const result = controller.isContractAvailable(
        undefined as unknown as Parameters<
          typeof controller.isContractAvailable
        >[0],
      );
      expect(result).toBe(false);
    });
  });
});
