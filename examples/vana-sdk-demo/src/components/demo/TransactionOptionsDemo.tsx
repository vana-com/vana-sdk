"use client";

import { useState } from "react";
import { useVana } from "@/providers/VanaProvider";
import { useAccount, usePublicClient } from "wagmi";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Code,
  addToast,
} from "@heroui/react";
import type { TransactionOptions } from "@opendatalabs/vana-sdk/browser";

/**
 * Demonstrates how to use transaction options with the Vana SDK.
 * Shows nonce management, gas configuration, and retry capabilities.
 */
export function TransactionOptionsDemo() {
  const { vana } = useVana();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nonce, setNonce] = useState<string>("");
  const [gasPrice, setGasPrice] = useState<string>("30"); // in gwei
  const [gas, setGas] = useState<string>("500000");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };

  const handleSequentialTransactions = async () => {
    if (!vana || !address) {
      addToast({
        title: "Not connected",
        description: "Please connect your wallet first",
        variant: "solid",
        color: "warning",
      });
      return;
    }

    setIsSubmitting(true);
    setLogs([]);

    try {
      // Get current nonce using wagmi's public client
      const currentNonce = publicClient
        ? await publicClient.getTransactionCount({
            address: address as `0x${string}`,
          })
        : 0;
      addLog(`Current nonce: ${currentNonce}`);

      // Example: Upload data with custom transaction options
      // This demonstrates how to control gas and nonce for operations
      const options1: TransactionOptions = {
        nonce: currentNonce,
        gas: BigInt(gas),
        gasPrice: BigInt(gasPrice) * BigInt(10 ** 9), // Convert gwei to wei
      };

      addLog("Uploading demo data with custom transaction options...");
      addLog(
        "Options: " +
          JSON.stringify({
            nonce: options1.nonce,
            gas: options1.gas?.toString(),
            gasPrice: options1.gasPrice?.toString(),
          }),
      );

      try {
        // Grant a permission with custom transaction options
        // This demonstrates transaction options usage with the permissions system
        const grantParams = {
          grantee:
            "0x0000000000000000000000000000000000000001" as `0x${string}`,
          operation: "demo_operation",
          files: [1], // Demo file ID
          parameters: { demo: true },
        };

        addLog("Creating and signing permission grant...");
        const { typedData, signature } =
          await vana.permissions.createAndSign(grantParams);

        addLog("Submitting with custom transaction options...");
        const result = await vana.permissions.submitSignedGrant(
          typedData,
          signature,
          options1, // Pass transaction options
        );

        addLog(`Permission grant submitted! Transaction: ${result.hash}`);

        // Demonstrate sequential transaction with next nonce
        const options2: TransactionOptions = {
          nonce: currentNonce + 1,
          gas: BigInt(gas),
          gasPrice: BigInt(gasPrice) * BigInt(10 ** 9),
        };

        addLog(
          `Submitting second transaction with nonce ${currentNonce + 1}...`,
        );

        // Could do another operation here with options2
        // For demo purposes, just show the concept
        addLog("Sequential transactions ensure proper ordering");
      } catch (error) {
        addLog(
          `Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Show how the operation store enables retry with same nonce
      addLog("");
      addLog("With operation store (relayer mode):");
      addLog("✓ Transaction state is persisted across retries");
      addLog("✓ Automatic retry on temporary failures");
      addLog("✓ Nonce conflicts handled automatically");
      addLog("✓ Poll for status with operation ID");
    } catch (error) {
      console.error("Transaction demo error:", error);
      addLog(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      addToast({
        title: "Transaction failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "solid",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomOptionsTransaction = async () => {
    if (!vana || !address) {
      addToast({
        title: "Not connected",
        description: "Please connect your wallet first",
        variant: "solid",
        color: "warning",
      });
      return;
    }

    setIsSubmitting(true);
    setLogs([]);

    try {
      const options: TransactionOptions = {};

      // Add custom nonce if specified
      if (nonce) {
        options.nonce = parseInt(nonce);
        addLog(`Using custom nonce: ${options.nonce}`);
      } else {
        addLog("Using automatic nonce from wallet");
      }

      // Add gas settings
      if (gas) {
        options.gas = BigInt(gas);
        addLog(`Using gas limit: ${options.gas}`);
      }

      if (gasPrice) {
        options.gasPrice = BigInt(gasPrice) * BigInt(10 ** 9);
        addLog(`Using gas price: ${gasPrice} gwei`);
      }

      addLog("Submitting permission grant with custom transaction options...");
      addLog(
        "Options: " +
          JSON.stringify({
            nonce: options.nonce,
            gas: options.gas?.toString(),
            gasPrice: options.gasPrice?.toString(),
          }),
      );

      // Create a demo permission grant with custom options
      const timestamp = new Date().toISOString();
      const grantParams = {
        grantee: "0x0000000000000000000000000000000000000002" as `0x${string}`,
        operation: `custom_demo_${Date.now()}`,
        files: [1],
        parameters: { timestamp, custom: true },
      };

      const { typedData, signature } =
        await vana.permissions.createAndSign(grantParams);

      const result = await vana.permissions.submitSignedGrant(
        typedData,
        signature,
        options, // Pass custom transaction options
      );

      addLog(`Transaction submitted: ${result.hash}`);
      addLog("Transaction will be mined with custom gas settings");

      // Note: We could wait for receipt but skipping for demo purposes
      addLog("Use operation store to track transaction status across retries");

      addToast({
        title: "Permission granted",
        description: `Transaction: ${result.hash}`,
        variant: "solid",
        color: "success",
      });
    } catch (error) {
      console.error("Custom transaction error:", error);
      addLog(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      // Show retry guidance
      if (error instanceof Error && error.message.includes("nonce")) {
        addLog("");
        addLog("💡 Nonce conflict detected!");
        addLog("With operation store, this would be automatically retried.");
        addLog("Without it, increment the nonce and try again.");
      }

      addToast({
        title: "Transaction failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "solid",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Transaction Options Demo</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Demonstrates nonce management, gas configuration, and retry
            capabilities
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Nonce (optional)"
              placeholder="Auto"
              value={nonce}
              onChange={(e) => {
                setNonce(e.target.value);
              }}
              description="Leave empty for automatic"
              type="number"
            />
            <Input
              label="Gas Limit"
              placeholder="500000"
              value={gas}
              onChange={(e) => {
                setGas(e.target.value);
              }}
              type="number"
            />
            <Input
              label="Gas Price (gwei)"
              placeholder="30"
              value={gasPrice}
              onChange={(e) => {
                setGasPrice(e.target.value);
              }}
              type="number"
            />
          </div>

          <div className="flex gap-4">
            <Button
              color="primary"
              onPress={handleCustomOptionsTransaction}
              isLoading={isSubmitting}
              isDisabled={!vana || !address}
            >
              Send with Custom Options
            </Button>
            <Button
              color="secondary"
              onPress={handleSequentialTransactions}
              isLoading={isSubmitting}
              isDisabled={!vana || !address}
            >
              Demo Sequential Transactions
            </Button>
          </div>

          {logs.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2">Transaction Logs:</h4>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 max-h-64 overflow-y-auto">
                {logs.map((log, index) => (
                  <Code key={index} className="block text-xs mb-1">
                    {log}
                  </Code>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h4 className="text-sm font-semibold mb-2">
              With Operation Store (Relayer Mode):
            </h4>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>Transactions are tracked with unique operation IDs</li>
              <li>State persists across retries (nonce, gas settings)</li>
              <li>Automatic retry on failure with same nonce</li>
              <li>
                Poll for status with <Code>status_check</Code> requests
              </li>
              <li>No nonce conflicts when sending multiple transactions</li>
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
