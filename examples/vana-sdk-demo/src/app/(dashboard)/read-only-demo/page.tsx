"use client";

import { useState } from "react";
import { useVana } from "@/providers/VanaProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Info, AlertCircle } from "lucide-react";
import type { Address } from "@opendatalabs/vana-sdk/browser";
import { ReadOnlyError } from "@opendatalabs/vana-sdk/browser";

export default function ReadOnlyDemoPage() {
  const { vana, isReadOnly } = useVana();
  const [selectedAddress, setSelectedAddress] = useState<string>(
    "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEd1",
  );
  const [results, setResults] = useState<{
    [key: string]: { success: boolean; data?: any; error?: string };
  }>({});

  // Example addresses for testing
  const exampleAddresses = [
    {
      label: "Example User 1",
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEd1",
    },
    {
      label: "Example User 2",
      address: "0x1234567890123456789012345678901234567890",
    },
    {
      label: "Example User 3",
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
    },
  ];

  // Read operations that work in both modes
  const readOperations = [
    {
      name: "Get User Files",
      description: "Fetch user's file metadata from blockchain",
      operation: async () => {
        if (!vana) throw new Error("SDK not initialized");
        const files = await vana.data.getUserFiles({
          owner: "0x0000000000000000000000000000000000000000" as Address,
        });
        return { count: files.length, files: files.slice(0, 3) };
      },
    },
    {
      name: "Get Permissions",
      description: "Fetch user's permission grants",
      operation: async () => {
        if (!vana) throw new Error("SDK not initialized");
        const permissions =
          await vana.permissions.getUserPermissionGrantsOnChain();
        return {
          count: permissions.length,
          permissions: permissions.slice(0, 3),
        };
      },
    },
    {
      name: "List DLPs",
      description: "List all Data Liquidity Pools",
      operation: async () => {
        if (!vana) throw new Error("SDK not initialized");
        const dlps = await vana.data.listDLPs({ limit: 5 });
        return { count: dlps.length, dlps };
      },
    },
    {
      name: "Count Schemas",
      description: "Get total number of schemas",
      operation: async () => {
        if (!vana) throw new Error("SDK not initialized");
        const count = await vana.schemas.count();
        return { totalSchemas: count };
      },
    },
  ];

  // Write operations that require a wallet
  const writeOperations = [
    {
      name: "Decrypt File",
      description: "Decrypt file content (requires wallet signature)",
      operation: async () => {
        if (!vana) throw new Error("SDK not initialized");
        // This will throw ReadOnlyError in read-only mode
        await vana.data.decryptFile({
          id: 1,
          url: "sample-url",
          ownerAddress: "0x0000000000000000000000000000000000000000" as Address,
          addedAtBlock: 0n,
        });
        return { success: true };
      },
    },
    {
      name: "Submit Permission Grant",
      description: "Grant permission to access data (requires transaction)",
      operation: async () => {
        if (!vana) throw new Error("SDK not initialized");
        // This will throw ReadOnlyError in read-only mode
        await vana.permissions.submitPermissionGrant({
          grantee: "0x1234567890123456789012345678901234567890" as Address,
          dataId: BigInt(1),
          operations: ["read"],
        } as any);
        return { success: true };
      },
    },
    {
      name: "Create Schema",
      description: "Create a new schema on-chain (requires transaction)",
      operation: async () => {
        if (!vana) throw new Error("SDK not initialized");
        // This will throw ReadOnlyError in read-only mode
        await vana.schemas.create({
          name: "Test Schema",
          definition: {},
        } as any);
        return { success: true };
      },
    },
  ];

  const runOperation = async (name: string, operation: () => Promise<any>) => {
    try {
      const result = await operation();
      setResults((prev) => ({
        ...prev,
        [name]: { success: true, data: result },
      }));
    } catch (error) {
      if (error instanceof ReadOnlyError) {
        setResults((prev) => ({
          ...prev,
          [name]: {
            success: false,
            error: `Read-only mode: ${error.message}`,
          },
        }));
      } else {
        setResults((prev) => ({
          ...prev,
          [name]: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }));
      }
    }
  };

  const clearResults = () => {
    setResults({});
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Read-Only Mode Demo</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Explore the SDK's read-only capabilities without connecting a wallet
        </p>
      </div>

      {/* Mode Status */}
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertTitle>Current Mode</AlertTitle>
        <AlertDescription className="flex items-center gap-2 mt-2">
          SDK is running in{" "}
          <Badge variant={isReadOnly ? "secondary" : "default"}>
            {isReadOnly ? "Read-Only" : "Full"} Mode
          </Badge>
          {isReadOnly ? (
            <span>Only read operations are available</span>
          ) : (
            <span>All operations are available with connected wallet</span>
          )}
        </AlertDescription>
      </Alert>

      {/* Address Selection (for read-only mode) */}
      {isReadOnly && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Address Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="address">View data for address:</Label>
                <Input
                  id="address"
                  type="text"
                  value={selectedAddress}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setSelectedAddress(e.target.value);
                  }}
                  placeholder="0x..."
                  className="mt-2"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {exampleAddresses.map((example) => (
                  <Button
                    key={example.address}
                    variant="outline"
                    onClick={() => {
                      setSelectedAddress(example.address);
                    }}
                  >
                    {example.label}
                  </Button>
                ))}
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  In read-only mode, you can view any address's public on-chain
                  data without needing their private key.
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Read Operations */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Read Operations
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            These operations work in both read-only and full mode
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {readOperations.map((op) => (
              <div key={op.name} className="border rounded-lg p-4">
                <h3 className="font-semibold mb-1">{op.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {op.description}
                </p>
                <Button
                  onClick={() => runOperation(op.name, op.operation)}
                  className="w-full"
                >
                  Run
                </Button>
                {results[op.name] && (
                  <div className="mt-3">
                    {results[op.name].success ? (
                      <div className="text-sm">
                        <Badge variant="outline" className="text-green-600">
                          Success
                        </Badge>
                        <pre className="mt-2 text-xs overflow-auto bg-gray-100 dark:bg-gray-800 p-2 rounded">
                          {JSON.stringify(results[op.name].data, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <Badge variant="outline" className="text-red-600">
                          Error
                        </Badge>
                        <p className="mt-2 text-red-600">
                          {results[op.name].error}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Write Operations */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Write Operations
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            These operations require a wallet connection (will throw
            ReadOnlyError in read-only mode)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {writeOperations.map((op) => (
              <div key={op.name} className="border rounded-lg p-4">
                <h3 className="font-semibold mb-1">{op.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {op.description}
                </p>
                <Button
                  onClick={() => runOperation(op.name, op.operation)}
                  className="w-full"
                  variant={isReadOnly ? "secondary" : "default"}
                >
                  {isReadOnly ? "Try (Will Fail)" : "Run"}
                </Button>
                {results[op.name] && (
                  <div className="mt-3">
                    {results[op.name].success ? (
                      <div className="text-sm">
                        <Badge variant="outline" className="text-green-600">
                          Success
                        </Badge>
                        <pre className="mt-2 text-xs overflow-auto bg-gray-100 dark:bg-gray-800 p-2 rounded">
                          {JSON.stringify(results[op.name].data, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <Badge variant="outline" className="text-red-600">
                          {isReadOnly ? "Expected Error" : "Error"}
                        </Badge>
                        <p className="mt-2 text-red-600">
                          {results[op.name].error}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Clear Results */}
      {Object.keys(results).length > 0 && (
        <div className="flex justify-center">
          <Button onClick={clearResults} variant="outline">
            Clear All Results
          </Button>
        </div>
      )}

      {/* Code Examples */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Implementation Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Read-Only Initialization</h3>
              <pre className="text-sm overflow-auto bg-gray-100 dark:bg-gray-800 p-4 rounded">
                {`import { Vana } from '@opendatalabs/vana-sdk/browser';

// Initialize with just an address
const vana = Vana({
  address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEd1',
  chain: moksha // optional, defaults to mainnet
});

// Read operations work
const files = await vana.data.getUserFiles();
const permissions = await vana.permissions.getUserPermissionGrantsOnChain();

// Write operations throw ReadOnlyError
try {
  await vana.data.decryptFile('file-id');
} catch (error) {
  if (error instanceof ReadOnlyError) {
    console.log('Need wallet for this operation');
  }
}`}
              </pre>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Full Mode Initialization</h3>
              <pre className="text-sm overflow-auto bg-gray-100 dark:bg-gray-800 p-4 rounded">
                {`import { Vana } from '@opendatalabs/vana-sdk/browser';
import { createWalletClient, custom } from 'viem';

// Initialize with wallet client
const walletClient = createWalletClient({
  chain: moksha,
  transport: custom(window.ethereum)
});

const vana = Vana({ walletClient });

// All operations work
const files = await vana.data.getUserFiles();
await vana.data.decryptFile('file-id'); // ✅ Works`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
