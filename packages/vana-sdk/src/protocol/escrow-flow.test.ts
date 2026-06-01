/**
 * End-to-end test of the deposit + payment flow.
 *
 * The SDK is signer- and transport-agnostic. To prove the helpers compose
 * correctly we wire them through:
 *
 *   - A real viem `WalletClient` against an in-memory L1 (a custom RPC
 *     transport routes JSON-RPC calls to a Map-backed chain). The wallet
 *     genuinely signs an EIP-1559 transaction with the depositNative
 *     calldata produced by buildDepositNativeRequest.
 *
 *   - A fetch-mocked gateway that decodes that same calldata via
 *     ESCROW_DEPOSIT_ABI, credits a balance, and later recovers the
 *     GenericPayment EIP-712 signer with viem's recoverTypedDataAddress —
 *     same cryptographic checks the real gateway runs.
 *
 * Anything weaker than this (hand-rolled sendTx, hand-rolled sig recovery)
 * would let the SDK's encoder or domain helpers drift silently. Going through
 * viem's real wallet + sign paths is what makes this a useful e2e.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  custom,
  createWalletClient,
  decodeFunctionData,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseTransaction,
  recoverTypedDataAddress,
  stringToHex,
  toHex,
  type Address,
  type Hex,
  type Transport,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import { verifyWeb3Signed } from "../auth/web3-signed";
import {
  GENERIC_PAYMENT_TYPES,
  GRANT_REGISTRATION_TYPES,
  NATIVE_VANA_ASSET,
  escrowPaymentDomain,
  grantRegistrationDomain,
  type DataPortabilityGatewayConfig,
} from "./eip712";
import {
  ESCROW_DEPOSIT_ABI,
  buildDepositNativeRequest,
} from "./escrow-deposit";
import {
  createGatewayClient,
  type GatewayEnvelope,
  type GatewayGrantResponse,
} from "./gateway";
import { scopeCoveredByGrant } from "./scopes";

// ─── Test fixtures ────────────────────────────────────────────────────────

const CHAIN_ID = 14800;
const ESCROW_ADDRESS = "0x5555555555555555555555555555555555555555" as Address;

const CONFIG: DataPortabilityGatewayConfig = {
  chainId: CHAIN_ID,
  contracts: {
    dataRegistry: "0x1111111111111111111111111111111111111111",
    dataPortabilityPermissions: "0x2222222222222222222222222222222222222222",
    dataPortabilityServer: "0x3333333333333333333333333333333333333333",
    dataPortabilityGrantees: "0x4444444444444444444444444444444444444444",
    dataPortabilityEscrow: ESCROW_ADDRESS,
  },
};

const FAKE_CHAIN = defineChain({
  id: CHAIN_ID,
  name: "Mock Vana",
  nativeCurrency: { name: "VANA", symbol: "VANA", decimals: 18 },
  rpcUrls: { default: { http: ["http://mock"] } },
});

// Fresh keys per test run — every assertion below references
// `builder.address` / `grantor.address` dynamically, so signature
// determinism within a run is preserved without committing keys.
const builder = privateKeyToAccount(generatePrivateKey());
const grantor = privateKeyToAccount(generatePrivateKey());
const GRANT_ID =
  "0xabababababababababababababababababababababababababababababababab" as Hex;
const GRANTEE_ID =
  "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd" as Hex;

// ─── Mock L1 ──────────────────────────────────────────────────────────────
// In-memory chain backing the mock RPC transport. Tracks just enough state
// (nonces, balances, txs) for viem's sendTransaction to succeed and for the
// mock gateway to decode deposit calldata.

interface StoredTx {
  hash: Hex;
  from: Address;
  to: Address;
  data: Hex;
  value: bigint;
  blockNumber: bigint;
}

class MockL1 {
  readonly chainId: number;
  // Bumped on every successful sendRawTransaction so each tx lands in a
  // fresh "block" — the mock gateway uses blockNumber to mark a deposit
  // finalized.
  blockNumber = 1_000_000n;
  private readonly nonces = new Map<Address, number>();
  private readonly balances = new Map<Address, bigint>();
  private readonly txs = new Map<Hex, StoredTx>();
  // Receipt listeners — for assertions that a particular calldata fragment
  // actually hit the mock chain.
  readonly recordedTxs: StoredTx[] = [];

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  setBalance(addr: Address, balance: bigint): void {
    this.balances.set(addr.toLowerCase() as Address, balance);
  }

  getNonce(addr: Address): number {
    return this.nonces.get(addr.toLowerCase() as Address) ?? 0;
  }

  getTransactionByHash(hash: Hex): StoredTx | null {
    return this.txs.get(hash.toLowerCase() as Hex) ?? null;
  }

  // Synthesises a successful receipt. The real gateway listens for the
  // Deposited event, but our mock gateway decodes calldata directly, so we
  // don't need to emit logs.
  getTransactionReceipt(hash: Hex): Record<string, unknown> | null {
    const tx = this.getTransactionByHash(hash);
    if (!tx) return null;
    return {
      transactionHash: tx.hash,
      blockNumber: toHex(tx.blockNumber),
      blockHash: toHex(tx.blockNumber, { size: 32 }),
      transactionIndex: "0x0",
      from: tx.from,
      to: tx.to,
      cumulativeGasUsed: "0x5208",
      gasUsed: "0x5208",
      contractAddress: null,
      logs: [],
      logsBloom: `0x${"00".repeat(256)}`,
      status: "0x1",
      type: "0x2",
      effectiveGasPrice: toHex(1_000_000_000n),
    };
  }

  // Parses an EIP-1559 signed tx, increments the sender's nonce, stores it,
  // and returns the txHash. Mirrors what an L1's mempool entry point does.
  async sendRawTransaction(rawTx: Hex): Promise<Hex> {
    const parsed = parseTransaction(rawTx);
    if (!parsed.to) {
      throw new Error("mock L1: contract creation not supported");
    }
    // Recover the sender via viem (parseTransaction returns r/s/v but not
    // `from` — recovering would need recoverTransactionAddress, which is
    // unnecessary here since the test holds the account that signed). The
    // test feeds `sendRawTransaction` only through viem's wallet client, so
    // we can read from in a post-hook. We pull it from the per-test wallet
    // adapter instead (see MockRpcTransport.attachSigner).
    const from = currentSender;
    if (!from) {
      throw new Error(
        "mock L1: no current sender — was sendRawTransaction called outside a tracked wallet?",
      );
    }
    const hash = keccak256(rawTx);
    const tx: StoredTx = {
      hash,
      from,
      to: parsed.to,
      data: (parsed.data ?? "0x") as Hex,
      value: parsed.value ?? 0n,
      blockNumber: this.blockNumber,
    };
    this.txs.set(hash, tx);
    this.recordedTxs.push(tx);
    this.blockNumber += 1n;
    const key = from.toLowerCase() as Address;
    this.nonces.set(key, (this.nonces.get(key) ?? 0) + 1);
    return hash;
  }
}

// Module-level pointer to the currently-signing account. We set this just
// before invoking sendTransaction so the mock chain can attribute the raw
// signed tx to the right sender without re-running ECDSA recovery (which
// would add no test coverage — viem already verifies its own signing).
let currentSender: Address | null = null;
function withSender<T>(addr: Address, fn: () => Promise<T>): Promise<T> {
  currentSender = addr;
  return fn().finally(() => {
    currentSender = null;
  });
}

// ─── Mock RPC transport ──────────────────────────────────────────────────
// Minimum surface needed for viem's `walletClient.sendTransaction` against a
// local account on an EIP-1559 chain: chainId, nonce, fee suggestion,
// gas estimate, block lookup for baseFee, sendRawTransaction, and the two
// tx-read methods.

function createMockRpcTransport(l1: MockL1): Transport {
  return custom({
    async request({ method, params }) {
      switch (method) {
        case "eth_chainId":
          return toHex(l1.chainId);

        case "eth_getTransactionCount": {
          const [addr] = params as [Address, string];
          return toHex(l1.getNonce(addr));
        }

        case "eth_blockNumber":
          return toHex(l1.blockNumber);

        case "eth_getBlockByNumber":
          // viem queries baseFeePerGas off the latest block when estimating
          // EIP-1559 fees. Return a synthetic block with a reasonable value.
          return {
            number: toHex(l1.blockNumber),
            hash: toHex(l1.blockNumber, { size: 32 }),
            parentHash: `0x${"00".repeat(32)}`,
            timestamp: toHex(BigInt(Math.floor(Date.now() / 1000))),
            gasLimit: toHex(30_000_000n),
            gasUsed: "0x0",
            baseFeePerGas: toHex(1_000_000_000n),
            miner: `0x${"00".repeat(20)}`,
            difficulty: "0x0",
            extraData: "0x",
            transactions: [],
            uncles: [],
            size: "0x0",
            nonce: "0x0000000000000000",
            mixHash: `0x${"00".repeat(32)}`,
            sha3Uncles: `0x${"00".repeat(32)}`,
            stateRoot: `0x${"00".repeat(32)}`,
            transactionsRoot: `0x${"00".repeat(32)}`,
            receiptsRoot: `0x${"00".repeat(32)}`,
            logsBloom: `0x${"00".repeat(256)}`,
            totalDifficulty: "0x0",
          };

        case "eth_maxPriorityFeePerGas":
          return toHex(1_000_000_000n);

        case "eth_gasPrice":
          return toHex(2_000_000_000n);

        case "eth_estimateGas":
          return toHex(100_000n);

        case "eth_feeHistory":
          return {
            oldestBlock: toHex(l1.blockNumber - 1n),
            baseFeePerGas: [toHex(1_000_000_000n), toHex(1_000_000_000n)],
            gasUsedRatio: [0.5],
            reward: [[toHex(1_000_000_000n)]],
          };

        case "eth_sendRawTransaction": {
          const [rawTx] = params as [Hex];
          return l1.sendRawTransaction(rawTx);
        }

        case "eth_getTransactionByHash": {
          const [hash] = params as [Hex];
          const tx = l1.getTransactionByHash(hash);
          if (!tx) return null;
          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            input: tx.data,
            value: toHex(tx.value),
            blockNumber: toHex(tx.blockNumber),
            blockHash: toHex(tx.blockNumber, { size: 32 }),
            transactionIndex: "0x0",
            nonce: "0x0",
            gas: "0x186a0",
            gasPrice: toHex(1_000_000_000n),
            type: "0x2",
            chainId: toHex(l1.chainId),
            v: "0x0",
            r: `0x${"00".repeat(32)}`,
            s: `0x${"00".repeat(32)}`,
          };
        }

        case "eth_getTransactionReceipt": {
          const [hash] = params as [Hex];
          return l1.getTransactionReceipt(hash);
        }

        default:
          throw new Error(`mock RPC: unsupported method ${method}`);
      }
    },
  });
}

// ─── Mock gateway ────────────────────────────────────────────────────────
// Implements just enough of /v1/escrow/* and /v1/grants/:id to drive the
// happy path and the two negative-path checks (insufficient balance, nonce
// replay). State is reset per test.

interface MockGrant {
  id: Hex;
  grantorAddress: Address;
  granteeId: Hex;
  scopes: string[];
  paymentStatus: "pending" | "paid";
  paidAt: string | null;
  paidBy: Address | null;
  grantVersion: string;
  fee: {
    asset: Address;
    registrationFee: bigint;
    dataAccessFee: bigint;
  };
}

class MockGateway {
  private readonly balances = new Map<string, bigint>(); // key = account:asset
  private readonly deposits = new Map<
    Hex,
    {
      txHash: Hex;
      account: Address;
      asset: Address;
      amount: bigint;
      status: "finalized";
      submittedAt: string;
      finalizedAt: string;
      blockNumber: bigint;
    }
  >();
  private readonly grants = new Map<Hex, MockGrant>();
  // granteeId → on-chain builder wallet address. Populated by seedBuilder;
  // used by MockPersonalServer to check that the data-access request was
  // signed by the wallet the grantor authorised.
  private readonly builders = new Map<Hex, Address>();
  // (payer:nonce:kind) sentinel for replay detection. The real gateway uses
  // a DB unique key; same shape works for the test.
  private readonly usedNonces = new Set<string>();
  // Records the requests the SDK sent so individual tests can assert on
  // wire format without re-mocking fetch.
  readonly requests: Array<{ url: string; init: RequestInit | undefined }> = [];

  constructor(private readonly l1: MockL1) {}

  seedGrant(grant: Omit<MockGrant, "paidAt" | "paidBy">): void {
    this.grants.set(grant.id.toLowerCase() as Hex, {
      ...grant,
      paidAt: null,
      paidBy: null,
    });
  }

  // Register a builder out-of-band — the SDK doesn't yet expose a
  // registerBuilder wrapper, so seeding keeps the test focused on the
  // grant + payment + data-access seams.
  seedBuilder(granteeId: Hex, granteeAddress: Address): void {
    this.builders.set(granteeId.toLowerCase() as Hex, granteeAddress);
  }

  // Accessors the MockPersonalServer reaches into. The real PS would call
  // the gateway over HTTP for these; we short-circuit since the data-access
  // path's gateway-trust assumption is out of scope for this test.
  getGrantById(id: Hex): MockGrant | undefined {
    return this.grants.get(id.toLowerCase() as Hex);
  }

  getBuilderAddress(granteeId: Hex): Address | undefined {
    return this.builders.get(granteeId.toLowerCase() as Hex);
  }

  balanceOf(account: Address, asset: Address): bigint {
    return (
      this.balances.get(`${account.toLowerCase()}:${asset.toLowerCase()}`) ?? 0n
    );
  }

  // Default fee schedule applied to every newly registered grant. In the
  // real gateway this comes from OpFeeRegistry; here it's a constant the
  // test inspects via getGrant.
  private static readonly DEFAULT_FEE = {
    asset: NATIVE_VANA_ASSET,
    registrationFee: 600n,
    dataAccessFee: 400n,
  } as const;

  // Deterministic grantId derivation — must match data-gateway/lib/grants.ts
  // exactly: keccak256(abi.encode(domainSeparator, grantor, granteeId))
  // where domainSeparator = keccak256(abi.encode(DOMAIN_TYPE_HASH, chainId,
  // verifyingContract)). Computed here (rather than imported from the SDK,
  // which doesn't export it yet) so a future divergence between the SDK's
  // creator-side helpers and the real gateway surfaces as a test failure.
  private static readonly DOMAIN_TYPE_HASH = keccak256(
    stringToHex(
      "DataPortabilityDomain(uint256 chainId,address verifyingContract)",
    ),
  );

  private computeGrantId(grantorAddress: Address, granteeId: Hex): Hex {
    const domainSeparator = keccak256(
      encodeAbiParameters(
        [
          { name: "typeHash", type: "bytes32" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        [
          MockGateway.DOMAIN_TYPE_HASH,
          BigInt(CONFIG.chainId),
          CONFIG.contracts.dataPortabilityPermissions as Address,
        ],
      ),
    );
    return keccak256(
      encodeAbiParameters(
        [
          { name: "domainSeparator", type: "bytes32" },
          { name: "grantorAddress", type: "address" },
          { name: "granteeId", type: "bytes32" },
        ],
        [domainSeparator, grantorAddress, granteeId],
      ),
    );
  }

  // fetch handler — dispatches by method + path. Designed so a single
  // vi.stubGlobal('fetch', ...) call hands all gateway URLs to this.
  async handle(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input.toString();
    this.requests.push({ url, init });
    const method = (init?.method ?? "GET").toUpperCase();
    const path = new URL(url).pathname;
    const search = new URL(url).searchParams;

    if (method === "POST" && path === "/v1/grants") {
      return this.handleCreateGrant(init);
    }
    if (method === "POST" && path === "/v1/escrow/deposit") {
      return this.handleSubmitDeposit(init);
    }
    if (method === "GET" && path === "/v1/escrow/balance") {
      return this.handleGetBalance(search.get("account"));
    }
    if (method === "POST" && path === "/v1/escrow/pay") {
      return this.handlePay(init);
    }
    if (method === "GET" && path.startsWith("/v1/grants/")) {
      const id = path.slice("/v1/grants/".length).toLowerCase() as Hex;
      return this.handleGetGrant(id);
    }

    return new Response(JSON.stringify({ error: "not mocked" }), {
      status: 404,
    });
  }

  private async handleCreateGrant(
    init: RequestInit | undefined,
  ): Promise<Response> {
    const body = JSON.parse(init?.body as string) as {
      grantorAddress: Address;
      granteeId: Hex;
      scopes: string[];
      grantVersion: string;
      expiresAt: string;
    };
    const authHeader = (init?.headers as Record<string, string> | undefined)?.[
      "Authorization"
    ];
    if (!authHeader || !authHeader.startsWith("Web3Signed ")) {
      return jsonResponse({ error: "missing signature" }, 401);
    }
    const signature = authHeader.slice("Web3Signed ".length) as Hex;

    // Same recovery the real gateway runs (data-gateway/lib/eip712.ts).
    // No server-delegated signing on this path in the test — keeps the
    // assertion sharp: a working createGrant means the SDK's domain +
    // type set matches the gateway's, exactly.
    const recovered = await recoverTypedDataAddress({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: body.grantorAddress,
        granteeId: body.granteeId,
        scopes: body.scopes,
        grantVersion: BigInt(body.grantVersion),
        expiresAt: BigInt(body.expiresAt),
      },
      signature,
    });
    if (recovered.toLowerCase() !== body.grantorAddress.toLowerCase()) {
      return jsonResponse({ error: "signer does not match grantor" }, 401);
    }

    const grantId = this.computeGrantId(body.grantorAddress, body.granteeId);
    this.grants.set(grantId.toLowerCase() as Hex, {
      id: grantId,
      grantorAddress: body.grantorAddress,
      granteeId: body.granteeId,
      scopes: body.scopes,
      paymentStatus: "pending",
      paidAt: null,
      paidBy: null,
      grantVersion: body.grantVersion,
      fee: { ...MockGateway.DEFAULT_FEE },
    });
    return jsonResponse({ grantId });
  }

  private handleSubmitDeposit(init: RequestInit | undefined): Response {
    const body = JSON.parse(init?.body as string) as { txHash: Hex };
    const tx = this.l1.getTransactionByHash(body.txHash);
    if (!tx) {
      return new Response(
        JSON.stringify({ error: "tx not found in mock L1" }),
        { status: 404 },
      );
    }
    if (tx.to.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "tx not addressed to escrow" }),
        { status: 400 },
      );
    }
    // Decode the same way the real gateway does — using the SDK's exported
    // ABI fragment. If the SDK's calldata ever drifts from what the gateway
    // expects, this decode will throw and the test will fail loudly.
    const decoded = decodeFunctionData({
      abi: ESCROW_DEPOSIT_ABI,
      data: tx.data,
    });
    let account: Address;
    let asset: Address;
    let amount: bigint;
    if (decoded.functionName === "depositNative") {
      [account] = decoded.args;
      asset = NATIVE_VANA_ASSET;
      amount = tx.value;
    } else {
      [account, asset, amount] = decoded.args;
    }
    const finalizedAt = new Date().toISOString();
    this.deposits.set(tx.hash.toLowerCase() as Hex, {
      txHash: tx.hash,
      account,
      asset,
      amount,
      status: "finalized",
      submittedAt: finalizedAt,
      finalizedAt,
      blockNumber: tx.blockNumber,
    });
    const key = `${account.toLowerCase()}:${asset.toLowerCase()}`;
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
    return jsonResponse(
      {
        txHash: tx.hash,
        account,
        status: "finalized",
        blockNumber: tx.blockNumber.toString(),
        submittedAt: finalizedAt,
        finalizedAt,
        lastError: null,
      },
      202,
    );
  }

  private handleGetBalance(accountParam: string | null): Response {
    if (!accountParam) {
      return new Response(JSON.stringify({ error: "missing account" }), {
        status: 400,
      });
    }
    const account = accountParam.toLowerCase() as Address;
    const balances = Array.from(this.balances.entries())
      .filter(([key]) => key.startsWith(`${account}:`))
      .map(([key, balance]) => {
        const [, asset] = key.split(":");
        return {
          asset,
          balance: balance.toString(),
          pendingAmount: "0",
          updatedAt: new Date().toISOString(),
        };
      });
    const finalized = Array.from(this.deposits.values())
      .filter((d) => d.account.toLowerCase() === account)
      .map((d) => ({
        txHash: d.txHash,
        finalizedAt: d.finalizedAt,
        blockNumber: d.blockNumber.toString(),
        claimedAsset: d.asset,
        claimedAmount: d.amount.toString(),
      }));
    return jsonResponse({
      account,
      balances,
      deposits: { submitted: [], finalized, failed: [] },
    });
  }

  private async handlePay(init: RequestInit | undefined): Promise<Response> {
    const body = JSON.parse(init?.body as string) as {
      payerAddress: Address;
      opType: string;
      opId: Hex;
      asset: Address;
      amount: string;
      paymentNonce: string;
    };
    const authHeader = (init?.headers as Record<string, string> | undefined)?.[
      "Authorization"
    ];
    if (!authHeader || !authHeader.startsWith("Web3Signed ")) {
      return jsonResponse({ error: "missing signature" }, 401);
    }
    const signature = authHeader.slice("Web3Signed ".length) as Hex;

    // Replay defence: (payer, nonce, kind) must be unique. We collapse to
    // (payer, nonce) here since the only `kind` in play in this test is the
    // bundled registration+access pair.
    const nonceKey = `${body.payerAddress.toLowerCase()}:${body.paymentNonce}`;
    if (this.usedNonces.has(nonceKey)) {
      return jsonResponse(
        { error: "paymentNonce already used by this payer" },
        409,
      );
    }

    // The signature is required to recover to the claimed payerAddress —
    // no server-side delegation on this endpoint.
    const recovered = await recoverTypedDataAddress({
      domain: escrowPaymentDomain(CONFIG),
      types: GENERIC_PAYMENT_TYPES,
      primaryType: "GenericPayment",
      message: {
        payerAddress: body.payerAddress,
        opType: body.opType,
        opId: body.opId,
        asset: body.asset,
        amount: BigInt(body.amount),
        paymentNonce: BigInt(body.paymentNonce),
      },
      signature,
    });
    if (recovered.toLowerCase() !== body.payerAddress.toLowerCase()) {
      return jsonResponse({ error: "signer does not match payer" }, 401);
    }

    const grant = this.grants.get(body.opId.toLowerCase() as Hex);
    if (!grant) {
      return jsonResponse({ error: "grant not found" }, 404);
    }

    const registrationDue =
      grant.paymentStatus === "paid" ? 0n : grant.fee.registrationFee;
    const expectedTotal = registrationDue + grant.fee.dataAccessFee;
    if (BigInt(body.amount) !== expectedTotal) {
      return jsonResponse(
        {
          error: "amount does not match canonical fee",
          expectedTotal: expectedTotal.toString(),
        },
        400,
      );
    }

    const key = `${body.payerAddress.toLowerCase()}:${body.asset.toLowerCase()}`;
    const available = this.balances.get(key) ?? 0n;
    if (available < BigInt(body.amount)) {
      return jsonResponse(
        {
          error: "insufficient balance",
          available: available.toString(),
        },
        402,
      );
    }
    // Soft-lock debit (this test doesn't model authorisations separately —
    // it just deducts).
    this.balances.set(key, available - BigInt(body.amount));
    this.usedNonces.add(nonceKey);

    const registrationPaid = grant.paymentStatus !== "paid";
    if (registrationPaid) {
      grant.paymentStatus = "paid";
      grant.paidAt = new Date().toISOString();
      grant.paidBy = body.payerAddress;
    }

    return jsonResponse({
      opType: body.opType,
      opId: body.opId,
      payerAddress: body.payerAddress,
      asset: body.asset,
      amount: body.amount,
      breakdown: {
        registrationFee: registrationDue.toString(),
        dataAccessFee: grant.fee.dataAccessFee.toString(),
        // Mirror real /v1/escrow/pay shape (api/v1/escrow/pay.ts:659):
        // `registrationPaid` is true on the call that settled the fee.
        registrationPaid,
      },
      paymentNonce: body.paymentNonce,
      paidAt: new Date().toISOString(),
    });
  }

  private handleGetGrant(id: Hex): Response {
    const grant = this.grants.get(id);
    if (!grant) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      });
    }
    const data: GatewayGrantResponse = {
      id: grant.id,
      grantorAddress: grant.grantorAddress,
      granteeId: grant.granteeId,
      scopes: grant.scopes,
      status: "confirmed",
      addedAt: new Date().toISOString(),
      expiresAt: null,
      expired: false,
      revokedAt: null,
      revocationSignature: null,
      paymentStatus: grant.paymentStatus,
      paidAt: grant.paidAt,
      paidBy: grant.paidBy,
      grantVersion: grant.grantVersion,
      fee: {
        asset: grant.fee.asset,
        registrationFee: grant.fee.registrationFee.toString(),
        dataAccessFee: grant.fee.dataAccessFee.toString(),
        totalDue: (
          (grant.paymentStatus === "paid" ? 0n : grant.fee.registrationFee) +
          grant.fee.dataAccessFee
        ).toString(),
      },
    };
    const envelope: GatewayEnvelope<GatewayGrantResponse> = {
      data,
      proof: {
        signature: "0xsig",
        timestamp: new Date().toISOString(),
        gatewayAddress: "0xgateway",
        requestHash: "0xrequest",
        responseHash: "0xresponse",
        userSignature: "0xuser",
        status: "ok",
        chainBlockHeight: Number(this.l1.blockNumber),
      },
    };
    return jsonResponse(envelope);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Mock Personal Server ────────────────────────────────────────────────
// Implements the data-access seam: GET /v1/data/:scope authenticated with
// a Web3Signed header carrying a `grantId` claim. Runs the same four
// checks a real PS would:
//   1. verifyWeb3Signed against the expected aud/method/uri
//   2. grant exists at the given grantId and is paid
//   3. recovered signer == the builder wallet on the grant's granteeId
//   4. requested scope is covered by the grant's scopes

const PERSONAL_SERVER_AUD = "https://ps.example.com";

class MockPersonalServer {
  readonly requests: Array<{ url: string; init: RequestInit | undefined }> = [];

  constructor(private readonly gateway: MockGateway) {}

  async handle(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input.toString();
    this.requests.push({ url, init });
    const parsed = new URL(url);
    const path = parsed.pathname;

    if ((init?.method ?? "GET").toUpperCase() !== "GET") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }
    if (!path.startsWith("/v1/data/")) {
      return jsonResponse({ error: "not found" }, 404);
    }
    const scope = path.slice("/v1/data/".length);
    const authHeader = (init?.headers as Record<string, string> | undefined)?.[
      "Authorization"
    ];

    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: authHeader,
        expectedOrigin: PERSONAL_SERVER_AUD,
        expectedMethod: "GET",
        expectedPath: path,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "auth failed";
      // The SDK's auth errors map cleanly onto 401 — keeping a single bucket
      // for parsing/signature/expiry failures so the test asserts only on
      // status code, not the exact error class.
      return jsonResponse({ error: message }, 401);
    }

    const claimedGrantId = verified.payload.grantId;
    if (!claimedGrantId) {
      return jsonResponse({ error: "grantId claim required" }, 401);
    }
    const grant = this.gateway.getGrantById(claimedGrantId as Hex);
    if (!grant) {
      return jsonResponse({ error: "grant not found" }, 404);
    }
    if (grant.paymentStatus !== "paid") {
      // 402 Payment Required — same status the gateway uses upstream.
      return jsonResponse(
        { error: "grant has unpaid registration", grantId: claimedGrantId },
        402,
      );
    }

    const expectedBuilder = this.gateway.getBuilderAddress(grant.granteeId);
    if (
      !expectedBuilder ||
      verified.signer.toLowerCase() !== expectedBuilder.toLowerCase()
    ) {
      return jsonResponse(
        { error: "signer is not the registered builder for this grant" },
        403,
      );
    }

    if (!scopeCoveredByGrant(scope, grant.scopes)) {
      return jsonResponse(
        {
          error: "scope not covered by grant",
          requested: scope,
          granted: grant.scopes,
        },
        403,
      );
    }

    // Stub data payload — the test asserts on the wrapper shape only since
    // actual decryption + storage paths aren't part of the e2e under test.
    return jsonResponse({
      scope,
      grantId: claimedGrantId,
      body: `data-for-${scope}`,
    });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Escrow deposit + payment e2e", () => {
  let l1: MockL1;
  let gateway: MockGateway;
  let personalServer: MockPersonalServer;
  let walletClient: ReturnType<typeof createWalletClient>;

  beforeEach(() => {
    l1 = new MockL1(CHAIN_ID);
    gateway = new MockGateway(l1);
    personalServer = new MockPersonalServer(gateway);
    // The builder's wallet has to be discoverable to the PS via its grant's
    // granteeId. Seeding the builder mapping is the cheapest stand-in for
    // POST /v1/builders, which the SDK doesn't expose a wrapper for yet.
    gateway.seedBuilder(GRANTEE_ID, builder.address);
    // Builder needs L1 funds to send the deposit tx. The mock chain doesn't
    // enforce gas-cost-against-balance (it just lets sends through), but we
    // set a balance anyway to mirror reality.
    l1.setBalance(builder.address, 100n * 10n ** 18n);

    walletClient = createWalletClient({
      account: builder,
      chain: FAKE_CHAIN,
      transport: createMockRpcTransport(l1),
    });

    // Dispatch fetch by host: gateway-side endpoints go to `gateway`, the
    // PS data-access route goes to `personalServer`. Both share state via
    // the gateway reference, so a payment made in step 6 is visible to
    // the PS check in step 8.
    vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const host = new URL(url).host;
      if (host === "gateway.example") return gateway.handle(input, init);
      if (host === "ps.example.com") return personalServer.handle(input, init);
      return new Response(JSON.stringify({ error: `not mocked: ${host}` }), {
        status: 404,
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a grant, funds escrow, pays the fee, and fetches data from the Personal Server", async () => {
    const sdk = createGatewayClient("https://gateway.example");
    const depositAmount = 1_000n;
    const grantFee = { registration: 600n, access: 400n };
    const totalDue = grantFee.registration + grantFee.access;
    const scope = "instagram.profile";

    // ── 1. Grantor signs GRANT_REGISTRATION_TYPES and registers ────────
    // The signature commits to scopes/grantVersion/expiresAt — the SDK's
    // exported domain + type set must agree with the gateway's recovery
    // call below or this whole flow falls over.
    const grantRegSignature = await grantor.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: grantor.address,
        granteeId: GRANTEE_ID,
        scopes: [scope],
        grantVersion: 1n,
        expiresAt: 0n,
      },
    });
    const createResult = await sdk.createGrant({
      grantorAddress: grantor.address,
      granteeId: GRANTEE_ID,
      scopes: [scope],
      grantVersion: "1",
      expiresAt: "0",
      signature: grantRegSignature,
    });
    expect(createResult.grantId).toMatch(/^0x[0-9a-f]{64}$/);
    const grantId = createResult.grantId as Hex;

    // ── 2. Deposit ─────────────────────────────────────────────────────
    const depositRequest = buildDepositNativeRequest(CONFIG, {
      account: builder.address,
      amount: depositAmount,
    });
    const depositTxHash = await withSender(builder.address, () =>
      walletClient.sendTransaction({
        account: builder,
        chain: FAKE_CHAIN,
        to: depositRequest.to,
        data: depositRequest.data,
        value: depositRequest.value,
      }),
    );

    // Sanity: the wallet actually delivered our calldata to the mock chain.
    const recorded = l1.recordedTxs.at(-1);
    expect(recorded?.to.toLowerCase()).toBe(ESCROW_ADDRESS.toLowerCase());
    expect(recorded?.value).toBe(depositAmount);
    expect(recorded?.data).toBe(
      encodeFunctionData({
        abi: ESCROW_DEPOSIT_ABI,
        functionName: "depositNative",
        args: [builder.address],
      }),
    );

    // ── 3. Announce to the gateway ─────────────────────────────────────
    const submitResult = await sdk.submitEscrowDeposit({
      txHash: depositTxHash,
    });
    expect(submitResult.status).toBe("finalized");
    expect(submitResult.account.toLowerCase()).toBe(
      builder.address.toLowerCase(),
    );

    // ── 4. Confirm the credited balance ────────────────────────────────
    const balance = await sdk.getEscrowBalance(builder.address);
    expect(balance.balances).toHaveLength(1);
    expect(balance.balances[0].balance).toBe(depositAmount.toString());
    expect(balance.deposits.finalized).toHaveLength(1);
    expect(balance.deposits.finalized[0].txHash).toBe(depositTxHash);

    // ── 5. Read the grant to discover totalDue (the real flow) ────────
    const grantBefore = await sdk.getGrant(grantId);
    expect(grantBefore?.paymentStatus).toBe("pending");
    expect(grantBefore?.fee.totalDue).toBe(totalDue.toString());

    // ── 6. Sign GenericPayment and submit ──────────────────────────────
    const signature = await builder.signTypedData({
      domain: escrowPaymentDomain(CONFIG),
      types: GENERIC_PAYMENT_TYPES,
      primaryType: "GenericPayment",
      message: {
        payerAddress: builder.address,
        opType: "grant",
        opId: grantId,
        asset: NATIVE_VANA_ASSET,
        amount: totalDue,
        paymentNonce: 1n,
      },
    });

    const payResult = await sdk.payForOperation({
      payerAddress: builder.address,
      opType: "grant",
      opId: grantId,
      asset: NATIVE_VANA_ASSET,
      amount: totalDue.toString(),
      paymentNonce: "1",
      signature,
    });

    expect(payResult.breakdown).toEqual({
      registrationFee: grantFee.registration.toString(),
      dataAccessFee: grantFee.access.toString(),
      registrationPaid: true,
    });

    // ── 7. Grant now shows as paid, balance debited ────────────────────
    const grantAfter = await sdk.getGrant(grantId);
    expect(grantAfter?.paymentStatus).toBe("paid");
    expect(grantAfter?.paidBy?.toLowerCase()).toBe(
      builder.address.toLowerCase(),
    );
    expect(grantAfter?.fee.totalDue).toBe(grantFee.access.toString());

    const balanceAfter = await sdk.getEscrowBalance(builder.address);
    expect(balanceAfter.balances[0].balance).toBe("0");

    // ── 8. Builder fetches data from the Personal Server ───────────────
    // buildWeb3SignedHeader produces an EIP-191-signed JWT-like header
    // pinned to (aud, method, uri, bodyHash, exp). The PS verifies the
    // header, checks grant.paymentStatus === 'paid', confirms the signer
    // is the grant's grantee, and runs scopeCoveredByGrant against the
    // path. All four checks have to pass.
    const dataPath = `/v1/data/${scope}`;
    const header = await buildWeb3SignedHeader({
      signMessage: (message) => builder.signMessage({ message }),
      aud: PERSONAL_SERVER_AUD,
      method: "GET",
      uri: dataPath,
      grantId,
    });
    const dataRes = await fetch(`${PERSONAL_SERVER_AUD}${dataPath}`, {
      method: "GET",
      headers: { Authorization: header },
    });
    expect(dataRes.status).toBe(200);
    const dataBody = (await dataRes.json()) as { scope: string; body: string };
    expect(dataBody).toEqual({
      scope,
      grantId,
      body: `data-for-${scope}`,
    });
  });

  it("rejects payment when escrow balance is insufficient (402)", async () => {
    const sdk = createGatewayClient("https://gateway.example");
    // No deposit — balance starts at 0.
    gateway.seedGrant({
      id: GRANT_ID,
      grantorAddress: grantor.address,
      granteeId: GRANTEE_ID,
      scopes: ["instagram.profile"],
      paymentStatus: "pending",
      grantVersion: "1",
      fee: {
        asset: NATIVE_VANA_ASSET,
        registrationFee: 600n,
        dataAccessFee: 400n,
      },
    });

    const signature = await builder.signTypedData({
      domain: escrowPaymentDomain(CONFIG),
      types: GENERIC_PAYMENT_TYPES,
      primaryType: "GenericPayment",
      message: {
        payerAddress: builder.address,
        opType: "grant",
        opId: GRANT_ID,
        asset: NATIVE_VANA_ASSET,
        amount: 1_000n,
        paymentNonce: 1n,
      },
    });

    await expect(
      sdk.payForOperation({
        payerAddress: builder.address,
        opType: "grant",
        opId: GRANT_ID,
        asset: NATIVE_VANA_ASSET,
        amount: "1000",
        paymentNonce: "1",
        signature,
      }),
    ).rejects.toThrow(/Gateway error: 402/);
  });

  it("rejects payment replay with the same paymentNonce (409)", async () => {
    const sdk = createGatewayClient("https://gateway.example");

    // Fund + seed for a clean first-payment success.
    const depositRequest = buildDepositNativeRequest(CONFIG, {
      account: builder.address,
      amount: 2_000n,
    });
    const txHash = await withSender(builder.address, () =>
      walletClient.sendTransaction({
        account: builder,
        chain: FAKE_CHAIN,
        to: depositRequest.to,
        data: depositRequest.data,
        value: depositRequest.value,
      }),
    );
    await sdk.submitEscrowDeposit({ txHash });
    gateway.seedGrant({
      id: GRANT_ID,
      grantorAddress: grantor.address,
      granteeId: GRANTEE_ID,
      scopes: ["instagram.profile"],
      paymentStatus: "pending",
      grantVersion: "1",
      fee: {
        asset: NATIVE_VANA_ASSET,
        registrationFee: 600n,
        dataAccessFee: 400n,
      },
    });

    const signature = await builder.signTypedData({
      domain: escrowPaymentDomain(CONFIG),
      types: GENERIC_PAYMENT_TYPES,
      primaryType: "GenericPayment",
      message: {
        payerAddress: builder.address,
        opType: "grant",
        opId: GRANT_ID,
        asset: NATIVE_VANA_ASSET,
        amount: 1_000n,
        paymentNonce: 1n,
      },
    });

    await sdk.payForOperation({
      payerAddress: builder.address,
      opType: "grant",
      opId: GRANT_ID,
      asset: NATIVE_VANA_ASSET,
      amount: "1000",
      paymentNonce: "1",
      signature,
    });

    // Re-submit the exact same signed payment — gateway must reject. The
    // real defence is the (payer, nonce, kind) DB unique key; the mock
    // models it with `usedNonces`.
    await expect(
      sdk.payForOperation({
        payerAddress: builder.address,
        opType: "grant",
        opId: GRANT_ID,
        asset: NATIVE_VANA_ASSET,
        amount: "1000",
        paymentNonce: "1",
        signature,
      }),
    ).rejects.toThrow(/Gateway error: 409/);
  });

  it("rejects data access on an unpaid grant (402)", async () => {
    const sdk = createGatewayClient("https://gateway.example");
    const scope = "instagram.profile";

    // Register the grant but never pay for it.
    const sig = await grantor.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: grantor.address,
        granteeId: GRANTEE_ID,
        scopes: [scope],
        grantVersion: 1n,
        expiresAt: 0n,
      },
    });
    const { grantId } = await sdk.createGrant({
      grantorAddress: grantor.address,
      granteeId: GRANTEE_ID,
      scopes: [scope],
      grantVersion: "1",
      expiresAt: "0",
      signature: sig,
    });

    const dataPath = `/v1/data/${scope}`;
    const header = await buildWeb3SignedHeader({
      signMessage: (message) => builder.signMessage({ message }),
      aud: PERSONAL_SERVER_AUD,
      method: "GET",
      uri: dataPath,
      grantId,
    });

    const res = await fetch(`${PERSONAL_SERVER_AUD}${dataPath}`, {
      method: "GET",
      headers: { Authorization: header },
    });
    // 402 is what the PS uses for "grant exists but registration unpaid" —
    // it surfaces back to the builder so they know to deposit + pay rather
    // than retry the request.
    expect(res.status).toBe(402);
  });

  it("rejects data access on a scope not covered by the grant (403)", async () => {
    const sdk = createGatewayClient("https://gateway.example");
    const grantedScope = "instagram.profile";
    const requestedScope = "chatgpt.conversations";

    // Full happy path through payment, but with a scope the grant doesn't
    // include. Once registration+payment are settled, the only thing
    // standing between the builder and the data is scopeCoveredByGrant —
    // and that's what this test pins down.
    const sig = await grantor.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: grantor.address,
        granteeId: GRANTEE_ID,
        scopes: [grantedScope],
        grantVersion: 1n,
        expiresAt: 0n,
      },
    });
    const { grantId } = await sdk.createGrant({
      grantorAddress: grantor.address,
      granteeId: GRANTEE_ID,
      scopes: [grantedScope],
      grantVersion: "1",
      expiresAt: "0",
      signature: sig,
    });

    // Deposit + pay so the grant flips to paid.
    const depositRequest = buildDepositNativeRequest(CONFIG, {
      account: builder.address,
      amount: 1_000n,
    });
    const depositTxHash = await withSender(builder.address, () =>
      walletClient.sendTransaction({
        account: builder,
        chain: FAKE_CHAIN,
        to: depositRequest.to,
        data: depositRequest.data,
        value: depositRequest.value,
      }),
    );
    await sdk.submitEscrowDeposit({ txHash: depositTxHash });
    const paySig = await builder.signTypedData({
      domain: escrowPaymentDomain(CONFIG),
      types: GENERIC_PAYMENT_TYPES,
      primaryType: "GenericPayment",
      message: {
        payerAddress: builder.address,
        opType: "grant",
        opId: grantId as Hex,
        asset: NATIVE_VANA_ASSET,
        amount: 1_000n,
        paymentNonce: 1n,
      },
    });
    await sdk.payForOperation({
      payerAddress: builder.address,
      opType: "grant",
      opId: grantId as string,
      asset: NATIVE_VANA_ASSET,
      amount: "1000",
      paymentNonce: "1",
      signature: paySig,
    });

    const dataPath = `/v1/data/${requestedScope}`;
    const header = await buildWeb3SignedHeader({
      signMessage: (message) => builder.signMessage({ message }),
      aud: PERSONAL_SERVER_AUD,
      method: "GET",
      uri: dataPath,
      grantId,
    });
    const res = await fetch(`${PERSONAL_SERVER_AUD}${dataPath}`, {
      method: "GET",
      headers: { Authorization: header },
    });
    expect(res.status).toBe(403);
  });
});
