import { describe, expect, it } from "vitest";
import {
  DEV_ENDPOINTS,
  PRODUCTION_ENDPOINTS,
  getDirectDefaultNetwork,
  getDirectEndpoints,
  getDirectNetworkChainId,
} from "./endpoints";

describe("getDirectEndpoints", () => {
  it("uses production app URLs on mainnet for production", () => {
    expect(getDirectEndpoints("production")).toBe(PRODUCTION_ENDPOINTS);
    expect(PRODUCTION_ENDPOINTS).toMatchObject({
      chainId: 1480,
      accessRequestBaseUrl: "https://app.vana.org",
      approvalAppBaseUrl: "https://app.vana.org",
    });
  });

  it("keeps dev on the internal dev stack", () => {
    expect(getDirectEndpoints("dev")).toBe(DEV_ENDPOINTS);
    expect(DEV_ENDPOINTS).toMatchObject({
      chainId: 14800,
      accessRequestBaseUrl: "https://app-dev.vana.org",
      approvalAppBaseUrl: "https://app-dev.vana.org",
    });
  });

  it("keeps deployment env and network chain selection as separate axes", () => {
    expect(getDirectDefaultNetwork("production")).toBe("mainnet");
    expect(getDirectDefaultNetwork("dev")).toBe("moksha");
    expect(getDirectNetworkChainId("mainnet")).toBe(1480);
    expect(getDirectNetworkChainId("moksha")).toBe(14800);
  });
});
