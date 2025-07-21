import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaCore } from "../core";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moksha } from "../chains";
import type { VanaChain } from "../types/chains";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock fetch for IPFS gateway tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("DataController - IPFS Gateway Configuration", () => {
  const mockCID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
  const mockIpfsUrl = `ipfs://${mockCID}`;
  const mockBlobContent = "test content";

  const createMockResponse = (success: boolean, content?: string) => ({
    ok: success,
    blob: async () => new Blob([content || mockBlobContent]),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchFromIPFS gateway configuration", () => {
    it("should use default public gateways when no configuration is provided", async () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
      });

      // Mock successful response from first default gateway
      mockFetch.mockResolvedValueOnce(createMockResponse(true));

      await vana.data.fetchFromIPFS(mockIpfsUrl);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://dweb.link/ipfs/${mockCID}`,
      );
    });

    it("should use application-wide gateways from config when provided", async () => {
      const customGateways = [
        "https://my-private-gateway.com/ipfs/",
        "https://another-gateway.com/ipfs/",
      ];

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
        ipfsGateways: customGateways,
      });

      // Mock successful response from first custom gateway
      mockFetch.mockResolvedValueOnce(createMockResponse(true));

      await vana.data.fetchFromIPFS(mockIpfsUrl);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://my-private-gateway.com/ipfs/${mockCID}`,
      );
    });

    it("should allow per-call gateways to override application-wide gateways", async () => {
      const appGateways = ["https://app-gateway.com/ipfs/"];
      const callGateways = ["https://call-gateway.com/ipfs/"];

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
        ipfsGateways: appGateways,
      });

      // Mock successful response from per-call gateway
      mockFetch.mockResolvedValueOnce(createMockResponse(true));

      await vana.data.fetchFromIPFS(mockIpfsUrl, { gateways: callGateways });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://call-gateway.com/ipfs/${mockCID}`,
      );
      expect(mockFetch).not.toHaveBeenCalledWith(
        `https://app-gateway.com/ipfs/${mockCID}`,
      );
    });

    it("should try multiple gateways in order when earlier ones fail", async () => {
      const customGateways = [
        "https://gateway1.com/ipfs/",
        "https://gateway2.com/ipfs/",
        "https://gateway3.com/ipfs/",
      ];

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
        ipfsGateways: customGateways,
      });

      // First two gateways fail, third succeeds
      mockFetch
        .mockResolvedValueOnce(createMockResponse(false))
        .mockResolvedValueOnce(createMockResponse(false))
        .mockResolvedValueOnce(createMockResponse(true));

      await vana.data.fetchFromIPFS(mockIpfsUrl);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `https://gateway1.com/ipfs/${mockCID}`,
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        `https://gateway2.com/ipfs/${mockCID}`,
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        `https://gateway3.com/ipfs/${mockCID}`,
      );
    });

    it("should handle gateways with and without trailing slashes", async () => {
      const customGateways = [
        "https://gateway-with-slash.com/ipfs/",
        "https://gateway-no-slash.com/ipfs",
      ];

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
        ipfsGateways: customGateways,
      });

      // Both gateways fail to test URL construction
      mockFetch
        .mockResolvedValueOnce(createMockResponse(false))
        .mockResolvedValueOnce(createMockResponse(false));

      try {
        await vana.data.fetchFromIPFS(mockIpfsUrl);
      } catch {
        // Expected to fail, we're testing URL construction
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://gateway-with-slash.com/ipfs/${mockCID}`,
      );
      expect(mockFetch).toHaveBeenCalledWith(
        `https://gateway-no-slash.com/ipfs/${mockCID}`,
      );
    });

    it("should throw error when all gateways fail", async () => {
      const customGateways = ["https://failing-gateway.com/ipfs/"];

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
        ipfsGateways: customGateways,
      });

      mockFetch.mockResolvedValueOnce(createMockResponse(false));

      await expect(vana.data.fetchFromIPFS(mockIpfsUrl)).rejects.toThrow(
        "HTTP error! status: undefined undefined",
      );
    });

    it("should work with raw CIDs", async () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
        ipfsGateways: ["https://custom.com/ipfs/"],
      });

      mockFetch.mockResolvedValueOnce(createMockResponse(true));

      await vana.data.fetchFromIPFS(mockCID);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://custom.com/ipfs/${mockCID}`,
      );
    });

    it("should use application-wide gateways consistently across multiple calls", async () => {
      const customGateways = ["https://consistent-gateway.com/ipfs/"];

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: createWalletClient({
          account: privateKeyToAccount(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ),
          chain: moksha as VanaChain,
          transport: http(),
        }),
        ipfsGateways: customGateways,
      });

      // Mock successful responses
      mockFetch
        .mockResolvedValueOnce(createMockResponse(true))
        .mockResolvedValueOnce(createMockResponse(true));

      // Multiple calls without specifying gateways
      await vana.data.fetchFromIPFS(mockIpfsUrl);
      await vana.data.fetchFromIPFS(`ipfs://QmAnother`);

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `https://consistent-gateway.com/ipfs/${mockCID}`,
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        `https://consistent-gateway.com/ipfs/QmAnother`,
      );
    });
  });
});
