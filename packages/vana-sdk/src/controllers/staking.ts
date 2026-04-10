/**
 * Provides staking functionality for the VanaPool protocol.
 *
 * @remarks
 * This controller handles interactions with VanaPool staking contracts,
 * allowing users to query staking information such as total VANA staked,
 * entity information, and staker positions.
 *
 * @category Controllers
 * @module StakingController
 */

import type { ControllerContext } from "../types/controller-context";
import type { TransactionOptions } from "../types/operations";
import { BaseController } from "./base";
import { getContract, parseEther } from "viem";
import type { Address, Hash } from "viem";
import { getContractAddress } from "../generated/addresses";
import { getAbi } from "../generated/abi";
import { BlockchainError } from "../errors";

/**
 * Information about a staking entity in the VanaPool protocol.
 */
export interface EntityInfo {
  entityId: bigint;
  ownerAddress: Address;
  status: number;
  name: string;
  maxAPY: bigint;
  lockedRewardPool: bigint;
  activeRewardPool: bigint;
  totalShares: bigint;
  lastUpdateTimestamp: bigint;
  totalDistributedRewards: bigint;
}

/**
 * Information about a staker's position in an entity.
 */
export interface StakerEntityInfo {
  shares: bigint;
  costBasis: bigint;
  rewardEligibilityTimestamp: bigint;
  realizedRewards: bigint;
  vestedRewards: bigint;
}

/**
 * Comprehensive staking summary for a staker in an entity.
 */
export interface StakerEntitySummary {
  /** Number of shares owned by the staker */
  shares: bigint;
  /** Cost basis - the original VANA amount staked */
  costBasis: bigint;
  /** Current value of the staker's shares in VANA */
  currentValue: bigint;
  /** Timestamp when rewards become eligible */
  rewardEligibilityTimestamp: bigint;
  /** Remaining bonding time in seconds (0 if bonding period has passed) */
  remainingBondingTime: bigint;
  /** Whether the staker is still in the bonding period */
  isInBondingPeriod: boolean;
  /** Vested rewards that can be claimed without penalty */
  vestedRewards: bigint;
  /** Unvested rewards (pending interest = currentValue - costBasis) */
  unvestedRewards: bigint;
  /** Realized/withdrawn rewards (already claimed) */
  realizedRewards: bigint;
  /** Total earned rewards (includes vested, unvested, and realized) */
  earnedRewards: bigint;
}

/**
 * Controller for VanaPool staking operations.
 *
 * @remarks
 * Provides methods to query staking information from the VanaPool contracts.
 * This includes total VANA staked across the protocol, entity information,
 * and individual staker positions.
 *
 * @example
 * ```typescript
 * // Get total VANA staked in the protocol
 * const totalStaked = await vana.staking.getTotalVanaStaked();
 * console.log(`Total staked: ${totalStaked} wei`);
 *
 * // Get entity information
 * const entity = await vana.staking.getEntity(1n);
 * console.log(`Entity name: ${entity.name}`);
 * ```
 *
 * @category Controllers
 */
export class StakingController extends BaseController {
  constructor(context: ControllerContext) {
    super(context);
  }

  /**
   * Gets the chain ID from context.
   */
  private getChainId(): number {
    const chainId =
      this.context.walletClient?.chain?.id ??
      this.context.publicClient.chain?.id;
    if (!chainId) {
      throw new Error("Chain ID not available");
    }
    return chainId;
  }

  /**
   * Gets the VanaPoolEntity contract instance.
   */
  private getEntityContract() {
    const chainId = this.getChainId();
    return getContract({
      address: getContractAddress(chainId, "VanaPoolEntity"),
      abi: getAbi("VanaPoolEntity"),
      client: this.context.publicClient,
    });
  }

  /**
   * Gets the VanaPoolStaking contract instance.
   */
  private getStakingContract() {
    const chainId = this.getChainId();
    return getContract({
      address: getContractAddress(chainId, "VanaPoolStaking"),
      abi: getAbi("VanaPoolStaking"),
      client: this.context.publicClient,
    });
  }

