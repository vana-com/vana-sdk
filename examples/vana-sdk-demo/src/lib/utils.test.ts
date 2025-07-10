import { describe, it, expect } from "vitest";
import { getIpfsGatewayUrl } from "./utils";

describe("getIpfsGatewayUrl", () => {
  it("should convert ipfs:// URLs to gateway URLs", () => {
    const ipfsUrl = "ipfs://QmTestHash123";
    const result = getIpfsGatewayUrl(ipfsUrl);

    expect(result).toBe("https://ipfs.io/ipfs/QmTestHash123");
  });

  it("should return non-ipfs URLs unchanged", () => {
    const httpUrl = "https://example.com/file.txt";
    const result = getIpfsGatewayUrl(httpUrl);

    expect(result).toBe(httpUrl);
  });

  it("should handle empty strings", () => {
    const result = getIpfsGatewayUrl("");

    expect(result).toBe("");
  });

  it("should handle URLs that start with ipfs:// but have complex hashes", () => {
    const ipfsUrl =
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const result = getIpfsGatewayUrl(ipfsUrl);

    expect(result).toBe(
      "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    );
  });
});
