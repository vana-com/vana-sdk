import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  MockedFunction,
} from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAccount } from "wagmi";
import { useVana } from "@/providers/VanaProvider";
import { useTrustedServers } from "../useTrustedServers";
import { addToast } from "@heroui/react";

// Mock dependencies
vi.mock("wagmi");
vi.mock("@/providers/VanaProvider");
vi.mock("@heroui/react", () => ({
  addToast: vi.fn(),
}));

// Mock environment variables
process.env.NEXT_PUBLIC_SUBGRAPH_URL =
  "http://localhost:8000/subgraphs/name/vana";
process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL = "http://localhost:3001";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const useAccountMock = useAccount as MockedFunction<typeof useAccount>;
const useVanaMock = useVana as MockedFunction<typeof useVana>;
const addToastMock = addToast as MockedFunction<typeof addToast>;

interface TrustedServer {
  id: string;
  serverAddress: string;
  serverUrl: string;
  trustedAt: bigint;
  user: string;
  name?: string;
}

describe("useTrustedServers", () => {
  const mockVana = {
    data: {
      getUserTrustedServers: vi.fn(),
    },
    permissions: {
      trustServer: vi.fn(),
      trustServerWithSignature: vi.fn(),
      untrustServerWithSignature: vi.fn(),
    },
  };

  const mockTrustedServers: TrustedServer[] = [
    {
      id: "1",
      serverAddress: "0xserver1",
      serverUrl: "https://server1.com",
      trustedAt: BigInt(1640995200),
      user: "0x123",
      name: "Server 1",
    },
    {
      id: "2",
      serverAddress: "0xserver2",
      serverUrl: "https://server2.com",
      trustedAt: BigInt(1640995300),
      user: "0x123",
      name: "Server 2",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    useAccountMock.mockReturnValue({
      address: "0x123",
    } as any);

    useVanaMock.mockReturnValue({
      vana: mockVana as any,
      isInitialized: true,
      error: null,
      applicationAddress: "0xapp123",
    });

    mockVana.data.getUserTrustedServers.mockResolvedValue({
      servers: mockTrustedServers,
      total: 2,
      usedMode: "subgraph",
      warnings: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("returns default state when initialized", async () => {
      const { result } = renderHook(() => useTrustedServers());

      // Initially loading should be true since the hook auto-loads when vana and address are available
      expect(result.current.trustedServers).toEqual([]);
      expect(result.current.isLoadingTrustedServers).toBe(true);
      expect(result.current.isTrustingServer).toBe(false);
      expect(result.current.isUntrusting).toBe(false);
      expect(result.current.isDiscoveringServer).toBe(false);
      expect(result.current.trustServerError).toBe("");
      expect(result.current.trustedServerQueryMode).toBe("auto");
      expect(result.current.serverId).toBe("");
      expect(result.current.serverUrl).toBe("");

      // Wait for auto-loading to complete
      await waitFor(() => {
        expect(result.current.isLoadingTrustedServers).toBe(false);
        expect(result.current.trustedServers).toHaveLength(2);
      });
    });

    it("loads trusted servers automatically when vana and address are available", async () => {
      const { result } = renderHook(() => useTrustedServers());

      await waitFor(() => {
        expect(result.current.trustedServers).toHaveLength(2);
        expect(result.current.isLoadingTrustedServers).toBe(false);
      });

      expect(mockVana.data.getUserTrustedServers).toHaveBeenCalledWith({
        user: "0x123",
        mode: "auto",
        subgraphUrl: "http://localhost:8000/subgraphs/name/vana",
        limit: 10,
      });
      expect(result.current.trustedServers).toEqual(mockTrustedServers);
      expect(addToastMock).toHaveBeenCalledWith({
        color: "success",
        title: "Trusted servers loaded via SUBGRAPH",
        description: "Found 2 trusted servers (2 total). Warnings: ",
      });
    });

    it("does not load servers when vana is not available", () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      renderHook(() => useTrustedServers());

      expect(mockVana.data.getUserTrustedServers).not.toHaveBeenCalled();
    });

    it("does not load servers when address is not available", () => {
      useAccountMock.mockReturnValue({
        address: undefined,
      } as any);

      renderHook(() => useTrustedServers());

      expect(mockVana.data.getUserTrustedServers).not.toHaveBeenCalled();
    });
  });

  describe("loadUserTrustedServers", () => {
    it("successfully loads trusted servers with default mode", async () => {
      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.loadUserTrustedServers();
      });

      expect(mockVana.data.getUserTrustedServers).toHaveBeenCalledWith({
        user: "0x123",
        mode: "auto",
        subgraphUrl: "http://localhost:8000/subgraphs/name/vana",
        limit: 10,
      });
      expect(result.current.trustedServers).toEqual(mockTrustedServers);
      expect(result.current.isLoadingTrustedServers).toBe(false);
    });

    it("successfully loads trusted servers with specified mode", async () => {
      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.loadUserTrustedServers("rpc");
      });

      expect(mockVana.data.getUserTrustedServers).toHaveBeenCalledWith({
        user: "0x123",
        mode: "rpc",
        subgraphUrl: "http://localhost:8000/subgraphs/name/vana",
        limit: 10,
      });
    });

    it("handles warnings in response", async () => {
      mockVana.data.getUserTrustedServers.mockResolvedValue({
        servers: mockTrustedServers,
        total: 2,
        usedMode: "rpc",
        warnings: ["Subgraph unavailable", "Fallback to RPC"],
      });

      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.loadUserTrustedServers();
      });

      expect(addToastMock).toHaveBeenCalledWith({
        color: "success",
        title: "Trusted servers loaded via RPC",
        description:
          "Found 2 trusted servers (2 total). Warnings: Subgraph unavailable, Fallback to RPC",
      });
    });

    it("handles errors when loading servers fails", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.getUserTrustedServers.mockRejectedValue(
        new Error("Network error"),
      );

      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.loadUserTrustedServers();
      });

      expect(result.current.isLoadingTrustedServers).toBe(false);
      expect(addToastMock).toHaveBeenCalledWith({
        title: "Error loading trusted servers",
        description: "Network error",
        variant: "solid",
        color: "danger",
      });

      consoleSpy.mockRestore();
    });

    it("does not load when vana or address is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.loadUserTrustedServers();
      });

      expect(mockVana.data.getUserTrustedServers).not.toHaveBeenCalled();
    });
  });

  describe("handleTrustServer", () => {
    it("successfully trusts server with valid inputs", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xserver3");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(mockVana.permissions.trustServer).toHaveBeenCalledWith({
        serverId: "0xserver3",
        serverUrl: "https://server3.com",
      });
      expect(mockVana.data.getUserTrustedServers).toHaveBeenCalled();
      expect(result.current.isTrustingServer).toBe(false);
      expect(result.current.trustServerError).toBe("");
    });

    it("validates server ID is provided", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("  ");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(result.current.trustServerError).toBe(
        "Please provide a server ID (address)",
      );
      expect(mockVana.permissions.trustServer).not.toHaveBeenCalled();
    });

    it("validates server URL is provided", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xserver3");
        result.current.setServerUrl("  ");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(result.current.trustServerError).toBe(
        "Please provide a server URL",
      );
      expect(mockVana.permissions.trustServer).not.toHaveBeenCalled();
    });

    it("handles trust server errors", async () => {
      mockVana.permissions.trustServer.mockRejectedValue(
        new Error("Trust failed"),
      );

      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xserver3");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(result.current.trustServerError).toBe("Trust failed");
      expect(result.current.isTrustingServer).toBe(false);
    });

    it("does not trust when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xserver3");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(mockVana.permissions.trustServer).not.toHaveBeenCalled();
    });
  });

  describe("handleTrustServerGasless", () => {
    it("successfully trusts server with signature using form state", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xserver3");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServerGasless();
      });

      expect(
        mockVana.permissions.trustServerWithSignature,
      ).toHaveBeenCalledWith({
        serverId: "0xserver3",
        serverUrl: "https://server3.com",
      });
      expect(result.current.serverId).toBe(""); // Fields cleared on success
      expect(result.current.serverUrl).toBe("");
      expect(result.current.isTrustingServer).toBe(false);
    });

    it("successfully trusts server with override parameters", async () => {
      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.handleTrustServerGasless(
          false,
          "0xoverride",
          "https://override.com",
        );
      });

      expect(
        mockVana.permissions.trustServerWithSignature,
      ).toHaveBeenCalledWith({
        serverId: "0xoverride",
        serverUrl: "https://override.com",
      });
    });

    it("does not clear fields when clearFieldsOnSuccess is false", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xserver3");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServerGasless(false);
      });

      expect(result.current.serverId).toBe("0xserver3");
      expect(result.current.serverUrl).toBe("https://server3.com");
    });

    it("validates server ID when using form state", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServerGasless();
      });

      expect(result.current.trustServerError).toBe(
        "Please provide a server ID (address)",
      );
      expect(
        mockVana.permissions.trustServerWithSignature,
      ).not.toHaveBeenCalled();
    });

    it("handles gasless trust errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.trustServerWithSignature.mockRejectedValue(
        new Error("Signature failed"),
      );

      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xserver3");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServerGasless();
      });

      expect(result.current.trustServerError).toBe("Signature failed");
      expect(result.current.isTrustingServer).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe("handleUntrustServer", () => {
    it("successfully untrusts server", async () => {
      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.handleUntrustServer("0xserver1");
      });

      expect(
        mockVana.permissions.untrustServerWithSignature,
      ).toHaveBeenCalledWith({
        serverId: "0xserver1",
      });
      expect(addToastMock).toHaveBeenCalledWith({
        title: "Server Untrusted",
        description: "Successfully untrusted server 0xserver1",
        variant: "solid",
        color: "success",
      });
      expect(result.current.isUntrusting).toBe(false);
    });

    it("handles untrust errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.untrustServerWithSignature.mockRejectedValue(
        new Error("Untrust failed"),
      );

      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.handleUntrustServer("0xserver1");
      });

      expect(addToastMock).toHaveBeenCalledWith({
        title: "Error",
        description: "Untrust failed",
        variant: "solid",
        color: "danger",
      });
      expect(result.current.isUntrusting).toBe(false);

      consoleSpy.mockRestore();
    });

    it("does not untrust when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.handleUntrustServer("0xserver1");
      });

      expect(
        mockVana.permissions.untrustServerWithSignature,
      ).not.toHaveBeenCalled();
    });
  });

  describe("handleDiscoverHostedServer", () => {
    it("successfully discovers server", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            personal_server: {
              address: "0xdiscovered",
              public_key: "0xpubkey",
            },
          }),
      });

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3001/identity?address=0x123",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      expect(discoveredInfo).toEqual({
        serverAddress: "0xdiscovered",
        serverUrl:
          process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL ||
          "http://localhost:3001",
        name: "Personal Server",
        publicKey: "0xpubkey",
      });
      expect(result.current.serverId).toBe("0xdiscovered");
      expect(result.current.serverUrl).toBe(
        process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL ||
          "http://localhost:3001",
      );
      expect(result.current.isDiscoveringServer).toBe(false);
    });

    it("handles server discovery network errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFetch.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(discoveredInfo).toBe(null);
      expect(result.current.trustServerError).toBe("Network error");
      expect(result.current.isDiscoveringServer).toBe(false);

      consoleSpy.mockRestore();
    });

    it("handles HTTP error responses", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(discoveredInfo).toBe(null);
      expect(result.current.trustServerError).toBe("HTTP 404: Not Found");

      consoleSpy.mockRestore();
    });

    it("handles unsuccessful response from gateway", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            // Missing personal_server or personal_server.address
          }),
      });

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(discoveredInfo).toBe(null);
      expect(result.current.trustServerError).toBe(
        "Invalid server discovery response: missing personal_server.address",
      );

      consoleSpy.mockRestore();
    });

    it("handles invalid server discovery response", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            personal_server: {
              // Missing address field
              public_key: "0xpubkey",
            },
          }),
      });

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(discoveredInfo).toBe(null);
      expect(result.current.trustServerError).toContain(
        "Invalid server discovery response: missing personal_server.address",
      );

      consoleSpy.mockRestore();
    });

    it("does not discover when address is not available", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      useAccountMock.mockReturnValue({
        address: undefined,
      } as any);

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(discoveredInfo).toBe(null);
      expect(mockFetch).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("wallet disconnection cleanup", () => {
    it("clears all state when wallet disconnects", () => {
      const { result, rerender } = renderHook(() => useTrustedServers());

      // Set some state
      act(() => {
        result.current.setServerId("0xtest");
        result.current.setServerUrl("https://test.com");
        result.current.setTrustServerError("test error");
      });

      // Simulate wallet disconnection
      useAccountMock.mockReturnValue({
        address: undefined,
      } as any);

      rerender();

      expect(result.current.trustedServers).toEqual([]);
      expect(result.current.serverId).toBe("");
      expect(result.current.serverUrl).toBe("");
      expect(result.current.trustServerError).toBe("");
    });
  });

  describe("setters", () => {
    it("setServerId updates server ID correctly", () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerId("0xnewserver");
      });

      expect(result.current.serverId).toBe("0xnewserver");
    });

    it("setServerUrl updates server URL correctly", () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerUrl("https://newserver.com");
      });

      expect(result.current.serverUrl).toBe("https://newserver.com");
    });

    it("setTrustedServerQueryMode updates query mode correctly", () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setTrustedServerQueryMode("rpc");
      });

      expect(result.current.trustedServerQueryMode).toBe("rpc");
    });

    it("setTrustServerError updates error correctly", () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setTrustServerError("test error");
      });

      expect(result.current.trustServerError).toBe("test error");
    });
  });
});