  /**
   * Gets the total amount of VANA staked in the VanaPool protocol or a specific entity.
   *
   * @remarks
   * When called without an entityId, this retrieves the sum of activeRewardPool
   * across all active entities in the VanaPool protocol.
   * When called with an entityId, this returns the activeRewardPool for that specific entity.
   * The value is returned in wei (10^18 = 1 VANA).
   *
   * @param entityId - Optional entity ID to get staked amount for a specific entity
   * @returns The total amount of VANA staked in wei
   *
   * @example
   * ```typescript
   * // Get total staked across all entities
   * const totalStaked = await vana.staking.getTotalVanaStaked();
   * console.log(`Total staked: ${Number(totalStaked) / 1e18} VANA`);
   *
   * // Get staked amount for a specific entity
   * const entityStaked = await vana.staking.getTotalVanaStaked(1n);
   * console.log(`Entity 1 staked: ${Number(entityStaked) / 1e18} VANA`);
   * ```
   */
  async getTotalVanaStaked(entityId?: bigint): Promise<bigint> {
    const entityContract = this.getEntityContract();

    // If entityId is provided, return the activeRewardPool for that specific entity
    if (entityId !== undefined) {
      const entity = await entityContract.read.entities([entityId]);
      return entity.activeRewardPool;
    }

    // Otherwise, sum up the activeRewardPool from all active entities
    const activeEntityIds = await entityContract.read.activeEntitiesValues();

    let totalStaked = 0n;
    for (const id of activeEntityIds) {
      const entity = await entityContract.read.entities([id]);
      totalStaked += entity.activeRewardPool;
    }

    return totalStaked;
  }

  /**
   * Gets information about a specific staking entity.
   *
   * @param entityId - The ID of the entity to query
   * @returns The entity information including name, APY, shares, and reward pools
   *
   * @example
   * ```typescript
   * const entity = await vana.staking.getEntity(1n);
   * console.log(`Entity: ${entity.name}`);
   * console.log(`Total shares: ${entity.totalShares}`);
   * console.log(`Max APY: ${Number(entity.maxAPY) / 100}%`);
   * ```
   */
  async getEntity(entityId: bigint): Promise<EntityInfo> {
    const entityContract = this.getEntityContract();

    const result = await entityContract.read.entities([entityId]);

    return {
      entityId: result.entityId,
      ownerAddress: result.ownerAddress as Address,
      status: result.status,
      name: result.name,
      maxAPY: result.maxAPY,
      lockedRewardPool: result.lockedRewardPool,
      activeRewardPool: result.activeRewardPool,
      totalShares: result.totalShares,
      lastUpdateTimestamp: result.lastUpdateTimestamp,
      totalDistributedRewards: result.totalDistributedRewards,
    };
  }

  /**
   * Gets the total number of staking entities in the protocol.
   *
   * @returns The count of entities
   *
   * @example
   * ```typescript
   * const count = await vana.staking.getEntitiesCount();
   * console.log(`Total entities: ${count}`);
   * ```
   */
  async getEntitiesCount(): Promise<bigint> {
    const entityContract = this.getEntityContract();
    return entityContract.read.entitiesCount();
  }

  /**
   * Gets the IDs of all active staking entities.
   *
   * @returns Array of active entity IDs
   *
   * @example
   * ```typescript
   * const activeIds = await vana.staking.getActiveEntities();
   * console.log(`Active entities: ${activeIds.join(', ')}`);
   * ```
   */
  async getActiveEntities(): Promise<readonly bigint[]> {
    const entityContract = this.getEntityContract();
    return entityContract.read.activeEntitiesValues();
  }

  /**
   * Gets a staker's position in a specific entity.
   *
   * @param staker - The address of the staker
   * @param entityId - The ID of the entity
   * @returns The staker's position information
   *
   * @example
   * ```typescript
   * const position = await vana.staking.getStakerPosition(
   *   '0x742d35...',
   *   1n
   * );
   * console.log(`Shares: ${position.shares}`);
   * console.log(`Rewards: ${position.realizedRewards}`);
   * ```
   */
  async getStakerPosition(
    staker: Address,
    entityId: bigint,
  ): Promise<StakerEntityInfo> {
    const stakingContract = this.getStakingContract();

    const result = await stakingContract.read.stakerEntities([
      staker,
      entityId,
    ]);

    return {
      shares: result.shares,
      costBasis: result.costBasis,
      rewardEligibilityTimestamp: result.rewardEligibilityTimestamp,
      realizedRewards: result.realizedRewards,
      vestedRewards: result.vestedRewards,
    };
  }

