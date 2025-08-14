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
  const mockVana: any = {
    data: {
      getUserTrustedServers: vi.fn(),
    },
    permissions: {
      addAndTrustServer: vi.fn(),
      submitAddAndTrustServerWithSignature: vi.fn(),
      submitUntrustServerWithSignature: vi.fn(),
    },
    server: {
      getIdentity: vi.fn(),
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

    mockVana.data.getUserTrustedServers.mockResolvedValue(mockTrustedServers);
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
      expect(result.current.serverAddress).toBe("");
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
        subgraphUrl: "http://localhost:8000/subgraphs/name/vana",
        limit: 10,
      });
      expect(result.current.trustedServers).toEqual(mockTrustedServers);
      expect(addToastMock).toHaveBeenCalledWith({
        color: "success",
        title: "Trusted servers loaded",
        description: "Found 2 trusted servers",
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
        subgraphUrl: "http://localhost:8000/subgraphs/name/vana",
        limit: 10,
      });
      expect(result.current.trustedServers).toEqual(mockTrustedServers);
      expect(result.current.isLoadingTrustedServers).toBe(false);
    });

    it("successfully loads trusted servers", async () => {
      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.loadUserTrustedServers();
      });

      expect(mockVana.data.getUserTrustedServers).toHaveBeenCalledWith({
        user: "0x123",
        subgraphUrl: "http://localhost:8000/subgraphs/name/vana",
        limit: 10,
      });
    });

    it("handles array response", async () => {
      mockVana.data.getUserTrustedServers.mockResolvedValue(mockTrustedServers);

      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.loadUserTrustedServers();
      });

      expect(addToastMock).toHaveBeenCalledWith({
        color: "success",
        title: "Trusted servers loaded",
        description: "Found 2 trusted servers",
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
        result.current.setServerAddress("0xserver3");
        result.current.setServerUrl("https://server3.com");
        result.current.setServerOwner("0xowner123");
        result.current.setPublicKey("0xpublickey123");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(mockVana.permissions.addAndTrustServer).toHaveBeenCalledWith({
        serverAddress: "0xserver3",
        serverUrl: "https://server3.com",
        publicKey: "0xpublickey123",
      });
      expect(mockVana.data.getUserTrustedServers).toHaveBeenCalled();
      expect(result.current.isTrustingServer).toBe(false);
      expect(result.current.trustServerError).toBe("");
    });

    it("validates server ID is provided", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("  ");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(result.current.trustServerError).toBe(
        "Please provide a server address",
      );
      expect(mockVana.permissions.addAndTrustServer).not.toHaveBeenCalled();
    });

    it("validates server URL is provided", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("0xserver3");
        result.current.setServerUrl("  ");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(result.current.trustServerError).toBe(
        "Please provide a server URL",
      );
      expect(mockVana.permissions.addAndTrustServer).not.toHaveBeenCalled();
    });

    it("handles trust server errors", async () => {
      mockVana.permissions.addAndTrustServer.mockRejectedValue(
        new Error("Trust failed"),
      );

      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("0xserver3");
        result.current.setServerUrl("https://server3.com");
        result.current.setServerOwner("0xowner123");
        result.current.setPublicKey("0xpublickey123");
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
        result.current.setServerAddress("0xserver3");
        result.current.setServerUrl("https://server3.com");
      });

      await act(async () => {
        await result.current.handleTrustServer();
      });

      expect(mockVana.permissions.addAndTrustServer).not.toHaveBeenCalled();
    });
  });

  describe("handleTrustServerGasless", () => {
    it("successfully trusts server with signature using form state", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("0xserver3");
        result.current.setServerUrl("https://server3.com");
        result.current.setPublicKey("0xpublickey123");
      });

      await act(async () => {
        await result.current.handleTrustServerGasless();
      });

      expect(
        mockVana.permissions.submitAddAndTrustServerWithSignature,
      ).toHaveBeenCalledWith({
        serverAddress: "0xserver3",
        serverUrl: "https://server3.com",
        publicKey: "0xpublickey123",
      });
      expect(result.current.serverAddress).toBe(""); // Fields cleared on success
      expect(result.current.serverUrl).toBe("");
      expect(result.current.publicKey).toBe("");
      expect(result.current.isTrustingServer).toBe(false);
    });

    it("successfully trusts server with override parameters", async () => {
      const { result } = renderHook(() => useTrustedServers());

      await act(async () => {
        await result.current.handleTrustServerGasless(
          false,
          "0xoverride",
          "https://override.com",
          "0xoverridepubkey",
        );
      });

      expect(
        mockVana.permissions.submitAddAndTrustServerWithSignature,
      ).toHaveBeenCalledWith({
        serverAddress: "0xoverride",
        serverUrl: "https://override.com",
        publicKey: "0xoverridepubkey",
      });
    });

    it("does not clear fields when clearFieldsOnSuccess is false", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("0xserver3");
        result.current.setServerUrl("https://server3.com");
        result.current.setPublicKey("0xpublickey123");
      });

      await act(async () => {
        await result.current.handleTrustServerGasless(false);
      });

      expect(result.current.serverAddress).toBe("0xserver3");
      expect(result.current.serverUrl).toBe("https://server3.com");
      expect(result.current.publicKey).toBe("0xpublickey123");
    });

    it("validates server address when using form state", async () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("");
        result.current.setServerUrl("https://server3.com");
        result.current.setPublicKey("0xpublickey123");
      });

      await act(async () => {
        await result.current.handleTrustServerGasless();
      });

      expect(result.current.trustServerError).toBe(
        "Please provide a server address",
      );
      expect(
        mockVana.permissions.submitAddAndTrustServerWithSignature,
      ).not.toHaveBeenCalled();
    });

    it("handles gasless trust errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.submitAddAndTrustServerWithSignature.mockRejectedValue(
        new Error("Signature failed"),
      );

      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("0xserver3");
        result.current.setServerUrl("https://server3.com");
        result.current.setPublicKey("0xpublickey123");
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
        await result.current.handleUntrustServer("1");
      });

      expect(
        mockVana.permissions.submitUntrustServerWithSignature,
      ).toHaveBeenCalledWith({
        serverId: 1,
      });
      expect(addToastMock).toHaveBeenCalledWith({
        title: "Server Untrusted",
        description: "Successfully untrusted server 1",
        variant: "solid",
        color: "success",
      });
      expect(result.current.isUntrusting).toBe(false);
    });

    it("handles untrust errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.submitUntrustServerWithSignature.mockRejectedValue(
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
        mockVana.permissions.submitUntrustServerWithSignature,
      ).not.toHaveBeenCalled();
    });
  });

  describe("handleDiscoverHostedServer", () => {
    it("successfully discovers server", async () => {
      mockVana.server.getIdentity.mockResolvedValue({
        address: "0xdiscovered",
        public_key: "0xpubkey",
        base_url: "http://localhost:3001",
        name: "Personal Server",
        kind: "hosted",
      });

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(mockVana.server.getIdentity).toHaveBeenCalledWith({
        userAddress: "0x123",
      });
      expect(discoveredInfo).toEqual({
        serverAddress: "0xdiscovered",
        serverUrl: "http://localhost:3001",
        name: "Personal Server",
        publicKey: "0xpubkey",
      });
      expect(result.current.serverAddress).toBe("0xdiscovered");
      expect(result.current.serverUrl).toBe("http://localhost:3001");
      expect(result.current.isDiscoveringServer).toBe(false);
    });

    it("handles server discovery network errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockVana.server.getIdentity.mockRejectedValue(new Error("Network error"));

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

    it("handles missing base URL configuration", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Mock the SDK to return proper identity but environment variable is missing
      const originalEnv = process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL;
      delete process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL;

      mockVana.server.getIdentity.mockResolvedValue({
        address: "0xdiscovered",
        public_key: "0xpubkey",
        base_url: "",
        name: "Personal Server",
        kind: "hosted",
      });

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(discoveredInfo).toBe(null);
      expect(result.current.trustServerError).toBe(
        "Personal server URL is not configured. Please configure personalServerUrl in SDK settings.",
      );

      // Restore environment variable
      process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL = originalEnv;
      consoleSpy.mockRestore();
    });

    it("handles unsuccessful response from gateway", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockVana.server.getIdentity.mockResolvedValue({
        address: "", // Empty address
        public_key: "0xpubkey",
        base_url: "http://localhost:3001",
        name: "Personal Server",
        kind: "hosted",
      });

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      // Even with empty address, it should still return the info
      expect(discoveredInfo).toEqual({
        serverAddress: "",
        serverUrl: "http://localhost:3001",
        name: "Personal Server",
        publicKey: "0xpubkey",
      });

      consoleSpy.mockRestore();
    });

    it("handles SDK getIdentity error with custom message", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockVana.server.getIdentity.mockRejectedValue(
        new Error("Custom SDK error"),
      );

      const { result } = renderHook(() => useTrustedServers());

      let discoveredInfo;
      await act(async () => {
        discoveredInfo = await result.current.handleDiscoverHostedServer();
      });

      expect(discoveredInfo).toBe(null);
      expect(result.current.trustServerError).toBe("Custom SDK error");

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
        result.current.setServerAddress("0xtest");
        result.current.setServerUrl("https://test.com");
        result.current.setTrustServerError("test error");
      });

      // Simulate wallet disconnection
      useAccountMock.mockReturnValue({
        address: undefined,
      } as any);

      rerender();

      expect(result.current.trustedServers).toEqual([]);
      expect(result.current.serverAddress).toBe("");
      expect(result.current.serverUrl).toBe("");
      expect(result.current.trustServerError).toBe("");
    });
  });

  describe("setters", () => {
    it("setServerId updates server ID correctly", () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerAddress("0xnewserver");
      });

      expect(result.current.serverAddress).toBe("0xnewserver");
    });

    it("setServerUrl updates server URL correctly", () => {
      const { result } = renderHook(() => useTrustedServers());

      act(() => {
        result.current.setServerUrl("https://newserver.com");
      });

      expect(result.current.serverUrl).toBe("https://newserver.com");
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
