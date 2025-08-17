/* eslint-disable */
/**
 * Type definitions for tiny-secp256k1
 * @param tweak
 * @param signature
 * @param signature.r
 * @param signature.s
 */
declare module 'tiny-secp256k1' {
  export function isPrivate(privateKey: Buffer): boolean;
  export function isPoint(publicKey: Buffer): boolean;
  export function isPointCompressed(publicKey: Buffer): boolean;
  export function pointFromScalar(privateKey: Buffer, compressed?: boolean): Buffer | null;
  export function pointMultiply(publicKey: Buffer, privateKey: Buffer): Buffer | null;
  export function pointCompress(publicKey: Buffer, compressed: boolean): Buffer | null;
  export function pointAdd(publicKeyA: Buffer, publicKeyB: Buffer, compressed?: boolean): Buffer | null;
  export function pointAddScalar(publicKey: Buffer, scalar: Buffer, compressed?: boolean): Buffer | null;
  export function privateAdd(privateKey: Buffer, tweak: Buffer): Buffer | null;
  export function privateNegate(privateKey: Buffer): Buffer;
  export function privateSub(privateKey: Buffer, tweak: Buffer): Buffer | null;
  export function sign(hash: Buffer, privateKey: Buffer): { r: Buffer; s: Buffer };
  export function signRecoverable(hash: Buffer, privateKey: Buffer): { r: Buffer; s: Buffer; recovery: number };
  export function verify(hash: Buffer, publicKey: Buffer, signature: { r: Buffer; s: Buffer }): boolean;
}