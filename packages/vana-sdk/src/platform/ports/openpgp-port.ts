/**
 * OpenPGP implementation of PgpPort
 *
 * This adapter wraps the openpgp library and maps its complex API
 * to our simpler, testable port interface.
 */

import {
  readKey,
  readPrivateKey,
  decryptKey,
  readMessage,
  createMessage,
  encrypt,
  decrypt,
  generateKey,
  enums,
} from "openpgp";

import type {
  PgpPort,
  PgpEncryptInput,
  PgpDecryptInput,
  PgpResult,
  PgpKeyPair,
  PgpKeyPairOptions,
} from "./pgp-port";

export class OpenPgpPort implements PgpPort {
  async encrypt(input: PgpEncryptInput): Promise<PgpResult> {
    const publicKey = await readKey({ armoredKey: input.publicKeyArmored });
    const message = await createMessage({ text: input.text });

    const encrypted = await encrypt({
      message,
      encryptionKeys: publicKey,
      config: {
        preferredCompressionAlgorithm: enums.compression.zlib,
      },
    });

    return { data: encrypted as string };
  }

  async decrypt(input: PgpDecryptInput): Promise<PgpResult> {
    const privateKey = await readPrivateKey({
      armoredKey: input.privateKeyArmored,
    });
    const decryptedKey = input.passphrase
      ? await decryptKey({ privateKey, passphrase: input.passphrase })
      : privateKey;
    const message = await readMessage({ armoredMessage: input.messageArmored });

    const { data } = await decrypt({
      message,
      decryptionKeys: decryptedKey,
    });

    return { data: data as string };
  }

  async generateKeyPair(options: PgpKeyPairOptions = {}): Promise<PgpKeyPair> {
    const { name = "Vana User", email = "user@vana.org", passphrase } = options;

    const { publicKey, privateKey } = await generateKey({
      type: "rsa",
      rsaBits: 2048,
      userIDs: [{ name, email }],
      passphrase,
      config: {
        preferredCompressionAlgorithm: 2, // zlib
        preferredSymmetricAlgorithm: 7, // aes256
      },
    });

    return { publicKey, privateKey };
  }
}

// Default instance for production use
export const openPgpPort = new OpenPgpPort();
