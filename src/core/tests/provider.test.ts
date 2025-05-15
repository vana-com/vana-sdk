import {
  createTestClient,
  http,
  parseEther,
  publicActions,
  walletActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mokshaTestnet } from "../../config/chains";
import { VanaProvider } from "../provider";

// Test constants
const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.moksha.vana.org";
const RICH_ADDRESS = "0x1111000000000000000000000000000000000000";
const TEST_BALANCE = 1000000000000000000n; // 1 ETH
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

describe("VanaProvider", () => {
  const testClient = createTestClient({
    chain: mokshaTestnet,
    mode: "hardhat",
    transport: http(TEST_RPC_URL),
  })
    .extend(publicActions)
    .extend(walletActions);

  let vana: VanaProvider;
  let signer: ReturnType<typeof privateKeyToAccount>;

  beforeEach(async () => {
    signer = privateKeyToAccount(TEST_PRIVATE_KEY);
    vana = new VanaProvider({
      chainId: mokshaTestnet.id,
      rpcUrl: TEST_RPC_URL,
      signer,
    });
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with correct properties", () => {
      expect(vana.chainId).toBe(mokshaTestnet.id);
      expect(vana.client).toBeDefined();
      expect(vana.contracts).toBeDefined();
      expect(vana.contracts.dataRegistry).toBeDefined();
      expect(vana.contracts.teePool).toBeDefined();
      expect(vana.contracts.dataLiquidityPool).toBeDefined();
      expect(vana.contracts.computeEngine).toBeDefined();
    });
  });

  describe("Signer Operations", () => {
    it("should return correct signer address", async () => {
      const address = await vana.signerAddress();
      expect(address.toLowerCase()).toBe(testAccount.address.toLowerCase());
    });

    it("should throw error when no signer is configured", async () => {
      const vanaWithoutSigner = new VanaProvider({
        chainId: mokshaTestnet.id,
        rpcUrl: TEST_RPC_URL,
      });
      await expect(vanaWithoutSigner.signerAddress()).rejects.toThrow(
        "No signer configured"
      );
    });
  });

  describe("Network Operations", () => {
    it("should connect to Moksha testnet and get block data", async () => {
      const blockNumber = await testClient.getBlockNumber();
      expect(blockNumber).toBeTypeOf("bigint");
      expect(blockNumber).toBeGreaterThan(0n);
    });

    it.skip("should handle account impersonation", async () => {
      // Skipping as impersonation is not supported on public testnets
      await testClient.setBalance({
        address: RICH_ADDRESS,
        value: TEST_BALANCE,
      });

      await testClient.impersonateAccount({ address: RICH_ADDRESS });
      const balance = await testClient.getBalance({ address: RICH_ADDRESS });
      expect(balance).toBe(TEST_BALANCE);

      await testClient.stopImpersonatingAccount({ address: RICH_ADDRESS });
      await expect(
        testClient.getBalance({ address: RICH_ADDRESS })
      ).resolves.toBeDefined();
    });
  });

  describe("Contract Interactions", () => {
    it("should handle contract version reading when deployed", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        const version = await testClient.readContract({
          address: vana.contracts.dataRegistry.address,
          abi: vana.contracts.dataRegistry.abi,
          functionName: "version",
        });

        testClient.writeContract({
          address: vana.contracts.computeEngine.address,
          abi: vana.contracts.computeEngine.abi,
          functionName: "submitJob",
          args: [BigInt(10), true, BigInt(1)],
          value: parseEther("0.001"),
          account: signer,
        });

        expect(version).toBeDefined();
      } catch (error) {
        expect(console.log).toHaveBeenCalledWith(
          "Contracts not deployed on test network, skipping interaction tests"
        );
      }
    });

    it("should return valid contract addresses", () => {
      expect(vana.contracts.dataRegistry.address).toMatch(
        /^0x[a-fA-F0-9]{40}$/
      );
      expect(vana.contracts.teePool.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(vana.contracts.dataLiquidityPool.address).toMatch(
        /^0x[a-fA-F0-9]{40}$/
      );
      expect(vana.contracts.computeEngine.address).toMatch(
        /^0x[a-fA-F0-9]{40}$/
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid chain ID", () => {
      expect(() => {
        new VanaProvider({
          chainId: 999999,
          rpcUrl: TEST_RPC_URL,
          signer,
        });
      }).toThrow("Chain 999999 not found");
    });
  });
});
