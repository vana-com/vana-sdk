import type { Hash } from "viem";

const V_OFFSET_FOR_ETHEREUM = 27;

/**
 * Formats a signature for use in smart contracts by adjusting the v value if needed
 *
 * @param signature - The signature hash to format
 * @returns The formatted signature hash
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
