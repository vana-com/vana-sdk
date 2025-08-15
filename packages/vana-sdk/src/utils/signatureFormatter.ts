import type { Hash } from "viem";

const V_OFFSET_FOR_ETHEREUM = 27;

/**
 * Formats a signature for Ethereum smart contract compatibility by adjusting the v-value.
 *
 * @remarks
 * This function ensures signature compatibility with Ethereum smart contracts by adjusting
 * the v-value component of ECDSA signatures. Some wallet implementations and signing methods
 * produce signatures with v-values in the range [0, 1], while Ethereum smart contracts
 * expect v-values in the range [27, 28] for proper signature verification.
 *
 * The function automatically detects signatures with low v-values and applies the standard
 * Ethereum offset (+27) to ensure compatibility. This is particularly important for gasless
 * transactions and EIP-712 signature verification in smart contracts.
 *
 * **Technical Details:**
 * - Ethereum signatures consist of r (32 bytes) + s (32 bytes) + v (1 byte) = 65 bytes total
 * - Valid v-values for Ethereum are 27 or 28 (or 0/1 + chain-specific offset for EIP-155)
 * - This function handles the common case where v ∈ [0, 1] needs adjustment to [27, 28]
 *
 * @param signature - The ECDSA signature hash to format (65 bytes as hex string)
 * @returns The formatted signature with correct v-value for Ethereum contract verification
 * @example
 * ```typescript
 * // Signature with v-value that needs adjustment
 * const rawSignature = "0x1234...5600"; // v = 0 (last byte)
 * const formatted = formatSignatureForContract(rawSignature);
 * // Result: "0x1234...561b" // v = 27 (0x1b)
 *
 * // Already properly formatted signature remains unchanged
 * const goodSignature = "0x1234...561b"; // v = 27
 * const unchanged = formatSignatureForContract(goodSignature);
 * // Result: "0x1234...561b" (no change needed)
 * ```
 * @category Cryptography
 */
export function formatSignatureForContract(signature: Hash): Hash {
  const cleanSig = signature.startsWith("0x") ? signature.slice(2) : signature;

  if (cleanSig.length !== 130) {
    return signature;
  }

  const vHex = cleanSig.slice(128, 130);
  const v = parseInt(vHex, 16);

  if (isNaN(v)) {
    return signature;
  }

  if (v < 27) {
    const adjustedV = (v + V_OFFSET_FOR_ETHEREUM).toString(16).padStart(2, "0");
    return `0x${cleanSig.slice(0, 128)}${adjustedV}` as Hash;
  }

  return signature;
}
