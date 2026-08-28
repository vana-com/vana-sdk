import { describe, it, expect } from "vitest";
import {
  getContractAddress,
  getUtilityAddress,
  type VanaContractAddress,
} from "../../generated/addresses";
import { getAbi } from "../../generated/abi";
import {
  GRANT_REGISTRATION_TYPES,
  SERVER_REGISTRATION_TYPES,
} from "../../protocol/eip712";

describe("addresses", () => {
  describe("getContractAddress", () => {
    it("should return contract address for valid chain and contract", () => {
      const address = getContractAddress(14800, "DataRegistry");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should throw error for invalid contract on valid chain", () => {
      expect(() => {
        // @ts-expect-error - Testing invalid contract name
        getContractAddress(14800, "NonExistentContract");
      }).toThrow(
        "Contract address not found for NonExistentContract on chain 14800",
      );
    });

    it("should throw error for invalid chain", () => {
      expect(() => {
        getContractAddress(99999, "DataRegistry");
      }).toThrow();
    });

    it("should accept DataPortabilityEscrow (address-only contract added in #164)", () => {
      // This was the unaddressed Low finding from #164: addresses were present in
      // CONTRACTS but the public VanaContract type (derived from contractAbis) excluded
      // them because they have no ABI. VanaContractAddress now includes registry
      // keys, so these two names type-check correctly.
      const address = getContractAddress(14800, "DataPortabilityEscrow");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      const mainnetAddress = getContractAddress(1480, "DataPortabilityEscrow");
      expect(mainnetAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should accept FeeRegistry (address-only contract added in #164)", () => {
      const address = getContractAddress(14800, "FeeRegistry");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      const mainnetAddress = getContractAddress(1480, "FeeRegistry");
      expect(mainnetAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("VanaContractAddress includes DataPortabilityEscrow and FeeRegistry", () => {
      // Type-level assertion: these strings must be assignable to VanaContractAddress.
      // The assignment below is a compile-time check — if either name is missing from
      // VanaContractAddress, TypeScript will error here.
      const addressOnlyContracts: VanaContractAddress[] = [
        "DataPortabilityEscrow",
        "FeeRegistry",
      ];
      expect(addressOnlyContracts).toEqual([
        "DataPortabilityEscrow",
        "FeeRegistry",
      ]);
    });

    it("does not type allow ABI-only contracts without addresses", () => {
      expect(() => {
        // @ts-expect-error - ABI-only contract name is intentionally not addressable
        getContractAddress(1480, "DLPRegistryTreasuryImplementation");
      }).toThrow(
        "Contract address not found for DLPRegistryTreasuryImplementation on chain 1480",
      );
    });
  });

  describe("data portability V2 deployment pins", () => {
    // The data-gateway is the source of truth for which data-portability
    // deployment is live: it verifies every EIP-712 signature against the
    // address it is configured with, so an SDK that resolves a different
    // address signs for a contract nobody reads.
    //
    // Both of these are the V2 proxies and are identical on Moksha and
    // mainnet. The SDK previously shipped the V1 deployments here, which meant
    // every read through the contract registry hit a contract that no longer
    // receives writes.
    //
    // Do NOT use `version()` to tell the families apart: it is each family's
    // own upgrade counter and returns 2 on V1 and 1 on V2.
    //
    // To re-verify against chain (rpc.vana.org / rpc.moksha.vana.org):
    //   cast call <address> \
    //     "eip712Domain()(bytes1,string,string,uint256,address,bytes32,uint256[])"
    // must report the domain name "Vana Data Portability" (V1 reports
    // "VanaDataPortabilityPermissions"), and
    //   cast call <permissions> "dataPortabilityServers()(address)"
    // must return the DataPortabilityServers address pinned below.
    const PERMISSIONS_V2 = "0x4d3FA76064D88e0454cFc4CaD7e5FeC3e3124011";
    const SERVERS_V2 = "0xCae2CE0e9caa6643ed28186cF57bd40Bd9E17Eab";

    it.each([1480, 14800] as const)(
      "pins DataPortabilityPermissions on chain %i",
      (chainId) => {
        expect(getContractAddress(chainId, "DataPortabilityPermissions")).toBe(
          PERMISSIONS_V2,
        );
      },
    );

    it.each([1480, 14800] as const)(
      "pins DataPortabilityServers on chain %i",
      (chainId) => {
        expect(getContractAddress(chainId, "DataPortabilityServers")).toBe(
          SERVERS_V2,
        );
      },
    );

    it("keeps both contracts identical across Moksha and mainnet", () => {
      for (const contract of [
        "DataPortabilityPermissions",
        "DataPortabilityServers",
      ] as const) {
        expect(getContractAddress(1480, contract)).toBe(
          getContractAddress(14800, contract),
        );
      }
    });

    it("ships the V2 ABI alongside the V2 addresses", () => {
      // Address and ABI must move together: a V2 address with the V1 ABI
      // reverts or silently decodes to nothing. These selectors exist only on
      // the V2 implementations.
      const permissionFns = new Set(
        getAbi("DataPortabilityPermissions")
          .filter((entry) => entry.type === "function")
          .map((entry) => entry.name),
      );
      expect(permissionFns).toContain("GRANT_REGISTRATION_TYPEHASH");
      expect(permissionFns).toContain("dataPortabilityServers");
      // V1-only surface that must be gone.
      expect(permissionFns).not.toContain("addServerFilesAndPermissions");

      const serverFns = new Set(
        getAbi("DataPortabilityServers")
          .filter((entry) => entry.type === "function")
          .map((entry) => entry.name),
      );
      expect(serverFns).toContain("registerServerWithSignature");
      expect(serverFns).toContain("getServer");
      // V1-only surface that must be gone.
      expect(serverFns).not.toContain("addAndTrustServerWithSignature");
    });

    it("matches the EIP-712 typed data the SDK signs", () => {
      // The pinned V2 contracts expose GRANT_REGISTRATION_TYPEHASH and
      // SERVER_REGISTRATION_TYPEHASH, which are keccak256 of exactly these
      // encoded type strings on both chains. That equality is what makes
      // these the right contracts for the SDK to sign against; the V1
      // Permissions deployment uses a different struct
      // (`Permission(uint256 nonce,uint256 granteeId,string grant,uint256[]
      // fileIds)`) and a different domain name, so signatures produced here
      // are meaningless to it. Re-verify with:
      //   cast keccak "<encoded type below>"
      //   cast call <address> "GRANT_REGISTRATION_TYPEHASH()(bytes32)"
      const encodeType = (
        primary: string,
        types: Readonly<
          Record<string, readonly { name: string; type: string }[]>
        >,
      ) =>
        `${primary}(${types[primary]!.map(
          (field) => `${field.type} ${field.name}`,
        ).join(",")})`;

      expect(encodeType("GrantRegistration", GRANT_REGISTRATION_TYPES)).toBe(
        "GrantRegistration(address grantorAddress,bytes32 granteeId," +
          "string[] scopes,uint256 grantVersion,uint256 expiresAt)",
      );
      expect(encodeType("ServerRegistration", SERVER_REGISTRATION_TYPES)).toBe(
        "ServerRegistration(address ownerAddress,address serverAddress," +
          "string publicKey,string serverUrl)",
      );
    });
  });

  describe("getUtilityAddress", () => {
    it("should return utility address for valid chain and utility", () => {
      const address = getUtilityAddress(14800, "Multicall3");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should handle mainnet utility addresses", () => {
      const address = getUtilityAddress(1480, "Multicall3");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should return utility address for Multisend", () => {
      const address = getUtilityAddress(14800, "Multisend");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should return undefined for non-existent utility", () => {
      // @ts-expect-error - Testing non-existent utility
      const address = getUtilityAddress(14800, "nonExistentUtility");
      expect(address).toBeUndefined();
    });
  });
});
