#!/usr/bin/env node

/**
 * Script to generate test vectors from eccrypto for compatibility testing
 * Run this once to generate test vectors, then eccrypto can be removed
 */

import * as eccrypto from "eccrypto";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateTestVectors() {
  const vectors = [];

  // Test case 1: Simple text message
  {
    const privateKey = crypto.randomBytes(32);
    const publicKey = eccrypto.getPublic(privateKey);
    const message = Buffer.from("Hello, ECIES!");

    const encrypted = await eccrypto.encrypt(publicKey, message);

    vectors.push({
      name: "Simple text message",
      privateKey: privateKey.toString("hex"),
      publicKey: publicKey.toString("hex"),
      message: message.toString("hex"),
      encrypted: {
        iv: encrypted.iv.toString("hex"),
        ephemPublicKey: encrypted.ephemPublicKey.toString("hex"),
        ciphertext: encrypted.ciphertext.toString("hex"),
        mac: encrypted.mac.toString("hex"),
      },
    });
  }

  // Test case 2: Binary data
  {
    const privateKey = crypto.randomBytes(32);
    const publicKey = eccrypto.getPublic(privateKey);
    const message = crypto.randomBytes(64);

    const encrypted = await eccrypto.encrypt(publicKey, message);

    vectors.push({
      name: "Binary data (64 bytes)",
      privateKey: privateKey.toString("hex"),
      publicKey: publicKey.toString("hex"),
      message: message.toString("hex"),
      encrypted: {
        iv: encrypted.iv.toString("hex"),
        ephemPublicKey: encrypted.ephemPublicKey.toString("hex"),
        ciphertext: encrypted.ciphertext.toString("hex"),
        mac: encrypted.mac.toString("hex"),
      },
    });
  }

  // Test case 3: Large data
  {
    const privateKey = crypto.randomBytes(32);
    const publicKey = eccrypto.getPublic(privateKey);
    const message = crypto.randomBytes(1024);

    const encrypted = await eccrypto.encrypt(publicKey, message);

    vectors.push({
      name: "Large data (1KB)",
      privateKey: privateKey.toString("hex"),
      publicKey: publicKey.toString("hex"),
      message: message.toString("hex"),
      encrypted: {
        iv: encrypted.iv.toString("hex"),
        ephemPublicKey: encrypted.ephemPublicKey.toString("hex"),
        ciphertext: encrypted.ciphertext.toString("hex"),
        mac: encrypted.mac.toString("hex"),
      },
    });
  }

  // Test case 4: UTF-8 text with special characters
  {
    const privateKey = crypto.randomBytes(32);
    const publicKey = eccrypto.getPublic(privateKey);
    const message = Buffer.from("Hello 世界! 🎉 Special chars: àéîõü");

    const encrypted = await eccrypto.encrypt(publicKey, message);

    vectors.push({
      name: "UTF-8 text with special characters",
      privateKey: privateKey.toString("hex"),
      publicKey: publicKey.toString("hex"),
      message: message.toString("hex"),
      messageText: message.toString("utf8"),
      encrypted: {
        iv: encrypted.iv.toString("hex"),
        ephemPublicKey: encrypted.ephemPublicKey.toString("hex"),
        ciphertext: encrypted.ciphertext.toString("hex"),
        mac: encrypted.mac.toString("hex"),
      },
    });
  }

  // Test case 5: Known private key (for deterministic testing)
  {
    const privateKey = Buffer.from(
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "hex",
    );
    const publicKey = eccrypto.getPublic(privateKey);
    const message = Buffer.from("Test message with known key");

    const encrypted = await eccrypto.encrypt(publicKey, message);

    vectors.push({
      name: "Known private key test",
      privateKey: privateKey.toString("hex"),
      publicKey: publicKey.toString("hex"),
      message: message.toString("hex"),
      messageText: message.toString("utf8"),
      encrypted: {
        iv: encrypted.iv.toString("hex"),
        ephemPublicKey: encrypted.ephemPublicKey.toString("hex"),
        ciphertext: encrypted.ciphertext.toString("hex"),
        mac: encrypted.mac.toString("hex"),
      },
    });
  }

  return vectors;
}

async function main() {
  console.log("Generating test vectors from eccrypto...");

  const vectors = await generateTestVectors();

  const output = `/**
 * Test vectors generated from eccrypto for compatibility verification
 * Generated on: ${new Date().toISOString()}
 * eccrypto version: 1.1.6
 * 
 * These vectors ensure our ECIES implementation is compatible with eccrypto
 */

export const eccryptoTestVectors = ${JSON.stringify(vectors, null, 2)};

export const eccryptoFormat = {
  ivLength: 16,
  ephemPublicKeyLength: 65, // Uncompressed
  macLength: 32,
  // Format: iv || ephemPublicKey || ciphertext || mac
  getFormatLength: (ciphertextLength: number) => 16 + 65 + ciphertextLength + 32
};
`;

  const outputPath = path.join(
    __dirname,
    "../src/crypto/ecies/__tests__/test-vectors.ts",
  );
  fs.writeFileSync(outputPath, output);

  console.log(`Test vectors written to: ${outputPath}`);
  console.log(`Generated ${vectors.length} test vectors`);
}

main().catch(console.error);
