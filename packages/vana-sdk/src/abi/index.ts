// Re-export from generated location
import { ComputeEngineABI } from "../generated/abi/ComputeEngineImplementation";
import { DataRegistryABI } from "../generated/abi/DataRegistryImplementation";
import { TeePoolABI } from "../generated/abi/TeePoolImplementation";
import { TeePoolPhalaABI } from "../generated/abi/TeePoolPhalaImplementation";
// Data Portability Contracts
import { DataPortabilityPermissionsABI } from "../generated/abi/DataPortabilityPermissionsImplementation";
import { DataPortabilityServersABI } from "../generated/abi/DataPortabilityServersImplementation";
import { DataPortabilityGranteesABI } from "../generated/abi/DataPortabilityGranteesImplementation";

// Data Access Infrastructure
import { DataRefinerRegistryABI } from "../generated/abi/DataRefinerRegistryImplementation";
import { QueryEngineABI } from "../generated/abi/QueryEngineImplementation";
import { ComputeInstructionRegistryABI } from "../generated/abi/ComputeInstructionRegistryImplementation";

// TEE Pool Variants
import { TeePoolEphemeralStandardABI } from "../generated/abi/TeePoolEphemeralStandardImplementation";
import { TeePoolPersistentStandardABI } from "../generated/abi/TeePoolPersistentStandardImplementation";
import { TeePoolPersistentGpuABI } from "../generated/abi/TeePoolPersistentGpuImplementation";
import { TeePoolDedicatedStandardABI } from "../generated/abi/TeePoolDedicatedStandardImplementation";
import { TeePoolDedicatedGpuABI } from "../generated/abi/TeePoolDedicatedGpuImplementation";

// DLP Reward Contracts
import { VanaEpochABI } from "../generated/abi/VanaEpochImplementation";
import { DLPRegistryABI } from "../generated/abi/DLPRegistryImplementation";
import { DLPRegistryTreasuryABI } from "../generated/abi/DLPTreasuryImplementation";
import { DLPRewardDeployerTreasuryABI } from "../generated/abi/DLPRewardDeployerTreasuryImplementation";
import { DLPPerformanceABI } from "../generated/abi/DLPPerformanceImplementation";
import { DLPRewardDeployerABI } from "../generated/abi/DLPRewardDeployerImplementation";
import { DLPRewardSwapABI } from "../generated/abi/DLPRewardSwapImplementation";
import { SwapHelperABI } from "../generated/abi/SwapHelperImplementation";
import { DLPRootImplementation2Abi } from "../generated/abi/DLPRootImplementation";
import { DataLiquidityPoolImplementationAbi } from "../generated/abi/DataLiquidityPoolImplementation";
import { DLPRegistryTreasuryABI as DLPRegistryTreasuryImplementationABI } from "../generated/abi/DLPRegistryTreasuryImplementation";

// VanaPool (Staking)
import { VanaPoolStakingABI } from "../generated/abi/VanaPoolStakingImplementation";
import { VanaPoolEntityABI } from "../generated/abi/VanaPoolEntityImplementation";
import { VanaPoolTreasuryABI } from "../generated/abi/VanaPoolTreasuryImplementation";

// DLP Deployment Contracts
import { DATABI } from "../generated/abi/DATImplementation";
import { DATFactoryABI } from "../generated/abi/DATFactoryImplementation";
import { DATPausableABI } from "../generated/abi/DATPausableImplementation";
import { DATVotesABI } from "../generated/abi/DATVotesImplementation";

const contractAbis = {
  DataPortabilityPermissions: DataPortabilityPermissionsABI,
  DataPortabilityServers: DataPortabilityServersABI,
  DataPortabilityGrantees: DataPortabilityGranteesABI,
  DataRegistry: DataRegistryABI,
  TeePoolPhala: TeePoolPhalaABI, // Main TeePool (Intel TDX)
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

  // DLP Reward Contracts
  VanaEpoch: VanaEpochABI,
  DLPRegistry: DLPRegistryABI,
  DLPRegistryTreasury: DLPRegistryTreasuryABI,
  DLPRewardDeployerTreasury: DLPRewardDeployerTreasuryABI,
  DLPRegistryTreasuryImplementation: DLPRegistryTreasuryImplementationABI,
  DLPPerformance: DLPPerformanceABI,
  DLPRewardDeployer: DLPRewardDeployerABI,
  DLPRewardSwap: DLPRewardSwapABI,
  SwapHelper: SwapHelperABI,
  DataLiquidityPool: DataLiquidityPoolImplementationAbi,

  // VanaPool (Staking)
  VanaPoolStaking: VanaPoolStakingABI,
  VanaPoolEntity: VanaPoolEntityABI,
  VanaPoolTreasury: VanaPoolTreasuryABI,

  // DLP Deployment Contracts
  DAT: DATABI,
  DATFactory: DATFactoryABI,
  DATPausable: DATPausableABI,
  DATVotes: DATVotesABI,

  // Legacy/Deprecated (backward compatibility)
  DLPRoot: DLPRootImplementation2Abi,
  TeePool: TeePoolABI, // DEPRECATED: Intel SGX version (use TeePoolPhala instead)
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
  DataPortabilityPermissionsABI,
  DataPortabilityServersABI,
  DataPortabilityGranteesABI,
  VanaEpochABI,
  DLPRegistryABI,
  DLPRegistryTreasuryABI,
  DLPPerformanceABI,
  DLPRewardDeployerABI,
  DLPRewardDeployerTreasuryABI,
  DLPRegistryTreasuryImplementationABI,
  DLPRootImplementation2Abi,
  DataLiquidityPoolImplementationAbi,
};
