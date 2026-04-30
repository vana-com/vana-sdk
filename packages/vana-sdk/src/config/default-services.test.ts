import { describe, it, expect } from "vitest";
import {
  mainnetServices,
  mokshaServices,
  getServiceEndpoints,
  type ServiceEndpoints,
} from "./default-services";

describe("Default Service Configuration", () => {
  describe("mainnetServices", () => {
    it("should have correct mainnet service URLs", () => {
      expect(mainnetServices.blockExplorerUrl).toBe("https://vanascan.io");
      expect(mainnetServices.rpcUrl).toBe("https://rpc.vana.org");
    });
  });

  describe("mokshaServices", () => {
    it("should have correct moksha testnet service URLs", () => {
      expect(mokshaServices.blockExplorerUrl).toBe(
        "https://moksha.vanascan.io",
      );
      expect(mokshaServices.rpcUrl).toBe("https://rpc.moksha.vana.org");
    });
  });

  describe("getServiceEndpoints", () => {
    it("should return mainnet services for chain ID 1480", () => {
      const services = getServiceEndpoints(1480);
      expect(services).toEqual(mainnetServices);
    });

    it("should return moksha services for chain ID 14800", () => {
      const services = getServiceEndpoints(14800);
      expect(services).toEqual(mokshaServices);
    });

    it("should return undefined for unknown chain ID", () => {
      const services = getServiceEndpoints(999999);
      expect(services).toBeUndefined();
    });

    it("should return undefined for invalid chain ID", () => {
      expect(getServiceEndpoints(0)).toBeUndefined();
      expect(getServiceEndpoints(-1)).toBeUndefined();
      expect(getServiceEndpoints(NaN)).toBeUndefined();
    });
  });

  describe("ServiceEndpoints type", () => {
    it("should have all required properties", () => {
      const validateServiceEndpoints = (services: ServiceEndpoints) => {
        expect(services).toHaveProperty("blockExplorerUrl");
        expect(services).toHaveProperty("rpcUrl");

        expect(typeof services.blockExplorerUrl).toBe("string");
        expect(typeof services.rpcUrl).toBe("string");
      };

      validateServiceEndpoints(mainnetServices);
      validateServiceEndpoints(mokshaServices);
    });
  });
});
