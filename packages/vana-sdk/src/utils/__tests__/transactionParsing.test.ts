import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hash, TransactionReceipt, Log } from "viem";
import { parseTransactionResult } from "../transactionParsing";
import type { ControllerContext } from "../../controllers/permissions";
import { BlockchainError, NetworkError } from "../../errors";

// Mock the viem parseEventLogs function
vi.mock("viem", () => ({
  parseEventLogs: vi.fn((params) => {
    // Simulate parsing based on event name
    if (params.eventName === "PermissionAdded") {
      return [
        {
          eventName: "PermissionAdded",
          args: {
            permissionId: 75n,
            user: "0xB7300F04dfC902FEfa3068dBbeB27273bDe20F76",
            grant:
              "https://cdn.vibes-moksha.vana.com/grants/1753281736304-grant-file.json",
            fileIds: [1654449n],
          },
        },
      ];
    }
    if (params.eventName === "FileAdded") {
      return [
        {
          eventName: "FileAdded",
          args: {
            fileId: 42n,
            ownerAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
            url: "ipfs://QmHash123",
          },
        },
      ];
    }
    return [];
  }),
}));

// Mock the ABI and addresses
vi.mock("../../abi/index", () => ({
  getAbi: vi.fn(() => [
    {
      anonymous: false,
      inputs: [
        { indexed: true, name: "permissionId", type: "uint256" },
        { indexed: true, name: "user", type: "address" },
        { indexed: false, name: "grant", type: "string" },
        { indexed: false, name: "fileIds", type: "uint256[]" },
      ],
      name: "PermissionAdded",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, name: "fileId", type: "uint256" },
        { indexed: true, name: "ownerAddress", type: "address" },
        { indexed: false, name: "url", type: "string" },
      ],
      name: "FileAdded",
      type: "event",
    },
  ]),
}));

describe("parseTransactionResult", () => {
  let mockContext: ControllerContext;
  let mockReceipt: TransactionReceipt;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock receipt
    mockReceipt = {
      blockNumber: 3676747n,
      gasUsed: 537754n,
      logs: [
        {
          address: "0xD54523048AdD05b4d734aFaE7C68324Ebb7373eF", // Use DataPortabilityPermissions address
          blockHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          blockNumber: 12345n,
          data: "0x...",
          logIndex: 0,
          removed: false,
          topics: ["0x..."],
          transactionHash:
            "0xed8d0a7fe73032c681f9e30944e415363b808e114aa62386bcd69ac8bc25a645",
          transactionIndex: 0,
        } as Log,
      ],
    } as TransactionReceipt;

    // Create mock context
    mockContext = {
      publicClient: {
        waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      },
      walletClient: {
        getChainId: vi.fn().mockResolvedValue(14800),
      },
    } as unknown as ControllerContext;
  });

  it("should parse PermissionAdded event correctly", async () => {
    const hash =
      "0xed8d0a7fe73032c681f9e30944e415363b808e114aa62386bcd69ac8bc25a645" as Hash;

    const result = await parseTransactionResult(mockContext, hash, "grant");

    expect(result).toEqual({
      permissionId: 75n,
      user: "0xB7300F04dfC902FEfa3068dBbeB27273bDe20F76",
      grant:
        "https://cdn.vibes-moksha.vana.com/grants/1753281736304-grant-file.json",
      fileIds: [1654449n],
      transactionHash: hash,
      blockNumber: 3676747n,
      gasUsed: 537754n,
    });

    expect(
      mockContext.publicClient.waitForTransactionReceipt,
    ).toHaveBeenCalledWith({
      hash,
      timeout: 30_000,
    });
  });

  it("should parse FileAdded event correctly", async () => {
    const hash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash;

    const result = await parseTransactionResult(mockContext, hash, "addFile");

    expect(result).toEqual({
      fileId: 42n,
      ownerAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      url: "ipfs://QmHash123",
      transactionHash: hash,
      blockNumber: 3676747n,
      gasUsed: 537754n,
    });
  });

  it("should throw error when no event is found", async () => {
    const hash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash;

    // Mock parseEventLogs to return empty array
    vi.mocked(await import("viem")).parseEventLogs.mockReturnValueOnce([]);

    await expect(
      parseTransactionResult(mockContext, hash, "grant"),
    ).rejects.toThrow(BlockchainError);
  });

  it("should throw NetworkError on timeout", async () => {
    const hash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash;

    mockContext.publicClient.waitForTransactionReceipt = vi
      .fn()
      .mockRejectedValue(new Error("timeout"));

    await expect(
      parseTransactionResult(mockContext, hash, "grant"),
    ).rejects.toThrow(NetworkError);
  });

  it("should handle multiple events and use the first one", async () => {
    const hash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash;

    // Mock parseEventLogs to return multiple events
    vi.mocked(await import("viem")).parseEventLogs.mockReturnValueOnce([
      {
        eventName: "PermissionAdded",
        args: {
          permissionId: 75n,
          user: "0xB7300F04dfC902FEfa3068dBbeB27273bDe20F76",
          grant: "https://first-event.json",
          fileIds: [1n],
        },
      },
      {
        eventName: "PermissionAdded",
        args: {
          permissionId: 76n,
          user: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
          grant: "https://second-event.json",
          fileIds: [2n],
        },
      },
    ] as any);

    const result = await parseTransactionResult(mockContext, hash, "grant");

    // Should use the first event
    expect(result.permissionId).toBe(75n);
    expect(result.grant).toBe("https://first-event.json");
  });
});