  /**
   * Gets the earned rewards for a staker in an entity.
   *
   * @param staker - The address of the staker
   * @param entityId - The ID of the entity
   * @returns The earned rewards amount in wei
   *
   * @example
   * ```typescript
   * const rewards = await vana.staking.getEarnedRewards(
   *   '0x742d35...',
   *   1n
   * );
   * console.log(`Earned: ${Number(rewards) / 1e18} VANA`);
   * ```
   */
  async getEarnedRewards(staker: Address, entityId: bigint): Promise<bigint> {
    const stakingContract = this.getStakingContract();
    return stakingContract.read.getEarnedRewards([staker, entityId]);
  }

  /**
   * Gets the minimum stake amount required to stake.
   *
   * @returns The minimum stake amount in wei
   *
   * @example
   * ```typescript
   * const minStake = await vana.staking.getMinStakeAmount();
   * console.log(`Minimum stake: ${Number(minStake) / 1e18} VANA`);
   * ```
   */
  async getMinStakeAmount(): Promise<bigint> {
    const stakingContract = this.getStakingContract();
    return stakingContract.read.minStakeAmount();
  }

  /**
   * Gets the count of active stakers in the protocol.
   *
   * @returns The number of active stakers
   *
   * @example
   * ```typescript
   * const count = await vana.staking.getActiveStakersCount();
   * console.log(`Active stakers: ${count}`);
   * ```
   */
  async getActiveStakersCount(): Promise<bigint> {
    const stakingContract = this.getStakingContract();
    return stakingContract.read.activeStakersListCount();
  }

  /**
   * Gets the bonding period for staking.
   *
   * @returns The bonding period in seconds
   *
   * @example
   * ```typescript
   * const bondingPeriod = await vana.staking.getBondingPeriod();
   * console.log(`Bonding period: ${bondingPeriod / 86400n} days`);
   * ```
   */
  async getBondingPeriod(): Promise<bigint> {
    const stakingContract = this.getStakingContract();
    return stakingContract.read.bondingPeriod();
  }

  /**
   * Gets the total distributed rewards for a specific entity from the contract.
   *
   * @remarks
   * This reads the `totalDistributedRewards` field from the entity's on-chain state.
   * This value represents the sum of all rewards that have been processed
   * (moved from lockedRewardPool to activeRewardPool) minus any forfeited
   * rewards that were returned.
   *
   * @param entityId - The ID of the entity to query
   * @returns The total distributed rewards in wei
   *
   * @example
   * ```typescript
   * const totalRewards = await vana.staking.getTotalDistributedRewards(1n);
   * const totalRewardsVana = Number(totalRewards) / 1e18;
   * console.log(`Total distributed rewards: ${totalRewardsVana.toLocaleString()} VANA`);
   * ```
   */
  async getTotalDistributedRewards(entityId: bigint): Promise<bigint> {
    const entityContract = this.getEntityContract();
    const result = await entityContract.read.entities([entityId]);
    return result.totalDistributedRewards;
  }

