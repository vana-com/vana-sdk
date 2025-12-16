/**
 * Example: Using the StakingController to query VanaPool staking information
 *
 * This example demonstrates how to:
 * - Get total VANA staked in the protocol
 * - Query active staking entities
 * - Get entity details
 * - Check staker positions and rewards
 * - Stake VANA and verify changes
 *
 * Run with: npx tsx staking-example.ts
 *
 * For staking operations, create a .env file with PRIVATE_KEY:
 *   PRIVATE_KEY=0x...
 */

import "dotenv/config";
import {
  Vana,
  mokshaTestnet,
  getAbi,
  getContractAddress,
} from "@opendatalabs/vana-sdk/node";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { StakerEntitySummary } from "@opendatalabs/vana-sdk/node";

// Subgraph URL for querying indexed staking data
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm168cz887zva010j39il7a6p/subgraphs/moksha/staking-only/gn";

async function main() {
  const publicClient = createPublicClient({
    chain: mokshaTestnet,
    transport: http(),
  });

  // Check if PRIVATE_KEY is available for write operations
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const hasWallet = !!privateKey;

  let vana: ReturnType<typeof Vana>;

  if (hasWallet) {
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: mokshaTestnet,
      transport: http(),
    });
    vana = Vana({
      publicClient,
      walletClient,
      address: account.address,
      subgraphUrl: SUBGRAPH_URL,
    });
    console.log(`Wallet connected: ${account.address}\n`);
  } else {
    vana = Vana({
      publicClient,
      address: "0x0000000000000000000000000000000000000000", // Placeholder for read-only
      subgraphUrl: SUBGRAPH_URL,
    });
    console.log("Running in read-only mode (no PRIVATE_KEY set)\n");
  }

  console.log("=== VanaPool Staking Information ===\n");

  // 1. Get total VANA staked in the protocol
  console.log("Fetching total VANA staked...");
  const totalStaked = await vana.staking.getTotalVanaStaked();
  const totalStakedVana = Number(totalStaked) / 1e18;
  console.log(`Total VANA staked: ${totalStakedVana.toLocaleString()} VANA\n`);

  // 2. Get active staking entities
  console.log("Fetching active entities...");
  const activeEntityIds = await vana.staking.getActiveEntities();
  console.log(`Active entities: ${activeEntityIds.length}`);
  console.log(`Entity IDs: ${activeEntityIds.map(String).join(", ")}\n`);

  // 3. Get entity details for each active entity (including distributed rewards from subgraph)
  console.log("=== Entity Details ===\n");
  for (const entityId of activeEntityIds) {
    const entity = await vana.staking.getEntity(entityId);
    const totalDistributedRewards =
      await vana.staking.getTotalDistributedRewards(entityId);

    console.log(`Entity #${entityId}:`);
    console.log(`  Name: ${entity.name}`);
    console.log(`  Owner: ${entity.ownerAddress}`);
    console.log(`  Status: ${entity.status}`);
    console.log(
      `  Active Reward Pool: ${(Number(entity.activeRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Locked Reward Pool: ${(Number(entity.lockedRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Total Distributed Rewards: ${(Number(totalDistributedRewards) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Total Shares: ${(Number(entity.totalShares) / 1e18).toLocaleString()}`,
    );
    console.log(`  Max APY: ${Number(entity.maxAPY) / 1e18}%`);
    console.log("");
  }

  // 4. Get protocol statistics
  console.log("=== Protocol Statistics ===\n");

  const entitiesCount = await vana.staking.getEntitiesCount();
  console.log(`Total entities created: ${entitiesCount}`);

  const activeStakersCount = await vana.staking.getActiveStakersCount();
  console.log(`Active stakers: ${activeStakersCount}`);

  const minStakeAmount = await vana.staking.getMinStakeAmount();
  console.log(
    `Minimum stake amount: ${(Number(minStakeAmount) / 1e18).toLocaleString()} VANA`,
  );

  const bondingPeriod = await vana.staking.getBondingPeriod();
  const bondingDays = Number(bondingPeriod) / 86400;
  console.log(`Bonding period: ${bondingDays} days`);

  // Helper to format rewards - show in wei if less than 0.000001 VANA
  const formatRewards = (wei: bigint): string => {
    const vana = Number(wei) / 1e18;
    if (wei === 0n) return "0 VANA";
    if (vana < 0.000001) return `${wei.toString()} wei`;
    return `${vana.toLocaleString()} VANA`;
  };

  // Helper to format bonding time
  const formatBondingTime = (seconds: bigint): string => {
    const totalSecs = Number(seconds);
    const d = Math.floor(totalSecs / 86400);
    const h = Math.floor((totalSecs % 86400) / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  // Helper to print staker summary and return it for comparison
  const printStakerSummary = async (
    staker: `0x${string}`,
    entId: bigint,
    label?: string,
  ): Promise<StakerEntitySummary> => {
    console.log(`\n=== Staker Summary${label ? ` (${label})` : ""} ===\n`);
    console.log(`Staker: ${staker}`);
    console.log(`Entity ID: ${entId}\n`);

    const summary = await vana.staking.getStakerSummary(staker, entId);

    console.log(`Shares: ${summary.shares.toString()}`);
    console.log(
      `Cost Basis: ${(Number(summary.costBasis) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `Current Value: ${(Number(summary.currentValue) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `Appreciation: ${((Number(summary.currentValue) - Number(summary.costBasis)) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`\nBonding Status:`);
    console.log(`  In Bonding Period: ${summary.isInBondingPeriod}`);
    console.log(
      `  Remaining Bonding Time: ${formatBondingTime(summary.remainingBondingTime)}`,
    );
    console.log(
      `  Eligibility Timestamp: ${new Date(Number(summary.rewardEligibilityTimestamp) * 1000).toISOString()}`,
    );
    console.log(`\nRewards:`);
    console.log(`  Vested Rewards: ${formatRewards(summary.vestedRewards)}`);
    console.log(
      `  Unvested Rewards: ${formatRewards(summary.unvestedRewards)}`,
    );
    console.log(
      `  Realized Rewards: ${formatRewards(summary.realizedRewards)}`,
    );
    console.log(`  Total Earned: ${formatRewards(summary.earnedRewards)}`);

    return summary;
  };

  // 5. Get staker summaries
  const entityId = 1n;

  await printStakerSummary(
    "0x2AC93684679a5bdA03C6160def908CdB8D46792f" as `0x${string}`,
    entityId,
  );

  await printStakerSummary(
    "0x2c6A694c3C50f012d8287fD9dB4CF98c99680a81" as `0x${string}`,
    entityId,
  );

  // 6. Stake test with before/after comparison
  if (hasWallet) {
    console.log("\n=== Stake Test ===\n");

    const stakeEntityId = 1n;
    const stakeAmount = "0.01"; // 0.01 VANA
    const account = privateKeyToAccount(privateKey);
    const stakerAddress = account.address;

    // Get entity info before stake
    const entityBefore = await vana.staking.getEntity(stakeEntityId);
    console.log(`Entity #${stakeEntityId} before stake:`);
    console.log(
      `  Active Reward Pool: ${(Number(entityBefore.activeRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Locked Reward Pool: ${(Number(entityBefore.lockedRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`  Total Shares: ${entityBefore.totalShares.toString()}`);

    // Get staker summary before stake
    const summaryBefore = await printStakerSummary(
      stakerAddress,
      stakeEntityId,
      "Before Stake",
    );

    // Perform stake
    console.log(`\nStaking ${stakeAmount} VANA to entity #${stakeEntityId}...`);
    const txHash = await vana.staking.stake({
      entityId: stakeEntityId,
      amount: stakeAmount,
    });
    console.log(`Transaction hash: ${txHash}`);

    // Wait for transaction confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    // Get entity info after stake
    const entityAfter = await vana.staking.getEntity(stakeEntityId);
    console.log(`\nEntity #${stakeEntityId} after stake:`);
    console.log(
      `  Active Reward Pool: ${(Number(entityAfter.activeRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Locked Reward Pool: ${(Number(entityAfter.lockedRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`  Total Shares: ${entityAfter.totalShares.toString()}`);

    // Get staker summary after stake
    const summaryAfter = await printStakerSummary(
      stakerAddress,
      stakeEntityId,
      "After Stake",
    );

    // Verify changes
    console.log("\n=== Stake Verification ===\n");

    const stakeAmountWei = BigInt(Math.floor(Number(stakeAmount) * 1e18));
    const sharesDiff = summaryAfter.shares - summaryBefore.shares;
    const costBasisDiff = summaryAfter.costBasis - summaryBefore.costBasis;
    const currentValueDiff =
      summaryAfter.currentValue - summaryBefore.currentValue;
    const activePoolDiff =
      entityAfter.activeRewardPool - entityBefore.activeRewardPool;
    const lockedPoolDiff =
      entityBefore.lockedRewardPool - entityAfter.lockedRewardPool; // Decrease in locked
    const entitySharesDiff = entityAfter.totalShares - entityBefore.totalShares;

    console.log(
      `Stake Amount: ${stakeAmount} VANA (${stakeAmountWei.toString()} wei)`,
    );
    console.log(`Shares Gained: ${sharesDiff.toString()}`);
    console.log(
      `Cost Basis Increase: ${(Number(costBasisDiff) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `Current Value Increase: ${(Number(currentValueDiff) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `Active Pool Increase: ${(Number(activePoolDiff) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `Locked Pool Decrease: ${(Number(lockedPoolDiff) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`Entity Shares Increase: ${entitySharesDiff.toString()}`);

    // Validate
    // Cost basis = current value of new shares (stake amount + vested rewards from share appreciation)
    const costBasisMatchesCurrentValue = costBasisDiff === currentValueDiff;
    // Active pool increases by exactly: stake amount + rewards moved from locked pool
    const expectedActivePoolIncrease = stakeAmountWei + lockedPoolDiff;
    const activePoolCorrect = activePoolDiff === expectedActivePoolIncrease;
    const sharesCorrect = sharesDiff > 0n;
    const sharesMatchEntity = sharesDiff === entitySharesDiff;

    console.log("\nValidation:");
    console.log(
      `  ✓ Cost basis equals current value of new shares: ${costBasisMatchesCurrentValue ? "PASS" : "FAIL"}`,
    );
    console.log(
      `  ✓ Active pool increased by stake + locked rewards: ${activePoolCorrect ? "PASS" : "FAIL"} (expected: ${(Number(expectedActivePoolIncrease) / 1e18).toLocaleString()} VANA)`,
    );
    console.log(`  ✓ Shares received: ${sharesCorrect ? "PASS" : "FAIL"}`);
    console.log(
      `  ✓ Staker shares match entity shares increase: ${sharesMatchEntity ? "PASS" : "FAIL"}`,
    );

    if (
      costBasisMatchesCurrentValue &&
      activePoolCorrect &&
      sharesCorrect &&
      sharesMatchEntity
    ) {
      console.log("\n✅ All stake validations passed!");
    } else {
      console.log("\n❌ Some validations failed. Check the results above.");
    }

    // 7. Test getMaxUnstakeAmount
    console.log("\n=== Max Unstake Amount Test ===\n");

    // Get max unstake amount from contract
    const maxUnstakeResult = await vana.staking.getMaxUnstakeAmount(
      stakerAddress,
      stakeEntityId,
    );
    const summaryNow = await vana.staking.getStakerSummary(
      stakerAddress,
      stakeEntityId,
    );

    console.log("Contract getMaxUnstakeAmount result:");
    console.log(
      `  Max VANA: ${(Number(maxUnstakeResult.maxVana) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`  Max Shares: ${maxUnstakeResult.maxShares.toString()}`);
    console.log(
      `  Limiting Factor: ${maxUnstakeResult.limitingFactor} (0=user, 1=activePool, 2=treasury)`,
    );
    console.log(`  In Bonding Period: ${maxUnstakeResult.isInBondingPeriod}`);

    // Calculate expected max unstake based on bonding period status
    const calculateExpectedMaxUnstake = (
      summary: StakerEntitySummary,
    ): bigint => {
      if (summary.isInBondingPeriod) {
        // During bonding period: max = cost basis
        return summary.costBasis;
      } else {
        // After bonding period: max = current value (cost basis + all rewards)
        return summary.currentValue;
      }
    };

    const expectedMaxUnstake = calculateExpectedMaxUnstake(summaryNow);

    console.log("\nExpected calculation:");
    console.log(`  Is In Bonding Period: ${summaryNow.isInBondingPeriod}`);
    console.log(
      `  Cost Basis: ${(Number(summaryNow.costBasis) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Current Value: ${(Number(summaryNow.currentValue) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Expected Max Unstake: ${(Number(expectedMaxUnstake) / 1e18).toLocaleString()} VANA`,
    );

    // Validate (contract may return less if limited by activePool or treasury)
    console.log("\nValidation:");
    if (maxUnstakeResult.limitingFactor === 0) {
      // User-limited: contract should match expected
      const maxUnstakeCorrect = maxUnstakeResult.maxVana === expectedMaxUnstake;
      console.log(
        `  ✓ Max unstake matches expected (user-limited): ${maxUnstakeCorrect ? "PASS" : "FAIL"}`,
      );
      if (!maxUnstakeCorrect) {
        console.log(
          `    Difference: ${(Number(maxUnstakeResult.maxVana - expectedMaxUnstake) / 1e18).toLocaleString()} VANA`,
        );
      }
    } else {
      // Pool or treasury limited: contract should be <= expected
      const maxUnstakeValid = maxUnstakeResult.maxVana <= expectedMaxUnstake;
      console.log(
        `  ✓ Max unstake <= expected (${maxUnstakeResult.limitingFactor === 1 ? "pool" : "treasury"}-limited): ${maxUnstakeValid ? "PASS" : "FAIL"}`,
      );
    }

    // Verify bonding period status matches
    const bondingStatusMatch =
      maxUnstakeResult.isInBondingPeriod === summaryNow.isInBondingPeriod;
    console.log(
      `  ✓ Bonding period status matches: ${bondingStatusMatch ? "PASS" : "FAIL"}`,
    );

    // Show what happens at different times
    console.log("\n--- Max Unstake at Different Times ---\n");

    if (summaryNow.isInBondingPeriod) {
      console.log("Currently IN bonding period:");
      console.log(
        `  Max unstake = cost basis = ${(Number(summaryNow.costBasis) / 1e18).toLocaleString()} VANA`,
      );
      console.log(`  (Rewards would be forfeited if unstaking now)`);
      console.log("\nAfter bonding period ends:");
      console.log(
        `  Max unstake = current value = ${(Number(summaryNow.currentValue) / 1e18).toLocaleString()} VANA`,
      );
      console.log(`  (Full value including rewards can be unstaked)`);
    } else {
      console.log("Bonding period has ENDED:");
      console.log(
        `  Max unstake = current value = ${(Number(summaryNow.currentValue) / 1e18).toLocaleString()} VANA`,
      );
      console.log(`  This includes:`);
      console.log(
        `    - Cost basis: ${(Number(summaryNow.costBasis) / 1e18).toLocaleString()} VANA`,
      );
      console.log(
        `    - Appreciation (unvested): ${(Number(summaryNow.unvestedRewards) / 1e18).toLocaleString()} VANA`,
      );
      console.log(
        `    - Vested rewards: ${(Number(summaryNow.vestedRewards) / 1e18).toLocaleString()} VANA`,
      );
    }

    // 8. Test unstake with max amount
    console.log("\n=== Unstake Test ===\n");

    // Get fresh max unstake amount before unstaking
    const unstakeInfo = await vana.staking.getMaxUnstakeAmount(
      stakerAddress,
      stakeEntityId,
    );
    const summaryBeforeUnstake = await vana.staking.getStakerSummary(
      stakerAddress,
      stakeEntityId,
    );
    const entityBeforeUnstake = await vana.staking.getEntity(stakeEntityId);

    console.log("Before unstake:");
    console.log(`  Staker Shares: ${summaryBeforeUnstake.shares.toString()}`);
    console.log(
      `  Staker Cost Basis: ${(Number(summaryBeforeUnstake.costBasis) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Staker Current Value: ${(Number(summaryBeforeUnstake.currentValue) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Entity Active Pool: ${(Number(entityBeforeUnstake.activeRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Entity Total Shares: ${entityBeforeUnstake.totalShares.toString()}`,
    );
    console.log(
      `\n  Max Unstake Amount: ${(Number(unstakeInfo.maxVana) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`  Max Shares to Burn: ${unstakeInfo.maxShares.toString()}`);
    console.log(`  In Bonding Period: ${unstakeInfo.isInBondingPeriod}`);

    // Perform unstake with max amount
    console.log(
      `\nUnstaking ${(Number(unstakeInfo.maxVana) / 1e18).toLocaleString()} VANA from entity #${stakeEntityId}...`,
    );

    // Estimate gas for unstake transaction
    const stakingAddress = getContractAddress(
      mokshaTestnet.id,
      "VanaPoolStaking",
    );
    const stakingAbi = getAbi("VanaPoolStaking");

    const estimatedGas = await publicClient.estimateContractGas({
      address: stakingAddress,
      abi: stakingAbi,
      functionName: "unstakeVana",
      args: [stakeEntityId, unstakeInfo.maxVana, unstakeInfo.maxShares],
      account: stakerAddress,
    });
    const gasWithBuffer = (estimatedGas * 12n) / 10n; // 1.2x estimated gas
    console.log(
      `Estimated gas: ${estimatedGas}, with 1.2x buffer: ${gasWithBuffer}`,
    );

    const unstakeTxHash = await vana.staking.unstake(
      {
        entityId: stakeEntityId,
        amount: unstakeInfo.maxVana,
        maxShares: unstakeInfo.maxShares,
      },
      { gas: gasWithBuffer },
    );
    console.log(`Transaction hash: ${unstakeTxHash}`);

    // Wait for transaction confirmation
    console.log("Waiting for transaction confirmation...");
    const unstakeReceipt = await publicClient.waitForTransactionReceipt({
      hash: unstakeTxHash,
    });
    console.log(`Transaction confirmed in block ${unstakeReceipt.blockNumber}`);

    // Get state after unstake
    const summaryAfterUnstake = await vana.staking.getStakerSummary(
      stakerAddress,
      stakeEntityId,
    );
    const entityAfterUnstake = await vana.staking.getEntity(stakeEntityId);

    console.log("\nAfter unstake:");
    console.log(`  Staker Shares: ${summaryAfterUnstake.shares.toString()}`);
    console.log(
      `  Staker Cost Basis: ${(Number(summaryAfterUnstake.costBasis) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Staker Current Value: ${(Number(summaryAfterUnstake.currentValue) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Entity Active Pool: ${(Number(entityAfterUnstake.activeRewardPool) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `  Entity Total Shares: ${entityAfterUnstake.totalShares.toString()}`,
    );

    // Verify unstake changes
    console.log("\n=== Unstake Verification ===\n");

    const sharesUnstaked =
      summaryBeforeUnstake.shares - summaryAfterUnstake.shares;
    const costBasisReduced =
      summaryBeforeUnstake.costBasis - summaryAfterUnstake.costBasis;
    const currentValueReduced =
      summaryBeforeUnstake.currentValue - summaryAfterUnstake.currentValue;
    const entityPoolReduced =
      entityBeforeUnstake.activeRewardPool -
      entityAfterUnstake.activeRewardPool;
    const entitySharesReduced =
      entityBeforeUnstake.totalShares - entityAfterUnstake.totalShares;

    console.log(
      `Unstake Amount Requested: ${(Number(unstakeInfo.maxVana) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`Shares Burned: ${sharesUnstaked.toString()}`);
    console.log(
      `Cost Basis Reduced: ${(Number(costBasisReduced) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `Current Value Reduced: ${(Number(currentValueReduced) / 1e18).toLocaleString()} VANA`,
    );
    console.log(
      `Entity Pool Reduced: ${(Number(entityPoolReduced) / 1e18).toLocaleString()} VANA`,
    );
    console.log(`Entity Shares Reduced: ${entitySharesReduced.toString()}`);

    // Validate
    // Note: Values may differ slightly due to reward accrual between fetching unstakeInfo and execution
    // Use approximate comparison (within 0.1% tolerance) for value checks
    const tolerance = unstakeInfo.maxVana / 1000n; // 0.1% tolerance

    const sharesMatch = sharesUnstaked === unstakeInfo.maxShares;
    const unstakeSharesMatchEntity = sharesUnstaked === entitySharesReduced;

    // Helper for approximate comparison
    const approxEqual = (a: bigint, b: bigint, tol: bigint): boolean => {
      const diff = a > b ? a - b : b - a;
      return diff <= tol;
    };

    // During bonding: cost basis reduced by unstake amount, rewards forfeited
    // After bonding: current value reduced by unstake amount
    let valueReductionCorrect: boolean;
    if (unstakeInfo.isInBondingPeriod) {
      // Cost basis should be reduced by approximately the unstake amount
      valueReductionCorrect = approxEqual(
        costBasisReduced,
        unstakeInfo.maxVana,
        tolerance,
      );
      console.log(`\nBonding Period Validation:`);
      console.log(
        `  ✓ Cost basis reduced by unstake amount: ${valueReductionCorrect ? "PASS" : "FAIL"}`,
      );
      if (!valueReductionCorrect) {
        console.log(
          `    Expected: ~${(Number(unstakeInfo.maxVana) / 1e18).toLocaleString()} VANA, Got: ${(Number(costBasisReduced) / 1e18).toLocaleString()} VANA`,
        );
      }
    } else {
      // Current value should be reduced by approximately the unstake amount
      valueReductionCorrect = approxEqual(
        currentValueReduced,
        unstakeInfo.maxVana,
        tolerance,
      );
      console.log(`\nPost-Bonding Validation:`);
      console.log(
        `  ✓ Current value reduced by unstake amount: ${valueReductionCorrect ? "PASS" : "FAIL"}`,
      );
      if (!valueReductionCorrect) {
        console.log(
          `    Expected: ~${(Number(unstakeInfo.maxVana) / 1e18).toLocaleString()} VANA, Got: ${(Number(currentValueReduced) / 1e18).toLocaleString()} VANA`,
        );
      }
    }

    console.log(
      `  ✓ Shares burned match max shares: ${sharesMatch ? "PASS" : "FAIL"}`,
    );
    if (!sharesMatch) {
      console.log(
        `    Expected: ${unstakeInfo.maxShares.toString()}, Got: ${sharesUnstaked.toString()}`,
      );
    }
    console.log(
      `  ✓ Staker shares match entity shares reduction: ${unstakeSharesMatchEntity ? "PASS" : "FAIL"}`,
    );

    // Verify realized rewards increased if after bonding period
    if (!unstakeInfo.isInBondingPeriod) {
      const realizedRewardsIncrease =
        summaryAfterUnstake.realizedRewards -
        summaryBeforeUnstake.realizedRewards;
      console.log(
        `  Realized Rewards Increase: ${(Number(realizedRewardsIncrease) / 1e18).toLocaleString()} VANA`,
      );
    }

    if (valueReductionCorrect && sharesMatch && unstakeSharesMatchEntity) {
      console.log("\n✅ All unstake validations passed!");
    } else {
      console.log(
        "\n❌ Some unstake validations failed. Check the results above.",
      );
    }
  } else {
    console.log("\n=== Stake Test ===\n");
    console.log("Skipped: Set PRIVATE_KEY in .env to test staking");
  }
}

main().catch(console.error);
