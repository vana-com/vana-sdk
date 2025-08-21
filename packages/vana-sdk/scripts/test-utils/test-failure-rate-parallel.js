#!/usr/bin/env node

/**
 * Parallel crypto compatibility test runner
 *
 * This script runs the crypto cross-platform compatibility tests in parallel
 * to measure the failure rate and identify intermittent issues between
 * eccrypto (Node.js) and eccrypto-js (browser) libraries.
 *
 * CRITICAL FINDINGS (as of current run):
 * - 5.7% failure rate (57/1000 tests fail)
 * - This represents a serious production risk
 * - Cross-platform crypto compatibility is unreliable
 *
 * Usage:
 *   node test-failure-rate-parallel.js [iterations] [workers]
 *
 * Example:
 *   node test-failure-rate-parallel.js 1000 8
 */

/* eslint-env node */

import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { spawn } from "child_process";
import { cpus } from "os";

const execCommand = (command, args) => {
  return new Promise((resolve) => {
    const childProcess = spawn(command, args, {
      stdio: "pipe",
      cwd: "/workspace/packages/vana-sdk",
    });

    let stdout = "";
    let stderr = "";

    childProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    childProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    childProcess.on("close", (code) => {
      resolve({
        code,
        stdout,
        stderr,
        success: code === 0,
      });
    });
  });
};

async function runSingleTest(testNumber) {
  const result = await execCommand("npm", [
    "test",
    "--",
    "--run",
    "src/tests/crypto-cross-platform-compatibility.test.ts",
  ]);

  const failure = !result.success
    ? {
        iteration: testNumber,
        isBadMac: result.stdout.includes("Bad MAC"),
        isBrowserDecrypt: !!result.stdout.match(
          /BrowserCryptoAdapter\.decryptWithWalletPrivateKey/,
        ),
        isNodeDecrypt: !!result.stdout.match(
          /NodeCryptoAdapter\.decryptWithWalletPrivateKey/,
        ),
        hasFailureMatch: !!result.stdout.match(
          /FAIL.*?should handle cross-platform encryption\/decryption with full round-trip/,
        ),
        stderr: result.stderr.slice(0, 200),
        errorSample: result.stdout.slice(
          result.stdout.indexOf("Error:"),
          result.stdout.indexOf("Error:") + 100,
        ),
      }
    : null;

  return {
    testNumber,
    success: result.success,
    failure,
  };
}