  /**
   * Gets a comprehensive staking summary for a staker in an entity.
   *
   * @remarks
   * This method aggregates all relevant staking information for a staker in a single call,
   * including staked amount, current value, bonding status, and all reward types.
   *
   * Reward breakdown:
   * - `earnedRewards` = pendingInterest + vestedRewards + realizedRewards
   * - `pendingInterest` = currentValue - costBasis (unvested appreciation)
   * - `vestedRewards` = rewards that have vested but not yet withdrawn
   * - `realizedRewards` = rewards already withdrawn during unstakes
   *
   * @param staker - The address of the staker
   * @param entityId - The ID of the entity
   * @returns A comprehensive summary of the staker's position
   *
   * @example
   * ```typescript
   * const summary = await vana.staking.getStakerSummary('0x742d35...', 1n);
   * console.log(`Total staked: ${Number(summary.totalStaked) / 1e18} VANA`);
   * console.log(`Current value: ${Number(summary.currentValue) / 1e18} VANA`);
   * console.log(`In bonding period: ${summary.isInBondingPeriod}`);
   * console.log(`Remaining bonding time: ${Number(summary.remainingBondingTime) / 86400} days`);
   * console.log(`Vested rewards: ${Number(summary.vestedRewards) / 1e18} VANA`);
   * console.log(`Unvested rewards: ${Number(summary.unvestedRewards) / 1e18} VANA`);
   * console.log(`Realized rewards: ${Number(summary.realizedRewards) / 1e18} VANA`);
   * console.log(`Total earned: ${Number(summary.earnedRewards) / 1e18} VANA`);
   * ```
   */
  async getStakerSummary(
    staker: Address,
    entityId: bigint,
  ): Promise<StakerEntitySummary> {
    const chainId = this.getChainId();
    const stakingAddress = getContractAddress(chainId, "VanaPoolStaking");
    const entityAddress = getContractAddress(chainId, "VanaPoolEntity");
    const stakingAbi = getAbi("VanaPoolStaking");
    const entityAbi = getAbi("VanaPoolEntity");

    // Get latest block first to ensure all reads are from the same block
    const block = await this.context.publicClient.getBlock();
    const blockNumber = block.number;

    // Batch all contract reads into a single multicall RPC request at the same block
    const multicallResults = await this.context.publicClient.multicall({
      contracts: [
        {
          address: stakingAddress,
          abi: stakingAbi,
          functionName: "stakerEntities",
          args: [staker, entityId],
        },
        {
          address: stakingAddress,
          abi: stakingAbi,
          functionName: "getEarnedRewards",
          args: [staker, entityId],
        },
        {
          address: entityAddress,
          abi: entityAbi,
          functionName: "entityShareToVana",
          args: [entityId],
        },
      ],
      blockNumber,
    });

    const [positionResult, earnedRewardsResult, shareToVanaResult] =
      multicallResults;

    if (
      positionResult.status === "failure" ||
      earnedRewardsResult.status === "failure" ||
      shareToVanaResult.status === "failure"
    ) {
      throw new BlockchainError(
        "Failed to fetch staker summary: one or more contract calls failed",
      );
    }

    const position = positionResult.result as {
      shares: bigint;
      costBasis: bigint;
      rewardEligibilityTimestamp: bigint;
      realizedRewards: bigint;
      vestedRewards: bigint;
    };
    const earnedRewards = earnedRewardsResult.result as bigint;
    const shareToVana = shareToVanaResult.result as bigint;
    const currentTimestamp = block.timestamp;

    // Calculate remaining bonding time
    const eligibilityTimestamp = position.rewardEligibilityTimestamp;
    const remainingBondingTime =
      eligibilityTimestamp > currentTimestamp
        ? eligibilityTimestamp - currentTimestamp
        : 0n;
    const isInBondingPeriod = remainingBondingTime > 0n;

    // Calculate current value of shares
    // entityShareToVana returns the VANA value of 1 share (scaled by 1e18)
    const currentValue = (position.shares * shareToVana) / 10n ** 18n;

    // Calculate pending interest (unvested rewards)
    // pendingInterest = currentValue - costBasis (if positive)
    const unvestedRewards =
      currentValue > position.costBasis
        ? currentValue - position.costBasis
        : 0n;

    return {
      shares: position.shares,
      costBasis: position.costBasis,
      currentValue,
      rewardEligibilityTimestamp: eligibilityTimestamp,
      remainingBondingTime,
      isInBondingPeriod,
      vestedRewards: position.vestedRewards,
      unvestedRewards,
      realizedRewards: position.realizedRewards,
      earnedRewards,
    };
  }

