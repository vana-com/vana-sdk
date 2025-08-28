import { ComputeEngineABI } from "./ComputeEngineImplementation";
import { DataRegistryABI } from "./DataRegistryImplementation";
import { TeePoolABI } from "./TeePoolImplementation";
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

// DLP Reward Contracts
import { VanaEpochABI } from "./VanaEpochImplementation";
import { DLPRegistryABI } from "./DLPRegistryImplementation";
import { DLPRegistryTreasuryABI } from "./DLPTreasuryImplementation";
import { DLPRewardDeployerTreasuryABI } from "./DLPRewardDeployerTreasuryImplementation";
import { DLPPerformanceABI } from "./DLPPerformanceImplementation";
import { DLPRewardDeployerABI } from "./DLPRewardDeployerImplementation";
import { DLPRewardSwapABI } from "./DLPRewardSwapImplementation";
import { SwapHelperABI } from "./SwapHelperImplementation";
import { DLPRootImplementation2Abi } from "./DLPRootImplementation";
import { DataLiquidityPoolImplementationAbi } from "./DataLiquidityPoolImplementation";
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
  ComputeEngineABI,
  DataRegistryABI,
  TeePoolABI,
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
  DLPPerformanceABI,
  DLPRewardDeployerABI,
  DLPRewardDeployerTreasuryABI,
  DLPRegistryTreasuryImplementationABI,
  DLPRewardSwapABI,
  SwapHelperABI,
  VanaPoolStakingABI,
  VanaPoolEntityABI,
  VanaPoolTreasuryABI,
  DATABI,
  DATFactoryABI,
  DATPausableABI,
  DATVotesABI,
  DLPRootImplementation2Abi,
  DataLiquidityPoolImplementationAbi,
};
