import { describe, expect, it } from "vitest";
import {
  BlockchainError,
  ContractNotFoundError,
  InvalidConfigurationError,
  NetworkError,
  NonceError,
  PermissionError,
  PersonalServerError,
  ReadOnlyError,
  RelayerError,
  SerializationError,
  ServerUrlMismatchError,
  SignatureError,
  TransactionPendingError,
  UserRejectedRequestError,
  VanaError,
} from "./errors";

describe("SDK errors", () => {
  it("sets stable names and codes for basic SDK errors", () => {
    const original = new Error("root cause");
    const cases = [
      new VanaError("base", "BASE"),
      new RelayerError("relayer failed", 500, { error: "upstream" }),
      new UserRejectedRequestError(),
      new InvalidConfigurationError("missing wallet"),
      new ContractNotFoundError("DataRegistry", 1480),
      new BlockchainError("chain failed", original),
      new SerializationError("bad json"),
      new SignatureError("signature failed", original),
      new NetworkError("network failed", original),
      new NonceError("nonce failed"),
      new PersonalServerError("server failed", original),
      new PermissionError("permission failed", original),
    ];

    expect(cases.map((err) => err.name)).toEqual([
      "VanaError",
      "RelayerError",
      "UserRejectedRequestError",
      "InvalidConfigurationError",
      "ContractNotFoundError",
      "BlockchainError",
      "SerializationError",
      "SignatureError",
      "NetworkError",
      "NonceError",
      "PersonalServerError",
      "PermissionError",
    ]);
    expect(cases.map((err) => err.code)).toEqual([
      "BASE",
      "RELAYER_ERROR",
      "USER_REJECTED_REQUEST",
      "INVALID_CONFIGURATION",
      "CONTRACT_NOT_FOUND",
      "BLOCKCHAIN_ERROR",
      "SERIALIZATION_ERROR",
      "SIGNATURE_ERROR",
      "NETWORK_ERROR",
      "NONCE_ERROR",
      "PERSONAL_SERVER_ERROR",
      "PERMISSION_ERROR",
    ]);
  });

  it("preserves structured details on specialized errors", () => {
    const relayer = new RelayerError("relayer failed", 503, {
      message: "unavailable",
    });
    expect(relayer.statusCode).toBe(503);
    expect(relayer.response).toEqual({ message: "unavailable" });

    const mismatch = new ServerUrlMismatchError(
      "https://old.example",
      "https://new.example",
      "server-1",
    );
    expect(mismatch.existingUrl).toBe("https://old.example");
    expect(mismatch.providedUrl).toBe("https://new.example");
    expect(mismatch.serverId).toBe("server-1");
    expect(mismatch.message).toContain("server-1");

    const readOnly = new ReadOnlyError("decrypt");
    expect(readOnly.operation).toBe("decrypt");
    expect(readOnly.suggestion).toContain("walletClient");

    const pending = new TransactionPendingError("op-1", "still running", {
      status: "submitted",
    });
    expect(pending.toJSON()).toEqual({
      name: "TransactionPendingError",
      code: "TRANSACTION_PENDING",
      message:
        "Transaction operation pending: still running (operationId: op-1)",
      operationId: "op-1",
      lastKnownStatus: { status: "submitted" },
    });
  });
});
