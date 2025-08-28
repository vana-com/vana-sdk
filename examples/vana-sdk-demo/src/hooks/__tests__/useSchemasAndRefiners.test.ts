import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAccount, type UseAccountReturnType } from "wagmi";
import { useVana } from "@/providers/VanaProvider";
import { useSchemasAndRefiners } from "../useSchemasAndRefiners";
import type {
  Schema,
  Refiner,
  CreateSchemaParams,
  AddRefinerParams,
  UpdateSchemaIdParams,
  VanaInstance,
} from "@opendatalabs/vana-sdk/browser";

// Mock dependencies
vi.mock("wagmi");
vi.mock("@/providers/VanaProvider");

const useAccountMock = useAccount as MockedFunction<typeof useAccount>;
const useVanaMock = useVana as MockedFunction<typeof useVana>;

describe("useSchemasAndRefiners", () => {
  const mockVana = {
    schemas: {
      count: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
    },
    data: {
      getRefinersCount: vi.fn(),
      getRefiner: vi.fn(),
      addSchema: vi.fn(),
      addRefiner: vi.fn(),
      updateSchemaId: vi.fn(),
    },
  };

  const mockSchemas: Schema[] = [
    {
      id: 1,
      name: "Schema 1",
      dialect: "json",
      definitionUrl: "https://schema1.com",
    },
    {
      id: 2,
      name: "Schema 2",
      dialect: "sqlite",
      definitionUrl: "https://schema2.com",
    },
  ];

  const mockRefiners: Refiner[] = [
    {
      id: 1,
      name: "Refiner 1",
      dlpId: 1,
      owner: "0x123" as `0x${string}`,
      schemaId: 1,
      refinementInstructionUrl: "https://refiner1.com",
    },
    {
      id: 2,
      name: "Refiner 2",
      dlpId: 2,
      owner: "0x456" as `0x${string}`,
      schemaId: 2,
      refinementInstructionUrl: "https://refiner2.com",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    useAccountMock.mockReturnValue({
      address: "0x123",
      addresses: ["0x123" as `0x${string}`],
      chain: undefined,
      chainId: 14800,
      connector: undefined,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: "connected",
    } as unknown as UseAccountReturnType);

    useVanaMock.mockReturnValue({
      vana: mockVana as unknown as VanaInstance,
      isInitialized: true,
      error: null,
      applicationAddress: "0xapp123",
    });

    mockVana.schemas.count.mockResolvedValue(2);
    mockVana.schemas.get.mockImplementation((id: number) =>
      Promise.resolve(mockSchemas.find((s) => s.id === id)),
    );
    mockVana.data.getRefinersCount.mockResolvedValue(2);
    mockVana.data.getRefiner.mockImplementation((id: number) =>
      Promise.resolve(mockRefiners.find((r) => r.id === id)),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("returns default state when initialized", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      // Initially loading should be true since the hook auto-loads when vana and address are available
      expect(result.current.schemas).toEqual([]);
      expect(result.current.isLoadingSchemas).toBe(true);
      expect(result.current.schemasCount).toBe(0);
      expect(result.current.schemaName).toBe("");
      expect(result.current.schemaType).toBe("");
      expect(result.current.schemaDefinition).toBe("");
      expect(result.current.isCreatingSchema).toBe(false);
      expect(result.current.schemaStatus).toBe("");
      expect(result.current.lastCreatedSchemaId).toBe(null);

      expect(result.current.refiners).toEqual([]);
      expect(result.current.isLoadingRefiners).toBe(true);
      expect(result.current.refinersCount).toBe(0);
      expect(result.current.refinerName).toBe("");
      expect(result.current.refinerDlpId).toBe("");
      expect(result.current.refinerSchemaId).toBe("");
      expect(result.current.refinerInstructionUrl).toBe("");
      expect(result.current.isCreatingRefiner).toBe(false);
      expect(result.current.refinerStatus).toBe("");
      expect(result.current.lastCreatedRefinerId).toBe(null);

      expect(result.current.updateRefinerId).toBe("");
      expect(result.current.updateSchemaId).toBe("");
      expect(result.current.isUpdatingSchema).toBe(false);
      expect(result.current.updateSchemaStatus).toBe("");

      // Wait for auto-loading to complete
      await waitFor(() => {
        expect(result.current.isLoadingSchemas).toBe(false);
        expect(result.current.isLoadingRefiners).toBe(false);
        expect(result.current.schemas).toHaveLength(2);
        expect(result.current.refiners).toHaveLength(2);
      });
    });

    it("loads schemas and refiners automatically when vana and address are available", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      await waitFor(() => {
        expect(result.current.schemas).toHaveLength(2);
        expect(result.current.refiners).toHaveLength(2);
      });

      expect(mockVana.schemas.count).toHaveBeenCalled();
      expect(mockVana.schemas.get).toHaveBeenCalledWith(1);
      expect(mockVana.schemas.get).toHaveBeenCalledWith(2);
      expect(result.current.schemasCount).toBe(2);
      expect(result.current.schemas[0]).toEqual({
        ...mockSchemas[0],
        source: "discovered",
      });

      expect(mockVana.data.getRefinersCount).toHaveBeenCalled();
      expect(mockVana.data.getRefiner).toHaveBeenCalledWith(1);
      expect(mockVana.data.getRefiner).toHaveBeenCalledWith(2);
      expect(result.current.refinersCount).toBe(2);
      expect(result.current.refiners[0]).toEqual({
        ...mockRefiners[0],
        source: "discovered",
      });
    });

    it("does not load when vana is not available", () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      renderHook(() => useSchemasAndRefiners());

      expect(mockVana.schemas.count).not.toHaveBeenCalled();
      expect(mockVana.data.getRefinersCount).not.toHaveBeenCalled();
    });

    it("does not load when address is not available", () => {
      useAccountMock.mockReturnValue({
        address: undefined,
        addresses: [],
        chain: undefined,
        chainId: undefined,
        connector: undefined,
        isConnected: false,
        isConnecting: false,
        isDisconnected: true,
        isReconnecting: false,
        status: "disconnected",
      } as unknown as UseAccountReturnType);

      renderHook(() => useSchemasAndRefiners());

      expect(mockVana.schemas.count).not.toHaveBeenCalled();
      expect(mockVana.data.getRefinersCount).not.toHaveBeenCalled();
    });
  });

  describe("loadSchemas", () => {
    it("successfully loads schemas with discovered source", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      await act(async () => {
        await result.current.loadSchemas();
      });

      expect(mockVana.schemas.count).toHaveBeenCalled();
      expect(result.current.schemasCount).toBe(2);
      expect(result.current.schemas).toHaveLength(2);
      expect(result.current.schemas[0].source).toBe("discovered");
      expect(result.current.isLoadingSchemas).toBe(false);
    });

    it("handles errors when loading schemas fails", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.schemas.count.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useSchemasAndRefiners());

      await act(async () => {
        await result.current.loadSchemas();
      });

      expect(result.current.isLoadingSchemas).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load schemas:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("handles individual schema loading failures gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockVana.schemas.get.mockImplementation((id: number) => {
        if (id === 2) {
          return Promise.reject(new Error("Schema not found"));
        }
        return Promise.resolve(mockSchemas.find((s) => s.id === id));
      });

      const { result } = renderHook(() => useSchemasAndRefiners());

      await act(async () => {
        await result.current.loadSchemas();
      });

      expect(result.current.schemas).toHaveLength(1);
      expect(result.current.schemas[0].id).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load schema 2:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("limits to 10 schemas when more are available", async () => {
      mockVana.schemas.count.mockResolvedValue(15);

      const { result } = renderHook(() => useSchemasAndRefiners());

      // Wait for auto-loading to complete first
      await waitFor(() => {
        expect(result.current.isLoadingSchemas).toBe(false);
      });

      // Clear mocks to count only the explicit call
      vi.clearAllMocks();
      mockVana.schemas.count.mockResolvedValue(15);

      await act(async () => {
        await result.current.loadSchemas();
      });

      expect(mockVana.schemas.get).toHaveBeenCalledTimes(10);
      expect(result.current.schemasCount).toBe(15);
    });

    it("does not load when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => useSchemasAndRefiners());

      await act(async () => {
        await result.current.loadSchemas();
      });

      expect(mockVana.schemas.count).not.toHaveBeenCalled();
    });
  });

  describe("loadRefiners", () => {
    it("successfully loads refiners with discovered source", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      await act(async () => {
        await result.current.loadRefiners();
      });

      expect(mockVana.data.getRefinersCount).toHaveBeenCalled();
      expect(result.current.refinersCount).toBe(2);
      expect(result.current.refiners).toHaveLength(2);
      expect(result.current.refiners[0].source).toBe("discovered");
      expect(result.current.isLoadingRefiners).toBe(false);
    });

    it("handles errors when loading refiners fails", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.getRefinersCount.mockRejectedValue(
        new Error("Network error"),
      );

      const { result } = renderHook(() => useSchemasAndRefiners());

      await act(async () => {
        await result.current.loadRefiners();
      });

      expect(result.current.isLoadingRefiners).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load refiners:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("handles individual refiner loading failures gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockVana.data.getRefiner.mockImplementation((id: number) => {
        if (id === 2) {
          return Promise.reject(new Error("Refiner not found"));
        }
        return Promise.resolve(mockRefiners.find((r) => r.id === id));
      });

      const { result } = renderHook(() => useSchemasAndRefiners());

      await act(async () => {
        await result.current.loadRefiners();
      });

      expect(result.current.refiners).toHaveLength(1);
      expect(result.current.refiners[0].id).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load refiner 2:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("handleCreateSchema", () => {
    it("successfully creates schema with valid inputs", async () => {
      mockVana.schemas.create.mockResolvedValue({
        schemaId: 3,
        definitionUrl: "ipfs://QmNewSchema",
        transactionHash: "0xnewtx",
      });

      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setSchemaName("New Schema");
        result.current.setSchemaType("json");
        result.current.setSchemaDefinition(
          '{"type": "object", "properties": {}}',
        );
      });

      await act(async () => {
        await result.current.handleCreateSchema();
      });

      const expectedParams: CreateSchemaParams = {
        name: "New Schema",
        dialect: "json",
        schema: { type: "object", properties: {} },
      };

      expect(mockVana.schemas.create).toHaveBeenCalledWith(expectedParams);
      expect(result.current.schemaStatus).toContain(
        "✅ Schema created with ID: 3",
      );
      expect(result.current.lastCreatedSchemaId).toBe(3);
      expect(result.current.schemaName).toBe(""); // Form cleared
      expect(result.current.schemaType).toBe("");
      expect(result.current.schemaDefinition).toBe("");
      expect(result.current.isCreatingSchema).toBe(false);
    });

    it("validates schema name is provided", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setSchemaName("  ");
        result.current.setSchemaType("json");
        result.current.setSchemaDefinition("https://schema.com");
      });

      await act(async () => {
        await result.current.handleCreateSchema();
      });

      expect(result.current.schemaStatus).toBe(
        "❌ Please fill in all schema fields",
      );
      expect(mockVana.data.addSchema).not.toHaveBeenCalled();
    });

    it("validates schema type is provided", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setSchemaName("Schema");
        result.current.setSchemaType("");
        result.current.setSchemaDefinition("https://schema.com");
      });

      await act(async () => {
        await result.current.handleCreateSchema();
      });

      expect(result.current.schemaStatus).toBe(
        "❌ Please fill in all schema fields",
      );
      expect(mockVana.data.addSchema).not.toHaveBeenCalled();
    });

    it("validates schema definition URL is provided", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setSchemaName("Schema");
        result.current.setSchemaType("json");
        result.current.setSchemaDefinition("  ");
      });

      await act(async () => {
        await result.current.handleCreateSchema();
      });

      expect(result.current.schemaStatus).toBe(
        "❌ Please fill in all schema fields",
      );
      expect(mockVana.data.addSchema).not.toHaveBeenCalled();
    });

    it("handles schema creation errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.schemas.create.mockRejectedValue(new Error("Creation failed"));

      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setSchemaName("Schema");
        result.current.setSchemaType("json");
        // Use valid JSON so we get past the parsing and hit the mock error
        result.current.setSchemaDefinition('{"type": "object"}');
      });

      await act(async () => {
        await result.current.handleCreateSchema();
      });

      expect(result.current.schemaStatus).toBe("❌ Error: Creation failed");
      expect(result.current.isCreatingSchema).toBe(false);

      consoleSpy.mockRestore();
    });

    it("does not create when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setSchemaName("Schema");
        result.current.setSchemaType("json");
        result.current.setSchemaDefinition("https://schema.com");
      });

      await act(async () => {
        await result.current.handleCreateSchema();
      });

      expect(result.current.schemaStatus).toBe(
        "❌ Please fill in all schema fields",
      );
      expect(mockVana.data.addSchema).not.toHaveBeenCalled();
    });
  });

  describe("handleCreateRefiner", () => {
    it("successfully creates refiner with valid inputs", async () => {
      mockVana.data.addRefiner.mockResolvedValue({ refinerId: 3 });

      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setRefinerName("New Refiner");
        result.current.setRefinerDlpId("1");
        result.current.setRefinerSchemaId("2");
        result.current.setRefinerInstructionUrl("https://instructions.com");
      });

      await act(async () => {
        await result.current.handleCreateRefiner();
      });

      const expectedParams: AddRefinerParams = {
        name: "New Refiner",
        dlpId: 1,
        schemaId: 2,
        refinementInstructionUrl: "https://instructions.com",
      };

      expect(mockVana.data.addRefiner).toHaveBeenCalledWith(expectedParams);
      expect(result.current.refinerStatus).toContain(
        "✅ Refiner created with ID: 3",
      );
      expect(result.current.lastCreatedRefinerId).toBe(3);
      expect(result.current.refinerName).toBe(""); // Form cleared
      expect(result.current.refinerDlpId).toBe("");
      expect(result.current.refinerSchemaId).toBe("");
      expect(result.current.refinerInstructionUrl).toBe("");
      expect(result.current.isCreatingRefiner).toBe(false);
    });

    it("validates all refiner fields are provided", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setRefinerName("");
        result.current.setRefinerDlpId("1");
        result.current.setRefinerSchemaId("2");
        result.current.setRefinerInstructionUrl("https://instructions.com");
      });

      await act(async () => {
        await result.current.handleCreateRefiner();
      });

      expect(result.current.refinerStatus).toBe(
        "❌ Please fill in all refiner fields",
      );
      expect(mockVana.data.addRefiner).not.toHaveBeenCalled();
    });

    it("validates DLP ID is a valid number", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setRefinerName("Refiner");
        result.current.setRefinerDlpId("invalid");
        result.current.setRefinerSchemaId("2");
        result.current.setRefinerInstructionUrl("https://instructions.com");
      });

      await act(async () => {
        await result.current.handleCreateRefiner();
      });

      expect(result.current.refinerStatus).toBe(
        "❌ DLP ID and Schema ID must be valid numbers",
      );
      expect(mockVana.data.addRefiner).not.toHaveBeenCalled();
    });

    it("validates Schema ID is a valid number", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setRefinerName("Refiner");
        result.current.setRefinerDlpId("1");
        result.current.setRefinerSchemaId("invalid");
        result.current.setRefinerInstructionUrl("https://instructions.com");
      });

      await act(async () => {
        await result.current.handleCreateRefiner();
      });

      expect(result.current.refinerStatus).toBe(
        "❌ DLP ID and Schema ID must be valid numbers",
      );
      expect(mockVana.data.addRefiner).not.toHaveBeenCalled();
    });

    it("handles refiner creation errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.addRefiner.mockRejectedValue(new Error("Creation failed"));

      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setRefinerName("Refiner");
        result.current.setRefinerDlpId("1");
        result.current.setRefinerSchemaId("2");
        result.current.setRefinerInstructionUrl("https://instructions.com");
      });

      await act(async () => {
        await result.current.handleCreateRefiner();
      });

      expect(result.current.refinerStatus).toBe("❌ Error: Creation failed");
      expect(result.current.isCreatingRefiner).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe("handleUpdateSchemaId", () => {
    it("successfully updates schema ID with valid inputs", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setUpdateRefinerId("1");
        result.current.setUpdateSchemaId("3");
      });

      await act(async () => {
        await result.current.handleUpdateSchemaId();
      });

      const expectedParams: UpdateSchemaIdParams = {
        refinerId: 1,
        newSchemaId: 3,
      };

      expect(mockVana.data.updateSchemaId).toHaveBeenCalledWith(expectedParams);
      expect(result.current.updateSchemaStatus).toBe(
        "✅ Schema ID updated successfully!",
      );
      expect(result.current.updateRefinerId).toBe(""); // Form cleared
      expect(result.current.updateSchemaId).toBe("");
      expect(result.current.isUpdatingSchema).toBe(false);
    });

    it("validates refiner ID is provided", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setUpdateRefinerId("  ");
        result.current.setUpdateSchemaId("3");
      });

      await act(async () => {
        await result.current.handleUpdateSchemaId();
      });

      expect(result.current.updateSchemaStatus).toBe(
        "❌ Please provide both refiner ID and new schema ID",
      );
      expect(mockVana.data.updateSchemaId).not.toHaveBeenCalled();
    });

    it("validates schema ID is provided", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setUpdateRefinerId("1");
        result.current.setUpdateSchemaId("  ");
      });

      await act(async () => {
        await result.current.handleUpdateSchemaId();
      });

      expect(result.current.updateSchemaStatus).toBe(
        "❌ Please provide both refiner ID and new schema ID",
      );
      expect(mockVana.data.updateSchemaId).not.toHaveBeenCalled();
    });

    it("validates IDs are valid numbers", async () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setUpdateRefinerId("invalid");
        result.current.setUpdateSchemaId("3");
      });

      await act(async () => {
        await result.current.handleUpdateSchemaId();
      });

      expect(result.current.updateSchemaStatus).toBe(
        "❌ Both IDs must be valid numbers",
      );
      expect(mockVana.data.updateSchemaId).not.toHaveBeenCalled();
    });

    it("handles update errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.updateSchemaId.mockRejectedValue(
        new Error("Update failed"),
      );

      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setUpdateRefinerId("1");
        result.current.setUpdateSchemaId("3");
      });

      await act(async () => {
        await result.current.handleUpdateSchemaId();
      });

      expect(result.current.updateSchemaStatus).toBe("❌ Error: Update failed");
      expect(result.current.isUpdatingSchema).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe("wallet disconnection cleanup", () => {
    it("clears all state when wallet disconnects", () => {
      const { result, rerender } = renderHook(() => useSchemasAndRefiners());

      // Set some state
      act(() => {
        result.current.setSchemaName("Test Schema");
        result.current.setSchemaType("json");
        result.current.setRefinerName("Test Refiner");
        result.current.setRefinerDlpId("1");
        result.current.setUpdateRefinerId("2");
      });

      // Simulate wallet disconnection
      useAccountMock.mockReturnValue({
        address: undefined,
        addresses: [],
        chain: undefined,
        chainId: undefined,
        connector: undefined,
        isConnected: false,
        isConnecting: false,
        isDisconnected: true,
        isReconnecting: false,
        status: "disconnected",
      } as unknown as UseAccountReturnType);

      rerender();

      expect(result.current.schemas).toEqual([]);
      expect(result.current.refiners).toEqual([]);
      expect(result.current.schemaName).toBe("");
      expect(result.current.schemaType).toBe("");
      expect(result.current.schemaDefinition).toBe("");
      expect(result.current.refinerName).toBe("");
      expect(result.current.refinerDlpId).toBe("");
      expect(result.current.refinerSchemaId).toBe("");
      expect(result.current.refinerInstructionUrl).toBe("");
      expect(result.current.updateRefinerId).toBe("");
      expect(result.current.updateSchemaId).toBe("");
    });
  });

  describe("setters", () => {
    it("all setters update state correctly", () => {
      const { result } = renderHook(() => useSchemasAndRefiners());

      act(() => {
        result.current.setSchemaName("Test Schema");
        result.current.setSchemaType("json");
        result.current.setSchemaDefinition("https://test.com");
        result.current.setRefinerName("Test Refiner");
        result.current.setRefinerDlpId("1");
        result.current.setRefinerSchemaId("2");
        result.current.setRefinerInstructionUrl("https://instructions.com");
        result.current.setUpdateRefinerId("3");
        result.current.setUpdateSchemaId("4");
      });

      expect(result.current.schemaName).toBe("Test Schema");
      expect(result.current.schemaType).toBe("json");
      expect(result.current.schemaDefinition).toBe("https://test.com");
      expect(result.current.refinerName).toBe("Test Refiner");
      expect(result.current.refinerDlpId).toBe("1");
      expect(result.current.refinerSchemaId).toBe("2");
      expect(result.current.refinerInstructionUrl).toBe(
        "https://instructions.com",
      );
      expect(result.current.updateRefinerId).toBe("3");
      expect(result.current.updateSchemaId).toBe("4");
    });
  });
});
