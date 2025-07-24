import type { Abi, Address, Hash } from "viem";
import type { GetContractReturnType } from "viem";

/**
 * Union type of all canonical Vana contract names
 */
export type VanaContractName =
  | "DataPermissions"
  | "DataPortabilityPermissions"
  | "DataPortabilityServers"
  | "DataPortabilityGrantees"
  | "DataRegistry"
  | "TeePool"
  | "ComputeEngine"
  | "TeePoolPhala"
  | "DataRefinerRegistry"
  | "QueryEngine"
  | "ComputeInstructionRegistry"
  | "TeePoolEphemeralStandard"
  | "TeePoolPersistentStandard"
  | "TeePoolPersistentGpu"
  | "TeePoolDedicatedStandard"
  | "TeePoolDedicatedGpu"
  | "VanaEpoch"
  | "DLPRegistry"
  | "DLPRegistryTreasury"
  | "DLPPerformance"
  | "DLPRewardDeployer"
  | "DLPRewardDeployerTreasury"
  | "DLPRewardSwap"
  | "SwapHelper"
  | "VanaPoolStaking"
  | "VanaPoolEntity"
  | "VanaPoolTreasury"
  | "DAT"
  | "DATFactory"
  | "DATPausable"
  | "DATVotes"
  | "DataLiquidityPool"
  | "DLPRoot";

/**
 * Contract information with typed address and ABI
 */
export interface ContractInfo<TAbi extends Abi = Abi> {
  /** The contract's deployed address */
  address: Address;
  /** The contract's ABI */
  abi: TAbi;
}

/**
 * Contract deployment information
 */
export interface ContractDeployment {
  /** The contract's deployed address */
  address: Address;
  /** Block number where contract was deployed */
  blockNumber: bigint;
  /** Transaction hash of deployment */
  transactionHash: Hash;
}

/**
 * Typed contract instance
 */
export type VanaContractInstance<TAbi extends Abi = Abi> =
  GetContractReturnType<TAbi>;

/**
 * Contract addresses mapping by chain and contract name
 */
export type ContractAddresses = {
  [chainId: number]: {
    [contractName in VanaContractName]?: Address;
  };
};

/**
 * Contract method parameters for typed interactions
 */
export type ContractMethodParams<
  TAbi extends Abi,
  TFunctionName extends string,
> = TAbi extends readonly unknown[]
  ? TAbi[number] extends {
      name: TFunctionName;
      type: "function";
      inputs: infer TInputs;
    }
    ? TInputs extends readonly unknown[]
      ? {
          [K in keyof TInputs]: TInputs[K] extends {
            name: infer TName;
            type: infer TType;
          }
            ? TName extends string
              ? TType extends "address"
                ? Address
                : TType extends "uint256"
                  ? bigint
                  : TType extends "string"
                    ? string
                    : TType extends "bool"
                      ? boolean
                      : TType extends "bytes32"
                        ? Hash
                        : unknown
              : never
            : never;
        }
      : never
    : never
  : never;

/**
 * Contract method return type for typed interactions
 */
export type ContractMethodReturnType<
  TAbi extends Abi,
  TFunctionName extends string,
> = TAbi extends readonly unknown[]
  ? TAbi[number] extends {
      name: TFunctionName;
      type: "function";
      outputs: infer TOutputs;
    }
    ? TOutputs extends readonly unknown[]
      ? TOutputs["length"] extends 1
        ? TOutputs[0] extends { type: infer TType }
          ? TType extends "address"
            ? Address
            : TType extends "uint256"
              ? bigint
              : TType extends "string"
                ? string
                : TType extends "bool"
                  ? boolean
                  : TType extends "bytes32"
                    ? Hash
                    : unknown
          : unknown
        : {
            [K in keyof TOutputs]: TOutputs[K] extends {
              name: infer TName;
              type: infer TType;
            }
              ? TName extends string
                ? TType extends "address"
                  ? Address
                  : TType extends "uint256"
                    ? bigint
                    : TType extends "string"
                      ? string
                      : TType extends "bool"
                        ? boolean
                        : TType extends "bytes32"
                          ? Hash
                          : unknown
                : never
              : never;
          }
      : never
    : never
  : never;