  /**
   * Stakes VANA to an entity in the VanaPool protocol.
   *
   * @remarks
   * This method stakes native VANA tokens to a specified entity. The staker will receive
   * shares in proportion to their stake amount. A bonding period applies during which
   * rewards cannot be fully claimed without penalty.
   *
   * Requires a wallet client to be configured in the Vana constructor.
   *
   * @param params - The staking parameters
   * @param params.entityId - The ID of the entity to stake to
   * @param params.amount - The amount of VANA to stake (in wei, or as a string like "1.5" for 1.5 VANA)
   * @param params.recipient - Optional recipient address for the shares (defaults to the sender)
   * @param params.minShares - Optional minimum shares to receive (slippage protection, defaults to 0)
   * @returns The transaction hash
   * @throws {BlockchainError} When wallet client is not configured
   *
   * @example
   * ```typescript
   * // Stake 100 VANA to entity 1
   * const txHash = await vana.staking.stake({
   *   entityId: 1n,
   *   amount: "100", // 100 VANA
   * });
   * console.log(`Staked! Transaction: ${txHash}`);
   *
   * // Stake with slippage protection
   * const txHash2 = await vana.staking.stake({
   *   entityId: 1n,
   *   amount: parseEther("50"), // 50 VANA in wei
   *   minShares: parseEther("49"), // Expect at least 49 shares
   * });
   * ```
   */
  async stake(
    params: {
      entityId: bigint;
      amount: bigint | string;
      recipient?: Address;
      minShares?: bigint;
    },
    options?: TransactionOptions,
  ): Promise<Hash> {
    this.assertWallet();

    const chainId = this.getChainId();
    const stakingAddress = getContractAddress(chainId, "VanaPoolStaking");
    const stakingAbi = getAbi("VanaPoolStaking");

    // Convert amount to bigint if it's a string (e.g., "1.5" -> 1.5 VANA in wei)
    const amountWei =
      typeof params.amount === "string"
        ? parseEther(params.amount)
        : params.amount;

    // Get account with fallback to userAddress
    const account =
      this.context.walletClient.account ?? this.context.userAddress;
    const accountAddress =
      typeof account === "string" ? account : account.address;

    // Default recipient to the sender's address
    const recipient = params.recipient ?? accountAddress;

    // Default minShares to 0 (no slippage protection)
    const minShares = params.minShares ?? 0n;

    const txHash = await this.context.walletClient.writeContract({
      address: stakingAddress,
      abi: stakingAbi,
      functionName: "stake",
      args: [params.entityId, recipient, minShares],
      value: amountWei,
      account,
      chain: this.context.walletClient.chain,
      ...this.spreadTransactionOptions(options),
    });

    return txHash;
  }

  /**
   * Gets the maximum amount of VANA that can be unstaked in a single transaction.
   *
   * @remarks
   * This calls the contract's getMaxUnstakeAmount which returns the minimum of:
   * 1. The withdrawable VANA (costBasis if in bonding period, shareValue if eligible)
   * 2. The entity's activeRewardPool (what the entity has available)
   * 3. The treasury balance (what can be paid out)
   *
   * The limiting factor indicates what's constraining the unstake:
   * - 0 = user shares/costBasis
   * - 1 = activeRewardPool
   * - 2 = treasury
   *
   * @param staker - The address of the staker
   * @param entityId - The ID of the entity
   * @returns Object containing maxVana, maxShares, limitingFactor, and isInBondingPeriod
   *
   * @example
   * ```typescript
   * const result = await vana.staking.getMaxUnstakeAmount('0x742d35...', 1n);
   * console.log(`Max unstake: ${Number(result.maxVana) / 1e18} VANA`);
   * console.log(`Max shares: ${result.maxShares}`);
   * console.log(`In bonding period: ${result.isInBondingPeriod}`);
   * ```
   */
  async getMaxUnstakeAmount(
    staker: Address,
    entityId: bigint,
  ): Promise<{
    maxVana: bigint;
    maxShares: bigint;
    limitingFactor: number;
    isInBondingPeriod: boolean;
  }> {
    const stakingContract = this.getStakingContract();

    const result = await stakingContract.read.getMaxUnstakeAmount([
      staker,
      entityId,
    ]);

    return {
      maxVana: result[0],
      maxShares: result[1],
      limitingFactor: Number(result[2]),
      isInBondingPeriod: result[3],
    };
  }

