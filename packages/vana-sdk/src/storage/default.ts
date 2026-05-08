import type { StorageProvider } from "../types/storage";
import { R2Storage, type R2Config } from "./providers/r2";

export interface VanaStorageProviderOptions {
  env?: Record<string, string | undefined>;
}

export function createVanaStorageProvider(
  options: VanaStorageProviderOptions = {},
): StorageProvider {
  return new R2Storage(resolveR2Config(options.env ?? readProcessEnv()));
}

function readProcessEnv(): Record<string, string | undefined> {
  if (
    typeof globalThis === "object" &&
    "process" in globalThis &&
    typeof globalThis.process === "object" &&
    globalThis.process !== null &&
    "env" in globalThis.process
  ) {
    return globalThis.process.env as Record<string, string | undefined>;
  }
  return {};
}

function resolveR2Config(env: Record<string, string | undefined>): R2Config {
  return {
    accountId: env.R2_ACCOUNT_ID,
    endpoint: env.R2_ENDPOINT,
    accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: env.R2_BUCKET ?? "",
    publicUrl: env.R2_PUBLIC_URL,
    region: env.R2_REGION,
  };
}
