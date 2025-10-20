/**
 * Defines types for smart contract interactions.
 *
 * @remarks
 * This module provides comprehensive type definitions for Vana protocol
 * smart contracts including contract names, deployment information, and
 * advanced TypeScript utility types for type-safe contract interactions.
 *
 * @category Types
 * @module types/contracts
 */

import type { Abi, Address, Hash, GetContractReturnType } from "viem";

/**
 * Enumerates all supported Vana protocol contract names.
 *
 * @remarks
 * Use these names with `getContractController()` to get typed contract
 * instances. Each name corresponds to a specific protocol contract with
 * its own ABI and functionality.
 *
 * @category Contracts
 */
export type VanaContractName =
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
 * Provides contract deployment information with typed ABI.
 *
 * @remarks
 * Contains the minimum information needed to interact with a
 * deployed contract: its address and ABI.
 *
 * @typeParam TAbi - The contract's ABI type for full type safety
 *
 * @category Contracts
 */
export interface ContractInfo<TAbi extends Abi = Abi> {
  /** The contract's deployed address */
  address: Address;
  /** The contract's ABI */
  abi: TAbi;
}

/**
 * Tracks contract deployment metadata.
 *
 * @remarks
 * Records when and how a contract was deployed to the blockchain,
 * useful for verification and debugging.
 *
 * @category Contracts
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
 * Represents a fully typed contract instance.
 *
 * @remarks
 * Alias for viem's GetContractReturnType, providing a contract
 * instance with all methods fully typed based on the ABI.
 *
 * @typeParam TAbi - The contract's ABI type
 *
 * @category Contracts
 */
export type VanaContractInstance<TAbi extends Abi = Abi> =
  GetContractReturnType<TAbi>;

/**
 * Maps contract addresses by chain ID and contract name.
 *
 * @remarks
 * Hierarchical mapping structure for multi-chain contract deployments.
 * Used internally for address resolution across different networks.
 *
 * @category Contracts
 */
export type ContractAddresses = {
  [chainId: number]: {
    [contractName in VanaContractName]?: Address;
  };
};

/**
 * Extracts typed parameters for a contract method from its ABI.
 *
 * @remarks
 * Advanced utility type that provides type-safe parameter extraction
 * from contract ABIs. Maps Solidity types to TypeScript types automatically.
 *
 * @typeParam TAbi - The contract's ABI type
 * @typeParam TFunctionName - The name of the function to extract parameters for
 *
 * @internal
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
 * Extracts typed return values for a contract method from its ABI.
 *
 * @remarks
 * Advanced utility type that provides type-safe return type extraction
 * from contract ABIs. Handles single values and tuples appropriately.
 *
 * @typeParam TAbi - The contract's ABI type
 * @typeParam TFunctionName - The name of the function to extract return type for
 *
 * @internal
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
