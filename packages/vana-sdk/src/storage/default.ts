import type { StorageProvider } from "../types/storage";
import { VanaStorage, type VanaStorageConfig } from "./providers/vana-storage";

export type VanaStorageProviderOptions = VanaStorageConfig;

export function createVanaStorageProvider(
  options: VanaStorageProviderOptions,
): StorageProvider {
  return new VanaStorage(options);
}
