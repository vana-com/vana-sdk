// This file provides demo-specific blockchain utilities that work alongside the SDK
// These are needed for the relayer service functionality demonstrated in this app

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "vana-sdk";

// Relayer configuration for demo purposes
const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY ||
  "0x3f572ac0f0671db5231100918c22296306be0ed77d4353f80ad8b4ea9317cf51";
const CHAIN_RPC_URL =
  process.env.CHAIN_RPC_URL || "https://rpc.moksha.vana.org";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "14800");

// Set up relayer wallet client for demo relayer service
const relayerAccount = privateKeyToAccount(
  RELAYER_PRIVATE_KEY as `0x${string}`,
);

const walletClient = createWalletClient({
  account: relayerAccount,
  chain: mokshaTestnet,
  transport: http(CHAIN_RPC_URL),
});

export const relayerConfig = {
  account: relayerAccount,
  chainId: CHAIN_ID,
  chainRpcUrl: CHAIN_RPC_URL,
  walletClient,
};
