/**
 * Default (provisional) x402-style payment signer.
 *
 * @remarks
 * **PROVISIONAL.** There is no finalized payment-voucher scheme in this repo.
 * This default signer selects the first offered {@link PaymentRequirement},
 * signs a deterministic JSON payload describing the payment with the app's
 * EIP-191 key, and base64url-encodes a `{requirement, payload, signature}`
 * voucher as the `X-PAYMENT` header value. The shape is intended to be replaced
 * by the real x402 settlement format once defined; apps needing a stable scheme
 * today should inject their own {@link PaymentSigner}.
 *
 * @category Direct
 * @module direct/payment-signer
 */

import { toBase64 } from "../utils/encoding";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import { PaymentRequiredError } from "./errors";
import type {
  PaymentChallenge,
  PaymentRequirement,
  PaymentSigner,
} from "./types";

function base64url(input: string): string {
  return toBase64(new TextEncoder().encode(input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create the default {@link PaymentSigner} from an EIP-191 signer.
 *
 * @param signMessage - The app's EIP-191 signer (e.g. `account.signMessage`).
 * @returns A {@link PaymentSigner} that produces a provisional `X-PAYMENT` voucher.
 */
export function createDefaultPaymentSigner(
  signMessage: Web3SignedSignFn,
): PaymentSigner {
  return {
    async signPaymentChallenge(challenge: PaymentChallenge): Promise<string> {
      const requirement: PaymentRequirement | undefined = challenge.accepts[0];
      if (!requirement) {
        throw new PaymentRequiredError(
          "Payment challenge had no payment requirements to satisfy",
          { resource: challenge.resource },
        );
      }

      // Deterministic payload: sorted keys so the signed bytes are stable.
      const payload = {
        asset: requirement.asset,
        maxAmountRequired: requirement.maxAmountRequired,
        network: requirement.network,
        payTo: requirement.payTo,
        resource: challenge.resource,
        scheme: requirement.scheme,
      };
      const payloadJson = JSON.stringify(payload);
      const signature = await signMessage(payloadJson);

      const voucher = {
        x402Version: 1,
        scheme: requirement.scheme,
        network: requirement.network,
        payload: payload,
        signature,
      };
      return base64url(JSON.stringify(voucher));
    },
  };
}
