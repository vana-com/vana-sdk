/**
 * SDK-driven e2e of the deposit + grant + payment + settle flow.
 *
 * Mirrors data-gateway/scripts/e2e-escrow-deposit.ts step-for-step but
 * exercises every gateway endpoint through the SDK's GatewayClient + EIP-712
 * helpers. The script's job is *compatibility verification*: if the SDK's
 * wire format ever drifts from the gateway's, this script breaks at the
 * exact call site that drifted.
 *
 * What stays as raw viem (out of SDK scope):
 *   - createPublicClient + waitForTransactionReceipt — the SDK doesn't wrap
 *     RPC tx receipt waits because it stays signer/transport-agnostic.
 *   - createWalletClient.sendTransaction — same; SDK builds the deposit
 *     calldata via buildDepositNativeRequest and hands it to whatever
 *     wallet stack the caller already has.
 *   - publicClient.readContract / getBalance / parseEventLogs — chain-side
 *     verification of what the gateway said it did. Not the SDK's job.
 *
 * Usage:
 *   npm run e2e:deposit
 *
 * Env (read from .env.local in the SDK package dir if present):
 *   GATEWAY_URL                              default http://localhost:3000
 *   RPC_URL                                  default https://rpc.moksha.vana.org
 *   CHAIN_ID                                 default 14800 (Moksha)
 *   DATA_PORTABILITY_ESCROW_CONTRACT         default 0xcF50fAb…910A
 *   DATA_PORTABILITY_GRANTEES_CONTRACT       default 0x0000…0000
 *   DATA_PORTABILITY_PERMISSIONS_CONTRACT    default 0x0000…0000
 *   DATA_PORTABILITY_SERVER_CONTRACT         default 0x0000…0000
 *   DATA_REGISTRY_CONTRACT                   default 0x0000…0000
 *   FEE_REGISTRY_CONTRACT                    REQUIRED — fees + payees come from
 *                                            this on-chain registry (same source
 *                                            the gateway re-reads on every pay)
 *   FUNDER_PRIVATE_KEY                       REQUIRED — funded testnet key
 *   DEPOSIT_AMOUNT                           default 0.1  (VANA)
 *   SCOPE                                    default instagram.profile
 *   APP_URL                                  default https://example-app.test
 *   E2E_ACCESS_COUNT                         default 3
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { getPublicKey } from "@noble/secp256k1";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEther,
  parseEventLogs,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  ADD_DATA_TYPES,
  BUILDER_REGISTRATION_TYPES,
  GENERIC_PAYMENT_TYPES,
  GRANT_REGISTRATION_TYPES,
  NATIVE_VANA_ASSET,
  RECORD_DATA_ACCESS_TYPES,
  SERVER_REGISTRATION_TYPES,
  buildDepositNativeRequest,
  builderRegistrationDomain,
  createGatewayClient,
  dataRegistryDomain,
  escrowPaymentDomain,
  getOpFee,
  grantRegistrationDomain,
  serverRegistrationDomain,
  type DataPortabilityGatewayConfig,
} from "../src/index.node";

// ─── .env.local loader ──────────────────────────────────────────────────
loadEnvFile(resolve(process.cwd(), ".env.local"));

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

// ─── Configuration ──────────────────────────────────────────────────────

const GATEWAY_URL = (
  process.env["GATEWAY_URL"] ?? "http://localhost:3000"
).replace(/\/$/, "");
const RPC_URL = process.env["RPC_URL"] ?? "https://rpc.moksha.vana.org";
const CHAIN_ID = Number(process.env["CHAIN_ID"] ?? 14800);
const ESCROW_CONTRACT = (process.env["DATA_PORTABILITY_ESCROW_CONTRACT"] ??
  "0xcF50fAb402e2025a92e1bF811049820b6428910A") as Address;
const GRANTEES_CONTRACT = (process.env["DATA_PORTABILITY_GRANTEES_CONTRACT"] ??
  "0x0000000000000000000000000000000000000000") as Address;
const PERMISSIONS_CONTRACT = (process.env[
  "DATA_PORTABILITY_PERMISSIONS_CONTRACT"
] ?? "0x0000000000000000000000000000000000000000") as Address;
const SERVER_CONTRACT = (process.env["DATA_PORTABILITY_SERVER_CONTRACT"] ??
  "0x0000000000000000000000000000000000000000") as Address;
const DATA_REGISTRY_CONTRACT = (process.env["DATA_REGISTRY_CONTRACT"] ??
  "0x0000000000000000000000000000000000000000") as Address;
const FEE_REGISTRY_CONTRACT = (process.env["FEE_REGISTRY_CONTRACT"] ??
  "0x0000000000000000000000000000000000000000") as Address;
// No default — the script needs a real funded testnet wallet, and shipping
// a hardcoded key is both a leak risk and a footgun if multiple devs run
// it against the same address concurrently. Fail loudly if missing.
const FUNDER_PRIVATE_KEY = (() => {
  const v = process.env["FUNDER_PRIVATE_KEY"];
  if (!v) {
    throw new Error(
      "FUNDER_PRIVATE_KEY env var is required — set it in .env.local to a 0x-prefixed 32-byte hex private key with at least DEPOSIT_AMOUNT VANA on the target chain",
    );
  }
  return v as Hex;
})();
// Fees + payee come from the on-chain FeeRegistry at startup (see
// initFeeSchedule below) — same source of truth the gateway's
// /v1/escrow/pay handler uses. Hardcoded env defaults would only match
// the gateway's local fixtures by coincidence; against a Vercel preview
// or production gateway they'd nearly always trip the
// "Payment amount does not match canonical fee total" 400.
//
// Initialised with sentinel zeros so TS doesn't trip on read-before-write
// flow analysis — initFeeSchedule() rewrites all four at the top of main()
// before any consumer reads them.
let REGISTRATION_FEE = 0n;
let DATA_ACCESS_FEE = 0n;
let FEE_ASSET: Address = NATIVE_VANA_ASSET;
let PROTOCOL_FEE_RECIPIENT: Address =
  "0x0000000000000000000000000000000000000000";
const DEPOSIT_AMOUNT = parseEther(process.env["DEPOSIT_AMOUNT"] ?? "0.1");
const SCOPE = process.env["SCOPE"] ?? "instagram.profile";
const APP_URL = process.env["APP_URL"] ?? "https://example-app.test";
const EXTRA_ACCESS_COUNT = Number(process.env["E2E_ACCESS_COUNT"] ?? "3");
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;
const FINALIZE_TIMEOUT_MS = 180_000;
const FINALIZE_POLL_MS = 10_000;

const moksha = defineChain({
  id: CHAIN_ID,
  name: "Vana Moksha",
  nativeCurrency: { name: "VANA", symbol: "VANA", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

// The SDK's view of which contracts are deployed where. Every domain helper
// — builderRegistrationDomain, grantRegistrationDomain, etc. — reads from
// this single source of truth; if any address is wrong, EIP-712 recovery on
// the gateway side will produce a different signer and the request fails.
const sdkConfig: DataPortabilityGatewayConfig = {
  chainId: CHAIN_ID,
  contracts: {
    dataRegistry: DATA_REGISTRY_CONTRACT,
    dataPortabilityPermissions: PERMISSIONS_CONTRACT,
    dataPortabilityServer: SERVER_CONTRACT,
    dataPortabilityGrantees: GRANTEES_CONTRACT,
    dataPortabilityEscrow: ESCROW_CONTRACT,
    feeRegistry: FEE_REGISTRY_CONTRACT,
  },
};

// Contract ABIs for the post-settle on-chain verification (steps 14-18).
// The SDK doesn't expose these — they're chain-side state reads outside the
// gateway-facing wire format.
const SETTLED_EVENT_ABI = parseAbi([
  "event Settled(address indexed from, address indexed to, address indexed asset, uint256 amount, uint8 opKind)",
]);
const OP_KIND_REGISTRATION = 1;
const OP_KIND_DATA_ACCESS = 2;

const ESCROW_BALANCE_OF_ABI = parseAbi([
  "function balanceOf(address account, address asset) view returns (uint256)",
]);

const SERVERS_VIEW_ABI = parseAbi([
  "struct ServerInfo { bytes32 id; address ownerAddress; address serverAddress; string publicKey; string serverUrl; uint256 registeredAtBlock; uint256 revokedAtBlock; }",
  "function getActiveServerByAddress(address serverAddress) view returns (ServerInfo)",
]);

const DATA_REGISTRY_VIEW_ABI = parseAbi([
  "struct DataPointInfo { bytes32 id; address owner; string scope; uint8 status; uint256 currentVersion; bytes32 currentCommitment; uint64 createdAt; uint64 modifiedAt; uint256 totalAccesses; }",
  "function dataPoints(address ownerAddress, string scope) view returns (DataPointInfo)",
  "function isRecordIdUsed(bytes32 recordId) view returns (bool)",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────

let stepNumber = 0;
function step(msg: string): void {
  stepNumber += 1;
  console.log(`\n[${stepNumber}] ${msg}`);
}

async function pollUntil<T>(
  label: string,
  fn: () => Promise<T | null>,
  timeoutMs = POLL_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const result = await fn();
      if (result !== null) {
        console.log(`    ✓ ${label} (attempt ${attempt})`);
        return result;
      }
    } catch (err) {
      console.log(
        `    (attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)})`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

// Uncompressed secp256k1 public key as a 0x-prefixed hex string. The gateway
// stores publicKey as a string field on builder + server records; the
// uncompressed form (65 bytes) is what the contract expects on-chain.
function uncompressedPublicKey(privateKey: Hex): Hex {
  const bytes = getPublicKey(privateKey.slice(2), false);
  return ("0x" + Buffer.from(bytes).toString("hex")) as Hex;
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed (${label}): expected ${JSON.stringify(
        expected,
      )}, got ${JSON.stringify(actual)}`,
    );
  }
}

function formatSignedEther(v: bigint): string {
  if (v >= 0n) return "+" + formatEther(v);
  return "-" + formatEther(-v);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const publicClient = createPublicClient({
    chain: moksha,
    transport: http(RPC_URL),
  });
  const gateway = createGatewayClient(GATEWAY_URL);

  // Resolve the canonical fee schedule from the on-chain FeeRegistry —
  // same source the gateway re-reads on every /v1/escrow/pay, so the
  // amount we sign is guaranteed to match the gateway's expected total.
  // Throws cleanly when FEE_REGISTRY_CONTRACT is unset / zero-addressed.
  const opFee = await getOpFee(publicClient, sdkConfig);
  REGISTRATION_FEE = opFee.registrationFee;
  DATA_ACCESS_FEE = opFee.dataAccessFee;
  FEE_ASSET = opFee.asset;
  // The gateway uses the registration payee in the Settled-event filter
  // below. Per-kind payees can in principle differ; the gateway's e2e
  // script asserts they match, and so do we.
  if (
    opFee.registrationPayee.toLowerCase() !==
    opFee.dataAccessPayee.toLowerCase()
  ) {
    throw new Error(
      `FeeRegistry payee mismatch: registration=${opFee.registrationPayee}, data_access=${opFee.dataAccessPayee}. The e2e assertions assume a single fee recipient — update the e2e or unify payees.`,
    );
  }
  PROTOCOL_FEE_RECIPIENT = opFee.registrationPayee;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SDK E2E: escrow deposit + grant + payments + settle");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Gateway:     ${GATEWAY_URL}`);
  console.log(`  RPC:         ${RPC_URL}`);
  console.log(`  Chain ID:    ${CHAIN_ID}`);
  console.log(`  Escrow:      ${ESCROW_CONTRACT}`);
  console.log(`  Grantees:    ${GRANTEES_CONTRACT}`);
  console.log(`  Permissions: ${PERMISSIONS_CONTRACT}`);
  console.log(`  Servers:     ${SERVER_CONTRACT}`);
  console.log(`  DataRegistry:${DATA_REGISTRY_CONTRACT}`);
  console.log(`  FeeRegistry: ${FEE_REGISTRY_CONTRACT}`);
  console.log(`  Scope:       ${SCOPE}`);
  console.log(`  ExtraAccess: ${EXTRA_ACCESS_COUNT}`);
  console.log(
    `  Fees:        registration=${formatEther(REGISTRATION_FEE)} VANA, data_access=${formatEther(DATA_ACCESS_FEE)} VANA, asset=${FEE_ASSET}, payee=${PROTOCOL_FEE_RECIPIENT}`,
  );

  // ─── 1. App wallet ──────────────────────────────────────────────────
  step(
    "Generating fresh app wallet (builder owner + grantee + deposit beneficiary)",
  );
  const appKey = generatePrivateKey();
  const appAccount = privateKeyToAccount(appKey);
  const appPublicKey = uncompressedPublicKey(appKey);
  console.log(`    address:     ${appAccount.address}`);
  console.log(`    private key: ${appKey}  (TESTNET ONLY)`);

  // ─── 2. Funder deposits to the app wallet's escrow ──────────────────
  // The SDK builds the depositNative calldata; we hand it to viem to send.
  step(
    `Funder calling depositNative(${appAccount.address}) with ${formatEther(DEPOSIT_AMOUNT)} VANA`,
  );
  const funderAccount = privateKeyToAccount(FUNDER_PRIVATE_KEY);
  const funderBalance = await publicClient.getBalance({
    address: funderAccount.address,
  });
  console.log(`    funder:      ${funderAccount.address}`);
  console.log(`    funder bal:  ${formatEther(funderBalance)} VANA`);
  if (funderBalance < DEPOSIT_AMOUNT) {
    throw new Error(
      `Funder has ${formatEther(funderBalance)} VANA but needs ${formatEther(DEPOSIT_AMOUNT)}. Top up ${funderAccount.address} on Moksha and retry.`,
    );
  }
  const funderWallet = createWalletClient({
    account: funderAccount,
    chain: moksha,
    transport: http(RPC_URL),
  });
  const depositRequest = buildDepositNativeRequest(sdkConfig, {
    account: appAccount.address,
    amount: DEPOSIT_AMOUNT,
  });
  const depositTxHash = await funderWallet.sendTransaction({
    account: funderAccount,
    chain: moksha,
    to: depositRequest.to,
    data: depositRequest.data,
    value: depositRequest.value,
  });
  console.log(`    deposit tx:  ${depositTxHash}`);
  const depositReceipt = await publicClient.waitForTransactionReceipt({
    hash: depositTxHash,
  });
  if (depositReceipt.status !== "success") {
    throw new Error(`Deposit tx reverted: ${depositTxHash}`);
  }
  console.log(`    ✓ mined in block ${depositReceipt.blockNumber}`);

  // ─── 3. Submit txHash to the gateway via SDK ────────────────────────
  step("Submitting deposit txHash via gateway.submitEscrowDeposit");
  const submit = await gateway.submitEscrowDeposit({ txHash: depositTxHash });
  console.log(`    status:      ${submit.status}`);
  console.log(`    account:     ${submit.account}`);

  // ─── 4. Poll for credited balance via SDK ───────────────────────────
  step("Polling gateway.getEscrowBalance until deposit is credited");
  const credited = await pollUntil("balance reflects deposit", async () => {
    const r = await gateway.getEscrowBalance(appAccount.address);
    const native = r.balances.find(
      (b) => b.asset.toLowerCase() === NATIVE_VANA_ASSET.toLowerCase(),
    );
    if (!native) return null;
    if (BigInt(native.balance) < DEPOSIT_AMOUNT) {
      console.log(
        `    pending… balance=${native.balance} pending=${native.pendingAmount}`,
      );
      return null;
    }
    return native;
  });
  console.log(
    `    balance:           ${formatEther(BigInt(credited.balance))} VANA`,
  );
  console.log(
    `    authorizedAmount:  ${formatEther(BigInt(credited.authorizedAmount))} VANA`,
  );
  console.log(
    `    availableAmount:   ${formatEther(BigInt(credited.availableAmount))} VANA`,
  );

  // ─── 5. Register the app wallet as a builder via SDK ────────────────
  step("Registering app wallet as a builder via gateway.registerBuilder");
  const builderSig = await appAccount.signTypedData({
    domain: builderRegistrationDomain(sdkConfig),
    types: BUILDER_REGISTRATION_TYPES,
    primaryType: "BuilderRegistration",
    message: {
      ownerAddress: appAccount.address,
      granteeAddress: appAccount.address,
      publicKey: appPublicKey,
      appUrl: APP_URL,
    },
  });
  const builderResult = await gateway.registerBuilder({
    ownerAddress: appAccount.address,
    granteeAddress: appAccount.address,
    publicKey: appPublicKey,
    appUrl: APP_URL,
    signature: builderSig,
  });
  if (!builderResult.builderId) {
    throw new Error("registerBuilder did not return a builderId");
  }
  const builderId = builderResult.builderId as Hex;
  console.log(`    builderId:           ${builderId}`);
  console.log(`    alreadyRegistered:   ${builderResult.alreadyRegistered}`);

  // ─── 6. User wallet (grantor) ──────────────────────────────────────
  step("Generating fresh user wallet (grantor)");
  const userKey = generatePrivateKey();
  const userAccount = privateKeyToAccount(userKey);
  console.log(`    address:     ${userAccount.address}`);
  console.log(`    private key: ${userKey}  (TESTNET ONLY)`);

  // ─── 7. User registers a personal server via SDK ────────────────────
  step("User registering a personal server via gateway.registerServer");
  const serverKey = generatePrivateKey();
  const serverAccount = privateKeyToAccount(serverKey);
  const serverPublicKey = uncompressedPublicKey(serverKey);
  const serverUrl = "https://example-server.test";
  console.log(`    serverAddr:  ${serverAccount.address}`);
  const serverSig = await userAccount.signTypedData({
    domain: serverRegistrationDomain(sdkConfig),
    types: SERVER_REGISTRATION_TYPES,
    primaryType: "ServerRegistration",
    message: {
      ownerAddress: userAccount.address,
      serverAddress: serverAccount.address,
      publicKey: serverPublicKey,
      serverUrl,
    },
  });
  const serverResult = await gateway.registerServer({
    ownerAddress: userAccount.address,
    serverAddress: serverAccount.address,
    publicKey: serverPublicKey,
    serverUrl,
    signature: serverSig,
  });
  if (!serverResult.serverId) {
    throw new Error("registerServer did not return a serverId");
  }
  const serverId = serverResult.serverId as Hex;
  console.log(`    serverId:    ${serverId}`);

  // ─── 8. User registers a data point via SDK ─────────────────────────
  // Reuses the same SCOPE the grant covers so the access records signed
  // later target this exact data point.
  step("User registering a data point via gateway.registerDataPoint");
  const dataExpectedVersion = 1n;
  const dataHash = keccak256(stringToHex(`e2e:dataHash:${Date.now()}`));
  const metadataHash = keccak256(stringToHex(`e2e:metadataHash:${Date.now()}`));
  console.log(`    ownerAddress:    ${userAccount.address}`);
  console.log(`    scope:           ${SCOPE}`);
  console.log(`    dataHash:        ${dataHash}`);
  console.log(`    metadataHash:    ${metadataHash}`);
  console.log(`    expectedVersion: ${dataExpectedVersion}`);
  console.log(
    `    verifyingContract:${dataRegistryDomain(sdkConfig).verifyingContract} (DataRegistry)`,
  );
  const addDataSig = await userAccount.signTypedData({
    domain: dataRegistryDomain(sdkConfig),
    types: ADD_DATA_TYPES,
    primaryType: "AddData",
    message: {
      ownerAddress: userAccount.address,
      scope: SCOPE,
      dataHash,
      metadataHash,
      expectedVersion: dataExpectedVersion,
    },
  });
  const dataPointResult = await gateway.registerDataPoint({
    ownerAddress: userAccount.address,
    scope: SCOPE,
    dataHash,
    metadataHash,
    expectedVersion: dataExpectedVersion.toString(),
    signature: addDataSig,
  });
  if (!dataPointResult.dataPointId) {
    throw new Error("registerDataPoint did not return a dataPointId");
  }
  const dataPointId = dataPointResult.dataPointId as Hex;
  console.log(`    dataPointId: ${dataPointId}`);
  console.log(`    version:     ${dataPointResult.expectedVersion}`);

  // ─── 9. User signs + POSTs the grant via SDK ────────────────────────
  step(
    `User granting scope "${SCOPE}" to builder ${builderId.slice(0, 10)}… via gateway.createGrant`,
  );
  const grantVersion = 1n;
  const expiresAt = 0n; // perpetual
  const grantSig = await userAccount.signTypedData({
    domain: grantRegistrationDomain(sdkConfig),
    types: GRANT_REGISTRATION_TYPES,
    primaryType: "GrantRegistration",
    message: {
      grantorAddress: userAccount.address,
      granteeId: builderId,
      scopes: [SCOPE],
      grantVersion,
      expiresAt,
    },
  });
  const grantResult = await gateway.createGrant({
    grantorAddress: userAccount.address,
    granteeId: builderId,
    scopes: [SCOPE],
    grantVersion: grantVersion.toString(),
    expiresAt: expiresAt.toString(),
    signature: grantSig,
  });
  if (!grantResult.grantId) {
    throw new Error("createGrant did not return a grantId");
  }
  const grantId = grantResult.grantId as Hex;
  console.log(`    grantId:     ${grantId}`);

  // ─── 10. Verify pending via SDK GET ─────────────────────────────────
  step("Reading grant via gateway.getGrant — expecting paymentStatus=pending");
  const grantBefore = await gateway.getGrant(grantId);
  if (!grantBefore) {
    throw new Error(`grant ${grantId} not found by gateway.getGrant`);
  }
  console.log(`    paymentStatus:   ${grantBefore.paymentStatus}`);
  console.log(`    status:          ${grantBefore.status}`);
  console.log(`    fee.totalDue:    ${grantBefore.fee.totalDue}`);
  assertEq(grantBefore.paymentStatus, "pending", "paymentStatus pending");
  assertEq(
    grantBefore.fee.totalDue,
    (REGISTRATION_FEE + DATA_ACCESS_FEE).toString(),
    "fee.totalDue == registration + dataAccess",
  );

  // ─── 11. Pay registration + first data-access via SDK ───────────────
  const totalDue = REGISTRATION_FEE + DATA_ACCESS_FEE;
  step(
    `Paying registration (${formatEther(REGISTRATION_FEE)}) + data-access (${formatEther(DATA_ACCESS_FEE)}) = ${formatEther(totalDue)} VANA via gateway.payForOperation`,
  );
  const paySig = await appAccount.signTypedData({
    domain: escrowPaymentDomain(sdkConfig),
    types: GENERIC_PAYMENT_TYPES,
    primaryType: "GenericPayment",
    message: {
      payerAddress: appAccount.address,
      opType: "grant",
      opId: grantId,
      asset: FEE_ASSET,
      amount: totalDue,
      paymentNonce: 1n,
    },
  });
  const payResult = await gateway.payForOperation({
    payerAddress: appAccount.address,
    opType: "grant",
    opId: grantId,
    asset: FEE_ASSET,
    amount: totalDue.toString(),
    paymentNonce: "1",
    signature: paySig,
  });
  console.log(
    `    breakdown:   reg=${payResult.breakdown.registrationFee} access=${payResult.breakdown.dataAccessFee} registrationPaid=${payResult.breakdown.registrationPaid}`,
  );
  assertEq(
    payResult.breakdown.registrationFee,
    REGISTRATION_FEE.toString(),
    "registrationFee in breakdown",
  );
  assertEq(
    payResult.breakdown.dataAccessFee,
    DATA_ACCESS_FEE.toString(),
    "dataAccessFee in breakdown",
  );
  assertEq(payResult.breakdown.registrationPaid, true, "registrationPaid=true");

  // ─── 12. Verify paid via SDK GET ────────────────────────────────────
  step("Re-reading grant via gateway.getGrant — expecting paymentStatus=paid");
  const grantAfter = await gateway.getGrant(grantId);
  if (!grantAfter) throw new Error("grant disappeared after payment");
  console.log(`    paymentStatus:   ${grantAfter.paymentStatus}`);
  console.log(`    paidBy:          ${grantAfter.paidBy}`);
  console.log(`    paidAt:          ${grantAfter.paidAt}`);
  assertEq(grantAfter.paymentStatus, "paid", "paymentStatus paid");
  assertEq(
    grantAfter.paidBy?.toLowerCase(),
    appAccount.address.toLowerCase(),
    "paidBy = app wallet",
  );

  // ─── 13. N additional data-access payments with accessRecord ────────
  // Each payment commits to a fresh server-signed RECORD_DATA_ACCESS
  // attestation. The gateway re-uses these signatures verbatim on-chain
  // in the next /v1/settle pass via DataRegistryV2.recordDataAccess.
  if (EXTRA_ACCESS_COUNT < 1) {
    throw new Error(
      `EXTRA_ACCESS_COUNT must be >= 1 (got ${EXTRA_ACCESS_COUNT})`,
    );
  }
  step(
    `Paying ${EXTRA_ACCESS_COUNT} × data-access fee with server-signed accessRecords via gateway.payForOperation`,
  );
  const accessRecordIds: Hex[] = [];
  for (let i = 0; i < EXTRA_ACCESS_COUNT; i++) {
    const paymentNonceI = BigInt(2 + i);
    const paySigI = await appAccount.signTypedData({
      domain: escrowPaymentDomain(sdkConfig),
      types: GENERIC_PAYMENT_TYPES,
      primaryType: "GenericPayment",
      message: {
        payerAddress: appAccount.address,
        opType: "grant",
        opId: grantId,
        asset: FEE_ASSET,
        amount: DATA_ACCESS_FEE,
        paymentNonce: paymentNonceI,
      },
    });

    const recordId = keccak256(stringToHex(`e2e:recordId:${Date.now()}:${i}`));
    accessRecordIds.push(recordId);
    const accessSig = await serverAccount.signTypedData({
      domain: dataRegistryDomain(sdkConfig),
      types: RECORD_DATA_ACCESS_TYPES,
      primaryType: "RecordDataAccess",
      message: {
        ownerAddress: userAccount.address,
        scope: SCOPE,
        version: dataExpectedVersion,
        accessor: appAccount.address,
        recordId,
      },
    });

    const result = await gateway.payForOperation({
      payerAddress: appAccount.address,
      opType: "grant",
      opId: grantId,
      asset: FEE_ASSET,
      amount: DATA_ACCESS_FEE.toString(),
      paymentNonce: paymentNonceI.toString(),
      signature: paySigI,
      accessRecord: {
        dataPointId,
        version: dataExpectedVersion.toString(),
        accessor: appAccount.address,
        recordId,
        signature: accessSig,
      },
    });
    console.log(
      `    [${i + 1}/${EXTRA_ACCESS_COUNT}] paid recordId=${recordId} reg=${result.breakdown.registrationFee} access=${result.breakdown.dataAccessFee}`,
    );
    assertEq(
      result.breakdown.registrationFee,
      "0",
      `pay #${i + 2}: registrationFee = 0`,
    );
    assertEq(
      result.breakdown.dataAccessFee,
      DATA_ACCESS_FEE.toString(),
      `pay #${i + 2}: dataAccessFee in breakdown`,
    );
    assertEq(
      result.breakdown.registrationPaid,
      false,
      `pay #${i + 2}: registrationPaid = false (already settled)`,
    );
  }

  // ─── 14. Snapshot pre-settle balances ───────────────────────────────
  const totalDataAccess = 1 + EXTRA_ACCESS_COUNT;
  const bundledTotal =
    REGISTRATION_FEE + BigInt(totalDataAccess) * DATA_ACCESS_FEE;
  step(
    `Snapshotting pre-settle balances (bundle: 1 registration + ${totalDataAccess} data-access = ${formatEther(bundledTotal)} VANA)`,
  );
  const escrowBalanceBefore = await publicClient.getBalance({
    address: ESCROW_CONTRACT,
  });
  console.log(
    `    escrow contract native: ${formatEther(escrowBalanceBefore)} VANA`,
  );

  // ─── 15. Drain via SDK gateway.settle ───────────────────────────────
  step("Draining pending ops via gateway.settle");
  const settleResult = await gateway.settle();
  console.log(`    scanned:    ${settleResult.scanned}`);
  console.log(`    confirmed:  ${settleResult.confirmed}`);
  console.log(`    submitted:  ${settleResult.submitted}`);
  console.log(`    skipped:    ${settleResult.skipped}`);
  console.log(`    failed:     ${settleResult.failed}`);

  const ourGrant = settleResult.items.find(
    (i) =>
      i.opType === "grant" && i.opId.toLowerCase() === grantId.toLowerCase(),
  );
  if (!ourGrant) {
    throw new Error(`settle did not include our grantId ${grantId}`);
  }
  if (ourGrant.status !== "confirmed" && ourGrant.status !== "submitting") {
    throw new Error(`unexpected grant settle status: ${ourGrant.status}`);
  }
  console.log(`    grant item:  status=${ourGrant.status}`);
  if (ourGrant.status === "confirmed") {
    console.log(`      settleTxHash:     ${ourGrant.settleTxHash}`);
    console.log(`      chainBlockHeight: ${ourGrant.chainBlockHeight}`);
  }

  // server/data/access tolerate the same two intermediate states as the
  // grant — 'confirmed' (receipt waited for inline) or 'submitting' (tx
  // broadcast, receipt arrives later; the reconcile loop in step 18 picks
  // it up). Anything else is a real failure.
  type SettleItemType = (typeof settleResult.items)[number];
  function requireSettleProgress(
    item: SettleItemType | undefined,
    label: string,
    opId: Hex,
  ): void {
    if (!item) throw new Error(`settle did not include our ${label} ${opId}`);
    if (item.status !== "confirmed" && item.status !== "submitting") {
      throw new Error(`unexpected ${label} settle status: ${item.status}`);
    }
    console.log(`    ${label} item: status=${item.status}`);
  }

  requireSettleProgress(
    settleResult.items.find(
      (i) =>
        i.opType === "server" &&
        i.opId.toLowerCase() === serverId.toLowerCase(),
    ),
    "server",
    serverId,
  );
  requireSettleProgress(
    settleResult.items.find(
      (i) =>
        i.opType === "data" &&
        i.opId.toLowerCase() === dataPointId.toLowerCase(),
    ),
    "data",
    dataPointId,
  );
  for (const rid of accessRecordIds) {
    requireSettleProgress(
      settleResult.items.find(
        (i) =>
          i.opType === "access" && i.opId.toLowerCase() === rid.toLowerCase(),
      ),
      "access",
      rid,
    );
  }

  // ─── 16. Re-read grant via SDK; assert chain status matches ─────────
  step(
    "Re-reading grant via gateway.getGrant — chain status should match settle item",
  );
  const settledGrant = await gateway.getGrant(grantId);
  if (!settledGrant) throw new Error("grant disappeared after settle");
  console.log(`    status:           ${settledGrant.status}`);
  console.log(`    settleTxHash:     ${settledGrant.settleTxHash}`);
  console.log(`    settleSubmittedAt:${settledGrant.settleSubmittedAt}`);
  if (ourGrant.status === "confirmed") {
    assertEq(
      settledGrant.status,
      "confirmed",
      "grant.status matches settle item",
    );
    assertEq(
      settledGrant.settleTxHash?.toLowerCase(),
      ourGrant.settleTxHash?.toLowerCase() ?? null,
      "grant.settleTxHash matches settle item",
    );
  }

  // ─── 17. On-chain validation of bundled Settled events (raw viem) ───
  // The SDK doesn't (and shouldn't) wrap chain event parsing — this is
  // pure on-chain verification of what the gateway claims it did.
  if (ourGrant.status === "confirmed" && ourGrant.settleTxHash) {
    step(
      `Validating ${1 + totalDataAccess} Settled events on-chain + escrow balance Δ`,
    );
    const settleTxHash = ourGrant.settleTxHash as Hex;
    const receipt = await publicClient.getTransactionReceipt({
      hash: settleTxHash,
    });
    const settledLogs = parseEventLogs({
      abi: SETTLED_EVENT_ABI,
      logs: receipt.logs,
      eventName: "Settled",
    }).filter(
      (l) =>
        l.address.toLowerCase() === ESCROW_CONTRACT.toLowerCase() &&
        l.args.from.toLowerCase() === appAccount.address.toLowerCase() &&
        l.args.to.toLowerCase() === PROTOCOL_FEE_RECIPIENT.toLowerCase() &&
        l.args.asset.toLowerCase() === FEE_ASSET.toLowerCase(),
    );

    let sumToRecipient = 0n;
    let countRegistration = 0;
    let countDataAccess = 0;
    for (const ev of settledLogs) {
      sumToRecipient += ev.args.amount;
      if (ev.args.opKind === OP_KIND_REGISTRATION) countRegistration++;
      else if (ev.args.opKind === OP_KIND_DATA_ACCESS) countDataAccess++;
    }
    assertEq(settledLogs.length, 1 + totalDataAccess, "Settled events count");
    assertEq(countRegistration, 1, "registration-kind events");
    assertEq(countDataAccess, totalDataAccess, "data-access-kind events");
    if (sumToRecipient !== bundledTotal) {
      throw new Error(
        `Settled event sum mismatch: paid ${formatEther(sumToRecipient)}, expected ${formatEther(bundledTotal)}`,
      );
    }
    console.log(
      `    ✓ ${settledLogs.length} Settled events sum to ${formatEther(bundledTotal)} VANA (1 reg + ${totalDataAccess} data-access)`,
    );

    const escrowBalanceAfter = await publicClient.getBalance({
      address: ESCROW_CONTRACT,
      blockNumber: receipt.blockNumber,
    });
    const escrowDelta = escrowBalanceAfter - escrowBalanceBefore;
    console.log(
      `    escrow contract Δ: ${formatSignedEther(escrowDelta)} VANA (expected ${formatSignedEther(-bundledTotal)})`,
    );
    if (escrowDelta !== -bundledTotal) {
      throw new Error(
        `Escrow balance Δ mismatch: got ${formatSignedEther(escrowDelta)}, expected ${formatSignedEther(-bundledTotal)}`,
      );
    }
  }

  // ─── 18. Poll gateway.settle until reconcile finalizes everything ───
  step("Polling gateway.settle for reconcile to promote all ops → finalized");
  const finalizeStart = Date.now();
  const watched: Array<{ label: string; opId: Hex }> = [
    { label: "grant ", opId: grantId },
    { label: "server", opId: serverId },
    { label: "data  ", opId: dataPointId },
    ...accessRecordIds.map((rid, i) => ({
      label: `acc${String(i + 1).padStart(2, "0")}`,
      opId: rid,
    })),
  ];
  const status: Record<string, string | undefined> = {};
  while (Date.now() - finalizeStart < FINALIZE_TIMEOUT_MS) {
    const r = await gateway.settle();
    const elapsed = Math.round((Date.now() - finalizeStart) / 1000);
    let line = `    [${elapsed}s]`;
    let allFinalized = true;
    for (const w of watched) {
      const item = r.reconciled.items.find(
        (i) => i.opId.toLowerCase() === w.opId.toLowerCase(),
      );
      const cur = item?.status ?? status[w.opId] ?? "pending";
      status[w.opId] = cur;
      line += ` ${w.label}=${cur}`;
      if (cur !== "finalized") allFinalized = false;
      if (cur === "reorged") {
        throw new Error(
          `reconcile flagged ${w.label.trim()} ${w.opId} as reorged: ${item?.reason ?? ""}`,
        );
      }
    }
    console.log(line);
    if (allFinalized) {
      console.log(`    ✓ all ${watched.length} ops finalized in ${elapsed}s`);
      break;
    }
    await new Promise((r) => setTimeout(r, FINALIZE_POLL_MS));
  }
  if (status[grantId] !== "finalized") {
    throw new Error(
      `Timed out waiting for grant to finalize after ${FINALIZE_TIMEOUT_MS / 1000}s`,
    );
  }

  // ─── 19. Cross-check via SDK — finalized grant reads ────────────────
  step("Cross-checking finalized state via gateway.listGrantsByUser");
  const userGrants = await gateway.listGrantsByUser(userAccount.address);
  const final = userGrants.find(
    (g) => g.id.toLowerCase() === grantId.toLowerCase(),
  );
  if (!final) {
    throw new Error(
      `listGrantsByUser(${userAccount.address}) did not include our grant`,
    );
  }
  console.log(`    status:             ${final.status}`);
  console.log(`    paymentStatus:      ${final.paymentStatus}`);
  console.log(`    settleTxHash:       ${final.settleTxHash}`);
  assertEq(final.status, "finalized", "grant.status finalized");

  // ─── 20. SDK balance vs. on-chain balance ───────────────────────────
  // Post-finalize, the gateway's `balance` is decremented and
  // `authorizedAmount` returns to 0 — same as the on-chain net.
  step("Comparing gateway.getEscrowBalance to on-chain escrow.balanceOf");
  const chainBalance = await publicClient.readContract({
    address: ESCROW_CONTRACT,
    abi: ESCROW_BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: [appAccount.address, FEE_ASSET],
  });
  const finalSdkBalance = await gateway.getEscrowBalance(appAccount.address);
  const nativeEntry = finalSdkBalance.balances.find(
    (b) => b.asset.toLowerCase() === NATIVE_VANA_ASSET.toLowerCase(),
  );
  if (!nativeEntry) {
    throw new Error("gateway returned no native balance row after finalize");
  }
  const sdkBalance = BigInt(nativeEntry.balance);
  const sdkAuthorized = BigInt(nativeEntry.authorizedAmount);
  const sdkAvailable = BigInt(nativeEntry.availableAmount);
  console.log(
    `    on-chain balanceOf:       ${formatEther(chainBalance)} VANA`,
  );
  console.log(`    sdk balance:              ${formatEther(sdkBalance)} VANA`);
  console.log(
    `    sdk authorizedAmount:     ${formatEther(sdkAuthorized)} VANA`,
  );
  console.log(
    `    sdk availableAmount:      ${formatEther(sdkAvailable)} VANA`,
  );
  console.log(
    `    expected (deposit - bundled): ${formatEther(DEPOSIT_AMOUNT - bundledTotal)} VANA`,
  );
  assertEq(sdkAuthorized.toString(), "0", "authorizedAmount=0 post-finalize");
  if (sdkBalance !== chainBalance) {
    throw new Error(
      `gateway balance ${formatEther(sdkBalance)} != on-chain ${formatEther(chainBalance)}`,
    );
  }
  if (sdkAvailable !== chainBalance) {
    throw new Error(
      `gateway available ${formatEther(sdkAvailable)} != on-chain ${formatEther(chainBalance)}`,
    );
  }
  console.log(`    ✓ gateway balance == on-chain balanceOf`);

  // ─── 21. Final on-chain verification (raw viem) ────────────────────
  step("Final on-chain verification (server + data point + access records)");
  const onchainServer = await publicClient.readContract({
    address: SERVER_CONTRACT,
    abi: SERVERS_VIEW_ABI,
    functionName: "getActiveServerByAddress",
    args: [serverAccount.address],
  });
  assertEq(
    onchainServer.id.toLowerCase(),
    serverId.toLowerCase(),
    "on-chain serverId matches",
  );
  assertEq(
    getAddress(onchainServer.ownerAddress),
    getAddress(userAccount.address),
    "on-chain server.ownerAddress == user",
  );

  const onchainDataPoint = await publicClient.readContract({
    address: DATA_REGISTRY_CONTRACT,
    abi: DATA_REGISTRY_VIEW_ABI,
    functionName: "dataPoints",
    args: [userAccount.address, SCOPE],
  });
  assertEq(
    onchainDataPoint.id.toLowerCase(),
    dataPointId.toLowerCase(),
    "on-chain dataPointId matches",
  );
  assertEq(
    onchainDataPoint.currentVersion,
    dataExpectedVersion,
    "on-chain currentVersion",
  );

  for (let i = 0; i < accessRecordIds.length; i++) {
    const rid = accessRecordIds[i];
    const used = await publicClient.readContract({
      address: DATA_REGISTRY_CONTRACT,
      abi: DATA_REGISTRY_VIEW_ABI,
      functionName: "isRecordIdUsed",
      args: [rid],
    });
    assertEq(used, true, `on-chain isRecordIdUsed(${rid})`);
  }
  assertEq(
    onchainDataPoint.totalAccesses,
    BigInt(EXTRA_ACCESS_COUNT),
    `on-chain totalAccesses == ${EXTRA_ACCESS_COUNT}`,
  );
  console.log(
    `    ✓ server + data point + ${accessRecordIds.length} access record(s) verified on-chain`,
  );

  // ─── Done ──────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ✓ SDK E2E PASSED");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  app wallet:    ${appAccount.address}`);
  console.log(`  user wallet:   ${userAccount.address}`);
  console.log(`  server addr:   ${serverAccount.address}`);
  console.log(`  builderId:     ${builderId}`);
  console.log(`  serverId:      ${serverId}`);
  console.log(`  dataPointId:   ${dataPointId}`);
  console.log(`  grantId:       ${grantId}`);
  console.log(`  grant.status:  ${final.status}`);
  console.log(
    `  bundled:       1× registration + ${totalDataAccess}× data-access = ${formatEther(bundledTotal)} VANA`,
  );
  console.log(
    `  access record settles (${accessRecordIds.length}): ${accessRecordIds.map((r) => r.slice(0, 10) + "…").join(", ")}`,
  );
}

main().catch((err) => {
  console.error("\n✗ SDK E2E flow failed:");
  console.error(err);
  process.exit(1);
});
