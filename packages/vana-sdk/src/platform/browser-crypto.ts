/**
 * Browser-compatible secp256k1 ECIES implementation using @noble/secp256k1
 * This replaces eccrypto-js which has Node.js dependencies
 */

import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { hmac } from "@noble/hashes/hmac";
import { randomBytes } from "@noble/hashes/utils";

// AES-256-CBC implementation for browser
/**
 *
 * @param key
 * @param iv
 * @param data
 */
async function aes256CbcEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    data
  );
  
  return new Uint8Array(encrypted);
}

/**
 *
 * @param key
 * @param iv
 * @param data
 */
async function aes256CbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    data
  );
  
  return new Uint8Array(decrypted);
}

// ECIES encrypt/decrypt functions compatible with eccrypto
/**
 *
 * @param publicKey
 * @param message
 */
export async function encrypt(
  publicKey: Uint8Array | Buffer,
  message: Uint8Array | Buffer
): Promise<{
  iv: Buffer;
  ephemPublicKey: Buffer;
  ciphertext: Buffer;
  mac: Buffer;
}> {
  // Convert inputs to Uint8Array
  const pubKey = publicKey instanceof Buffer ? new Uint8Array(publicKey) : publicKey;
  const msg = message instanceof Buffer ? new Uint8Array(message) : message;
  
  // Generate ephemeral key pair
  const ephemPrivateKey = secp.utils.randomPrivateKey();
  const ephemPublicKey = secp.getPublicKey(ephemPrivateKey, false); // uncompressed
  
  // Derive shared secret using ECDH
  const sharedPoint = secp.getSharedSecret(ephemPrivateKey, pubKey, false);
  // Remove the 0x04 prefix from uncompressed point
  const sharedSecret = sharedPoint.slice(1);
  
  // Derive keys using SHA-512
  const hash = sha512(sharedSecret);
  const encryptionKey = hash.slice(0, 32);
  const macKey = hash.slice(32);
  
  // Generate random IV
  const iv = randomBytes(16);
  
  // Encrypt the message
  const ciphertext = await aes256CbcEncrypt(encryptionKey, iv, msg);
  
  // Calculate MAC
  const macData = new Uint8Array(iv.length + ephemPublicKey.length + ciphertext.length);
  macData.set(iv, 0);
  macData.set(ephemPublicKey, iv.length);
  macData.set(ciphertext, iv.length + ephemPublicKey.length);
  const mac = hmac(sha256, macKey, macData);
  
  return {
    iv: Buffer.from(iv),
    ephemPublicKey: Buffer.from(ephemPublicKey),
    ciphertext: Buffer.from(ciphertext),
    mac: Buffer.from(mac),
  };
}

/**
 *
 * @param privateKey
 * @param encryptedData
 * @param encryptedData.iv
 * @param encryptedData.ephemPublicKey
 * @param encryptedData.ciphertext
 * @param encryptedData.mac
 */
export async function decrypt(
  privateKey: Uint8Array | Buffer,
  encryptedData: {
    iv: Uint8Array | Buffer;
    ephemPublicKey: Uint8Array | Buffer;
    ciphertext: Uint8Array | Buffer;
    mac: Uint8Array | Buffer;
  }
): Promise<Buffer> {
  // Convert inputs to Uint8Array
  const privKey = privateKey instanceof Buffer ? new Uint8Array(privateKey) : privateKey;
  const iv = encryptedData.iv instanceof Buffer ? new Uint8Array(encryptedData.iv) : encryptedData.iv;
  const ephemPublicKey = encryptedData.ephemPublicKey instanceof Buffer 
    ? new Uint8Array(encryptedData.ephemPublicKey) 
    : encryptedData.ephemPublicKey;
  const ciphertext = encryptedData.ciphertext instanceof Buffer 
    ? new Uint8Array(encryptedData.ciphertext) 
    : encryptedData.ciphertext;
  const mac = encryptedData.mac instanceof Buffer 
    ? new Uint8Array(encryptedData.mac) 
    : encryptedData.mac;
  
  // Derive shared secret using ECDH
  const sharedPoint = secp.getSharedSecret(privKey, ephemPublicKey, false);
  // Remove the 0x04 prefix from uncompressed point
  const sharedSecret = sharedPoint.slice(1);
  
  // Derive keys using SHA-512
  const hash = sha512(sharedSecret);
  const encryptionKey = hash.slice(0, 32);
  const macKey = hash.slice(32);
  
  // Verify MAC
  const macData = new Uint8Array(iv.length + ephemPublicKey.length + ciphertext.length);
  macData.set(iv, 0);
  macData.set(ephemPublicKey, iv.length);
  macData.set(ciphertext, iv.length + ephemPublicKey.length);
  const expectedMac = hmac(sha256, macKey, macData);
  
  // Constant-time comparison
  let valid = mac.length === expectedMac.length;
  for (let i = 0; i < mac.length; i++) {
    valid = valid && mac[i] === expectedMac[i];
  }
  
  if (!valid) {
    throw new Error("Invalid MAC");
  }
  
  // Decrypt the message
  const decrypted = await aes256CbcDecrypt(encryptionKey, iv, ciphertext);
  
  return Buffer.from(decrypted);
}

/**
 * Derives a compressed public key from a private key
 * @param privateKey - The private key
 * @returns The compressed public key
 */
export function getPublicCompressed(privateKey: Uint8Array | Buffer): Buffer {
  const privKey = privateKey instanceof Buffer ? new Uint8Array(privateKey) : privateKey;
  const publicKey = secp.getPublicKey(privKey, true); // compressed
  return Buffer.from(publicKey);
}

/**
 * Derives an uncompressed public key from a private key
 * @param privateKey - The private key
 * @returns The uncompressed public key
 */
export function getPublic(privateKey: Uint8Array | Buffer): Buffer {
  const privKey = privateKey instanceof Buffer ? new Uint8Array(privateKey) : privateKey;
  const publicKey = secp.getPublicKey(privKey, false); // uncompressed
  return Buffer.from(publicKey);
}