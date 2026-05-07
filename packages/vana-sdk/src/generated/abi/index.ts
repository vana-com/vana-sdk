import { ComputeEngineABI } from "./ComputeEngineImplementation";
import { DataRegistryABI } from "./DataRegistryImplementation";
import { TeePoolPhalaABI } from "./TeePoolPhalaImplementation";
// Data Portability Contracts
import { DataPortabilityPermissionsABI } from "./DataPortabilityPermissionsImplementation";
import { DataPortabilityServersABI } from "./DataPortabilityServersImplementation";
import { DataPortabilityGranteesABI } from "./DataPortabilityGranteesImplementation";

// Data Access Infrastructure
import { DataRefinerRegistryABI } from "./DataRefinerRegistryImplementation";
import { QueryEngineABI } from "./QueryEngineImplementation";
import { ComputeInstructionRegistryABI } from "./ComputeInstructionRegistryImplementation";

// TEE Pool Variants
import { TeePoolEphemeralStandardABI } from "./TeePoolEphemeralStandardImplementation";
import { TeePoolPersistentStandardABI } from "./TeePoolPersistentStandardImplementation";
import { TeePoolPersistentGpuABI } from "./TeePoolPersistentGpuImplementation";
import { TeePoolDedicatedStandardABI } from "./TeePoolDedicatedStandardImplementation";
import { TeePoolDedicatedGpuABI } from "./TeePoolDedicatedGpuImplementation";

// Vana Epoch / DLP Registry
import { VanaEpochABI } from "./VanaEpochImplementation";
import { DLPRegistryABI } from "./DLPRegistryImplementation";
import { DLPRegistryTreasuryABI } from "./DLPTreasuryImplementation";
import { VanaTreasuryABI } from "./VanaTreasuryImplementation";
import { DLPRegistryTreasuryABI as DLPRegistryTreasuryImplementationABI } from "./DLPRegistryTreasuryImplementation";

// VanaPool (Staking)
import { VanaPoolStakingABI } from "./VanaPoolStakingImplementation";
import { VanaPoolEntityABI } from "./VanaPoolEntityImplementation";
import { VanaPoolTreasuryABI } from "./VanaPoolTreasuryImplementation";

// DLP Deployment Contracts
import { DATABI } from "./DATImplementation";
import { DATFactoryABI } from "./DATFactoryImplementation";
import { DATPausableABI } from "./DATPausableImplementation";
import { DATVotesABI } from "./DATVotesImplementation";

const contractAbis = {
  DataPortabilityPermissions: DataPortabilityPermissionsABI,
  DataPortabilityServers: DataPortabilityServersABI,
  DataPortabilityGrantees: DataPortabilityGranteesABI,
  DataRegistry: DataRegistryABI,
  TeePoolPhala: TeePoolPhalaABI,
  ComputeEngine: ComputeEngineABI,

  // Data Access Infrastructure
  DataRefinerRegistry: DataRefinerRegistryABI,
  QueryEngine: QueryEngineABI,
  ComputeInstructionRegistry: ComputeInstructionRegistryABI,

  // TEE Pool Variants
  TeePoolEphemeralStandard: TeePoolEphemeralStandardABI,
  TeePoolPersistentStandard: TeePoolPersistentStandardABI,
  TeePoolPersistentGpu: TeePoolPersistentGpuABI,
  TeePoolDedicatedStandard: TeePoolDedicatedStandardABI,
  TeePoolDedicatedGpu: TeePoolDedicatedGpuABI,

  // Vana Epoch / DLP Registry
  VanaEpoch: VanaEpochABI,
  DLPRegistry: DLPRegistryABI,
  DLPRegistryTreasury: DLPRegistryTreasuryABI,
  DLPRegistryTreasuryImplementation: DLPRegistryTreasuryImplementationABI,
  VanaTreasury: VanaTreasuryABI,

  // VanaPool (Staking)
  VanaPoolStaking: VanaPoolStakingABI,
  VanaPoolEntity: VanaPoolEntityABI,
  VanaPoolTreasury: VanaPoolTreasuryABI,

  // DLP Deployment Contracts
  DAT: DATABI,
  DATFactory: DATFactoryABI,
  DATPausable: DATPausableABI,
  DATVotes: DATVotesABI,
} as const;

export type ContractAbis = typeof contractAbis;

export type VanaContract = keyof ContractAbis;

/**
 * Retrieves the ABI for a specific Vana contract
 *
 * @param contract - The name of the contract to get the ABI for
 * @returns The ABI array for the specified contract
 */
export function getAbi<T extends VanaContract>(contract: T): ContractAbis[T] {
  const abi = contractAbis[contract];
  if (!abi) {
    throw new Error(`Unsupported contract: ${contract}`);
  }
  return abi;
}

// Export individual ABIs
export {
  ComputeEngineABI,
  DataRegistryABI,
  TeePoolPhalaABI,
  DataPortabilityPermissionsABI,
  DataPortabilityServersABI,
  DataPortabilityGranteesABI,
  DataRefinerRegistryABI,
  QueryEngineABI,
  ComputeInstructionRegistryABI,
  TeePoolEphemeralStandardABI,
  TeePoolPersistentStandardABI,
  TeePoolPersistentGpuABI,
  TeePoolDedicatedStandardABI,
  TeePoolDedicatedGpuABI,
  VanaEpochABI,
  DLPRegistryABI,
  DLPRegistryTreasuryABI,
  DLPRegistryTreasuryImplementationABI,
  VanaPoolStakingABI,
  VanaPoolEntityABI,
  VanaPoolTreasuryABI,
  DATABI,
  DATFactoryABI,
  DATPausableABI,
  DATVotesABI,
};