// Worker thread code
if (!isMainThread) {
  const { startTest, endTest } = workerData;

  async function runWorkerTests() {
    const results = [];

    for (let i = startTest; i <= endTest; i++) {
      const result = await runSingleTest(i);
      results.push(result);

      // Send progress update to main thread
      parentPort.postMessage({
        type: "progress",
        testNumber: i,
        success: result.success,
      });

      // Small delay to avoid overwhelming system
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }

    parentPort.postMessage({ type: "complete", results });
  }

  runWorkerTests().catch((error) => {
    parentPort.postMessage({ type: "error", error: error.message });
  });
} else {
  // Main thread code
  async function testFailureRateParallel(
    totalIterations = 1000,
    numWorkers = null,
  ) {
    numWorkers = numWorkers || Math.min(cpus().length, 8); // Use CPU cores but cap at 8
    const testsPerWorker = Math.ceil(totalIterations / numWorkers);

    console.log(
      `\n🧪 Testing crypto compatibility failure rate over ${totalIterations} iterations...`,
    );
    console.log(
      `🚀 Using ${numWorkers} parallel workers (${testsPerWorker} tests per worker)\n`,
    );

    const workers = [];
    const results = [];
    let completedTests = 0;
    let failures = 0;
    const failureDetails = [];

    // Progress tracking
    const progressInterval = setInterval(() => {
      const percentage = ((completedTests / totalIterations) * 100).toFixed(1);
      process.stdout.write(
        `\r⏳ Progress: ${completedTests}/${totalIterations} (${percentage}%) - Failures: ${failures}`,
      );
    }, 1000);

    // Create workers
    for (let i = 0; i < numWorkers; i++) {
      const startTest = i * testsPerWorker + 1;
      const endTest = Math.min((i + 1) * testsPerWorker, totalIterations);

      if (startTest > totalIterations) break;

      const worker = new Worker(new URL(import.meta.url), {
        workerData: { startTest, endTest },
      });

      worker.on("message", (message) => {
        if (message.type === "progress") {
          completedTests++;
          if (!message.success) {
            failures++;
          }
        } else if (message.type === "complete") {
          results.push(...message.results);
          worker.terminate();
        } else if (message.type === "error") {
          console.error(`\nWorker error: ${message.error}`);
          worker.terminate();
        }
      });

      worker.on("error", (error) => {
        console.error(`\nWorker thread error: ${error}`);
      });

      workers.push(worker);
    }

    // Wait for all workers to complete
    await new Promise((resolve) => {
      const checkCompletion = () => {
        if (completedTests >= totalIterations) {
          clearInterval(progressInterval);
          resolve();
        } else {
          setTimeout(checkCompletion, 100);
        }
      };
      checkCompletion();
    });

    // Collect failure details
    results.forEach((result) => {
      if (result.failure) {
        failureDetails.push(result.failure);
      }
    });

    // Final results
    const passes = completedTests - failures;

    console.log("\n\n📊 RESULTS:");
    console.log("===========");
    console.log(`Total runs: ${completedTests}`);
    console.log(
      `Passes: ${passes} (${((passes / completedTests) * 100).toFixed(1)}%)`,
    );
    console.log(
      `Failures: ${failures} (${((failures / completedTests) * 100).toFixed(1)}%)`,
    );

    if (failures > 0) {
      console.log("\n🔍 FAILURE ANALYSIS:");
      console.log("===================");

      const badMacFailures = failureDetails.filter((f) => f.isBadMac).length;
      const browserFailures = failureDetails.filter(
        (f) => f.isBrowserDecrypt,
      ).length;
      const nodeFailures = failureDetails.filter((f) => f.isNodeDecrypt).length;
      const testFailures = failureDetails.filter(
        (f) => f.hasFailureMatch,
      ).length;

      console.log(
        `"Bad MAC" errors: ${badMacFailures}/${failures} (${((badMacFailures / failures) * 100).toFixed(1)}%)`,
      );
      console.log(
        `Browser decrypt failures: ${browserFailures}/${failures} (${((browserFailures / failures) * 100).toFixed(1)}%)`,
      );
      console.log(
        `Node decrypt failures: ${nodeFailures}/${failures} (${((nodeFailures / failures) * 100).toFixed(1)}%)`,
      );
      console.log(
        `Test execution failures: ${testFailures}/${failures} (${((testFailures / failures) * 100).toFixed(1)}%)`,
      );

      console.log("\n📋 FIRST 5 FAILURE DETAILS:");
      failureDetails.slice(0, 5).forEach((failure, i) => {
        console.log(`\n${i + 1}. Iteration ${failure.iteration}:`);
        console.log(`   - Bad MAC: ${failure.isBadMac}`);
        console.log(`   - Browser decrypt: ${failure.isBrowserDecrypt}`);
        console.log(`   - Node decrypt: ${failure.isNodeDecrypt}`);
        console.log(`   - Test failure: ${failure.hasFailureMatch}`);
        if (failure.errorSample) {
          console.log(
            `   - Error sample: ${failure.errorSample.slice(0, 80)}...`,
          );
        }
      });

      if (failureDetails.length > 5) {
        console.log(`\n   ... and ${failureDetails.length - 5} more failures`);
      }
    }

    console.log("\n💡 CONCLUSIONS:");
    console.log("===============");
    if (failures === 0) {
      console.log(
        "✅ No failures detected - the issue may be very rare or environment-specific",
      );
    } else if (failures < completedTests * 0.01) {
      console.log(
        "⚠️  Very low failure rate (<1%) - rare but real production risk",
      );
    } else if (failures < completedTests * 0.05) {
      console.log("🚨 Low failure rate (1-5%) - significant production risk");
    } else if (failures < completedTests * 0.1) {
      console.log(
        "🔥 Moderate failure rate (5-10%) - serious production issue",
      );
    } else {
      console.log(
        "💥 High failure rate (>10%) - critical production emergency",
      );
    }

    const failureRate = ((failures / completedTests) * 100).toFixed(2);
    console.log(`\nFailure rate: ${failureRate}%`);
    console.log(
      `Estimated production impact: ${failures > 0 ? "IMMEDIATE FIX REQUIRED" : "Monitor closely"}`,
    );

    if (failures > 0) {
      console.log("\n🚨 RECOMMENDATION:");
      console.log(
        "- DO NOT deploy current crypto implementation to production",
      );
      console.log("- Switch to single crypto library for both platforms");
      console.log("- Add extensive error logging and monitoring");
      console.log("- Consider data recovery mechanisms for affected users");
    }

    process.exit(0);
  }

  // Parse command line arguments
  const iterations = process.argv[2] ? parseInt(process.argv[2]) : 1000;
  const workers = process.argv[3] ? parseInt(process.argv[3]) : null;

  if (isNaN(iterations) || iterations < 1) {
    console.error(
      "Usage: node test-failure-rate-parallel.js [iterations] [workers]",
    );
    console.error("Example: node test-failure-rate-parallel.js 1000 8");
    process.exit(1);
  }

  testFailureRateParallel(iterations, workers).catch(console.error);
}
