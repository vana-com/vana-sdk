declare module 'eccrypto-js' {
  export interface Encrypted {
    iv: Buffer;
    ephemPublicKey: Buffer;
    ciphertext: Buffer;
    mac: Buffer;
  }

  export function encrypt(publicKey: Buffer, message: Buffer): Promise<Encrypted>;
  export function decrypt(privateKey: Buffer, encrypted: Encrypted): Promise<Buffer>;
  export function generatePrivate(): Buffer;
  export function getPublic(privateKey: Buffer): Buffer;
}