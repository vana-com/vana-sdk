import { POST } from "./route";
import { NextRequest } from "next/server";
import { recoverTypedDataAddress } from "viem";

// Mock the dependencies
vi.mock("viem", () => ({
  recoverTypedDataAddress: vi.fn(),
}));

vi.mock("@/lib/relayer", () => ({
  createRelayerVana: vi.fn(() => ({
    permissions: {
      submitSignedGrant: vi.fn().mockResolvedValue("0x123..."),
      submitSignedRevoke: vi.fn().mockResolvedValue("0x456..."),
      submitSignedTrustServer: vi.fn().mockResolvedValue("0x789..."),
      submitSignedUntrustServer: vi.fn().mockResolvedValue("0xabc..."),
    },
  })),
}));

describe("/api/relay", () => {
  const mockTypedData = {
    domain: {
      name: "VanaDataPermissions",
      version: "1",
      chainId: 14800,
      verifyingContract: "0x1234567890123456789012345678901234567890",
    },
    types: {
      Permission: [
        { name: "nonce", type: "uint256" },
        { name: "grant", type: "string" },
      ],
    },
    primaryType: "Permission",
    message: {
      nonce: "1",
      grant: "ipfs://QmTestGrant",
    },
  };

  const mockSignature =
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";
  const mockUserAddress = "0x1234567890123456789012345678901234567890";
  const mockDifferentAddress = "0x9876543210987654321098765432109876543210";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should succeed when signer address matches expected user address", async () => {
    // Mock signature recovery to return the expected address
    (recoverTypedDataAddress as any).mockResolvedValue(mockUserAddress);

    const request = new NextRequest("http://localhost/api/relay", {
      method: "POST",
      body: JSON.stringify({
        typedData: mockTypedData,
        signature: mockSignature,
        expectedUserAddress: mockUserAddress,
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.transactionHash).toBe("0x123...");
  });

  it("should fail when signer address does not match expected user address", async () => {
    // Mock signature recovery to return a different address
    (recoverTypedDataAddress as any).mockResolvedValue(mockDifferentAddress);

    const request = new NextRequest("http://localhost/api/relay", {
      method: "POST",
      body: JSON.stringify({
        typedData: mockTypedData,
        signature: mockSignature,
        expectedUserAddress: mockUserAddress,
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Security verification failed");
    expect(data.details.recoveredSigner).toBe(
      mockDifferentAddress.toLowerCase(),
    );
    expect(data.details.expectedUser).toBe(mockUserAddress.toLowerCase());
    expect(data.details.domain).toBe("VanaDataPermissions");
  });

  it("should proceed with warning when no expected user address is provided", async () => {
    // Mock signature recovery
    (recoverTypedDataAddress as any).mockResolvedValue(mockUserAddress);

    const request = new NextRequest("http://localhost/api/relay", {
      method: "POST",
      body: JSON.stringify({
        typedData: mockTypedData,
        signature: mockSignature,
        // No expectedUserAddress provided
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.transactionHash).toBe("0x123...");
  });

  it("should handle case-insensitive address comparison", async () => {
    // Mock signature recovery with uppercase address
    (recoverTypedDataAddress as any).mockResolvedValue(
      mockUserAddress.toUpperCase(),
    );

    const request = new NextRequest("http://localhost/api/relay", {
      method: "POST",
      body: JSON.stringify({
        typedData: mockTypedData,
        signature: mockSignature,
        expectedUserAddress: mockUserAddress.toLowerCase(), // Lowercase expected
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("should fail when signature recovery fails", async () => {
    // Mock signature recovery to return null (invalid signature)
    (recoverTypedDataAddress as any).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/relay", {
      method: "POST",
      body: JSON.stringify({
        typedData: mockTypedData,
        signature: mockSignature,
        expectedUserAddress: mockUserAddress,
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe("Invalid signature");
  });
});