  /**
   * Computes the new bonding period end timestamp after adding stake.
   *
   * @remarks
   * When a staker adds more stake to an existing position, the reward eligibility timestamp
   * is recalculated as a weighted average of the existing and new positions. This function
   * allows you to preview what the new eligibility timestamp would be without executing
   * the stake transaction.
   *
   * The formula used (matching the contract):
   * ```
   * newEligibility = (existingShares * existingEligibility + newShares * newEligibility) / totalShares
   * ```
   *
   * Where `newEligibility` for the incoming stake is `currentTimestamp + bondingPeriod`.
   *
   * @param params - The parameters for computing the new bonding period
   * @param params.staker - The address of the staker
   * @param params.entityId - The ID of the entity
   * @param params.stakeAmount - The amount of VANA to stake (in wei)
   * @returns Object containing the new eligibility timestamp and related info
   *
   * @example
   * ```typescript
   * // Preview bonding period after staking 100 VANA
   * const preview = await vana.staking.computeNewBondingPeriod({
   *   staker: '0x742d35...',
   *   entityId: 1n,
   *   stakeAmount: parseEther("100"),
   * });
   * console.log(`New eligibility: ${new Date(Number(preview.newEligibilityTimestamp) * 1000)}`);
   * console.log(`Remaining bonding time: ${Number(preview.newRemainingBondingTime) / 86400} days`);
   * ```
   */
  async computeNewBondingPeriod(params: {
    staker: Address;
    entityId: bigint;
    stakeAmount: bigint;
  }): Promise<{
    /** The new reward eligibility timestamp after staking */
    newEligibilityTimestamp: bigint;
    /** Remaining bonding time in seconds after staking */
    newRemainingBondingTime: bigint;
    /** Current eligibility timestamp (before staking) */
    currentEligibilityTimestamp: bigint;
    /** Current remaining bonding time (before staking) */
    currentRemainingBondingTime: bigint;
    /** Current shares held by staker */
    currentShares: bigint;
    /** Estimated new shares to be received */
    estimatedNewShares: bigint;
    /** Total shares after staking */
    totalSharesAfter: bigint;
    /** The bonding period duration in seconds */
    bondingPeriodDuration: bigint;
    /** Current block timestamp used for calculation */
    currentTimestamp: bigint;
  }> {
    const chainId = this.getChainId();
    const stakingAddress = getContractAddress(chainId, "VanaPoolStaking");
    const entityAddress = getContractAddress(chainId, "VanaPoolEntity");
    const stakingAbi = getAbi("VanaPoolStaking");
    const entityAbi = getAbi("VanaPoolEntity");

    // Get latest block first to ensure all reads are from the same block
    const block = await this.context.publicClient.getBlock();
    const blockNumber = block.number;
    const currentTimestamp = block.timestamp;

    // Batch all contract reads into a single multicall RPC request at the same block
    const multicallResults = await this.context.publicClient.multicall({
      contracts: [
        {
          address: stakingAddress,
          abi: stakingAbi,
          functionName: "stakerEntities",
          args: [params.staker, params.entityId],
        },
        {
          address: stakingAddress,
          abi: stakingAbi,
          functionName: "bondingPeriod",
          args: [],
        },
        {
          address: entityAddress,
          abi: entityAbi,
          functionName: "vanaToEntityShare",
          args: [params.entityId],
        },
      ],
      blockNumber,
    });

    const [positionResult, bondingPeriodResult, vanaToShareResult] =
      multicallResults;

    if (
      positionResult.status === "failure" ||
      bondingPeriodResult.status === "failure" ||
      vanaToShareResult.status === "failure"
    ) {
      throw new BlockchainError(
        "Failed to compute new bonding period: one or more contract calls failed",
      );
    }

    const position = positionResult.result as {
      shares: bigint;
      costBasis: bigint;
      rewardEligibilityTimestamp: bigint;
      realizedRewards: bigint;
      vestedRewards: bigint;
    };
    const bondingPeriodDuration = bondingPeriodResult.result as bigint;
    const vanaToShare = vanaToShareResult.result as bigint;

    const currentShares = position.shares;
    const currentEligibilityTimestamp = position.rewardEligibilityTimestamp;

    // Calculate current remaining bonding time
    const currentRemainingBondingTime =
      currentEligibilityTimestamp > currentTimestamp
        ? currentEligibilityTimestamp - currentTimestamp
        : 0n;

    // Estimate new shares: newShares = (stakeAmount * vanaToShare) / 1e18
    const estimatedNewShares = (params.stakeAmount * vanaToShare) / 10n ** 18n;

    // Calculate new eligibility timestamp using weighted average formula
    // newEligibility = (existingShares * existingEligibility + newShares * (currentTime + bondingPeriod)) / totalShares
    const totalSharesAfter = currentShares + estimatedNewShares;
    const newStakeEligibility = currentTimestamp + bondingPeriodDuration;

    let newEligibilityTimestamp: bigint;
    if (currentShares === 0n) {
      // First stake: eligibility is simply current time + bonding period
      newEligibilityTimestamp = newStakeEligibility;
    } else {
      // Weighted average of existing and new positions
      newEligibilityTimestamp =
        (currentShares * currentEligibilityTimestamp +
          estimatedNewShares * newStakeEligibility) /
        totalSharesAfter;
    }

    // Calculate new remaining bonding time
    const newRemainingBondingTime =
      newEligibilityTimestamp > currentTimestamp
        ? newEligibilityTimestamp - currentTimestamp
        : 0n;

    return {
      newEligibilityTimestamp,
      newRemainingBondingTime,
      currentEligibilityTimestamp,
      currentRemainingBondingTime,
      currentShares,
      estimatedNewShares,
      totalSharesAfter,
      bondingPeriodDuration,
      currentTimestamp,
    };
  }

