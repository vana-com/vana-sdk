# Moksha identity fixture

`moksha-identity.json` is public identity evidence read on September 9, 2026 from
`https://dp-rpc-moksha-spike-b3.vercel.app/v1/identity?owner=0xF35b0b806DE33F2efcB8A3EbC84bDCe58Eb1DB03&chainId=14800`.
It contains no private keys, owner signatures, or sealed envelope.

The regression verifies its dstack signature chain against the shipped Moksha
worker application ID and KMS public key. The workers share application ID
`0xec9a39de98c760e1ded9f1e97016dc5f0e357cf2`; the controller does not derive owner
keys and is excluded. The KMS public key matches the existing Gateway allowlist
and the recovered signature-chain root. Mainnet remains unprovisioned.

This test covers SDK identity verification. It does not perform Intel DCAP quote
verification or establish freshness of the saved evidence. Deployment admission
continues to own the existing fresh attestation and measurement checks.