  /**
   * Unstakes VANA from an entity in the VanaPool protocol.
   *
   * @remarks
   * This method unstakes native VANA tokens from a specified entity. The amount
   * that can be unstaked depends on whether the staker is in the bonding period:
   *
   * - **During bonding period**: Only cost basis can be withdrawn; rewards are forfeited
   * - **After bonding period**: Full current value (cost basis + rewards) can be withdrawn
   *
   * Use `getMaxUnstakeAmount` to determine the maximum amount that can be unstaked.
   *
   * Requires a wallet client to be configured in the Vana constructor.
   *
   * @param params - The unstaking parameters
   * @param params.entityId - The ID of the entity to unstake from
   * @param params.amount - The amount of VANA to unstake (in wei, or as a string like "1.5" for 1.5 VANA)
   * @param params.maxShares - Maximum shares to burn for slippage protection (defaults to 0, no protection)
   * @returns The transaction hash
   * @throws {BlockchainError} When wallet client is not configured
   *
   * @example
   * ```typescript
   * // Get max unstake amount first
   * const maxUnstake = await vana.staking.getMaxUnstakeAmount(address, 1n);
   *
   * // Unstake the maximum amount with slippage protection
   * const txHash = await vana.staking.unstake({
   *   entityId: 1n,
   *   amount: maxUnstake.maxVana,
   *   maxShares: maxUnstake.maxShares,
   * });
   * console.log(`Unstaked! Transaction: ${txHash}`);
   * ```
   */
  async unstake(
    params: {
      entityId: bigint;
      amount: bigint | string;
      maxShares?: bigint;
    },
    options?: TransactionOptions,
  ): Promise<Hash> {
    this.assertWallet();

    const chainId = this.getChainId();
    const stakingAddress = getContractAddress(chainId, "VanaPoolStaking");
    const stakingAbi = getAbi("VanaPoolStaking");

    // Convert amount to bigint if it's a string (e.g., "1.5" -> 1.5 VANA in wei)
    const amountWei =
      typeof params.amount === "string"
        ? parseEther(params.amount)
        : params.amount;

    // Default maxShares to 0 (no slippage protection)
    const maxShares = params.maxShares ?? 0n;

    // Get account with fallback to userAddress
    const account =
      this.context.walletClient.account ?? this.context.userAddress;

    const txHash = await this.context.walletClient.writeContract({
      address: stakingAddress,
      abi: stakingAbi,
      functionName: "unstakeVana",
      args: [params.entityId, amountWei, maxShares],
      account,
      chain: this.context.walletClient.chain,
      ...this.spreadTransactionOptions(options),
    });

    return txHash;
  }
}
