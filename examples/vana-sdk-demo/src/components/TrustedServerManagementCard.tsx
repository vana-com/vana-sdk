import React, { useState } from "react";
import { Card, CardHeader, CardBody, Button } from "@heroui/react";
import { Shield, Sparkles, ChevronDown, ChevronUp, Info } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { FormBuilder } from "./ui/FormBuilder";
import { StatusMessage } from "./ui/StatusMessage";
import { ResourceList } from "./ui/ResourceList";
import { TrustedServerListItem } from "./TrustedServerListItem";
import { EmptyState } from "./ui/EmptyState";
import { ExplorerLink } from "./ui/ExplorerLink";
import type { DiscoveredServerInfo } from "@/types/api";

interface TrustedServerManagementCardProps {
  // Form state
  serverId: string;
  onServerIdChange: (value: string) => void;
  serverUrl: string;
  onServerUrlChange: (value: string) => void;
  useGaslessTransaction: boolean;
  onUseGaslessTransactionChange: (value: boolean) => void;

  // Form actions
  onTrustServer: () => void;
  onTrustServerGasless: () => void;
  isTrustingServer: boolean;

  // Server discovery
  onDiscoverReplicateServer: () => void;
  isDiscoveringServer: boolean;
  discoveredServerInfo: DiscoveredServerInfo | null;

  // Results and status
  trustServerError: string;
  trustServerResult: string;
  personalServerError: string;
  personalServerResult: string;

  // Trusted servers list
  trustedServers: string[];
  isLoadingTrustedServers: boolean;
  onRefreshTrustedServers: () => void;
  onUntrustServer: (serverId: string) => void;
  isUntrusting: boolean;

  // Chain info
  chainId: number;
}

/**
 * TrustedServerManagementCard component - Complete trusted server management workflow
 * Demonstrates trustServer(), untrustServer(), getTrustedServers()
 */
export const TrustedServerManagementCard: React.FC<
  TrustedServerManagementCardProps
> = ({
  serverId,
  onServerIdChange,
  serverUrl,
  onServerUrlChange,
  useGaslessTransaction,
  onUseGaslessTransactionChange,
  onTrustServer,
  onTrustServerGasless,
  isTrustingServer,
  onDiscoverReplicateServer,
  isDiscoveringServer,
  discoveredServerInfo,
  trustServerError,
  trustServerResult,
  personalServerError,
  personalServerResult,
  trustedServers,
  isLoadingTrustedServers,
  onRefreshTrustedServers,
  onUntrustServer,
  isUntrusting,
  chainId,
}) => {
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={<Shield className="h-5 w-5" />}
          title="Trusted Server Management"
          description={
            <>
              <em>
                Demonstrates: `trustServer()`, `untrustServer()`,
                `getTrustedServers()`
              </em>
              <br />
              Manage your list of trusted servers for data processing - required
              before uploading to servers.
            </>
          }
        />
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Quick Setup Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium">Quick Setup</h4>
            <span className="text-sm text-gray-500">Popular Services</span>
          </div>

          <Button
            onClick={onDiscoverReplicateServer}
            disabled={isDiscoveringServer}
            variant="bordered"
            className="h-auto p-4 flex flex-col items-start gap-2 max-w-md"
          >
            <div className="flex items-center gap-2 w-full">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <span className="font-medium">Discover Replicate Server</span>
              {isDiscoveringServer && (
                <div className="ml-auto">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500 text-left">
              Discover and add Replicate's AI server automatically
            </span>
          </Button>
        </div>

        {/* Discovered Server Info */}
        {discoveredServerInfo && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span className="text-blue-700 dark:text-blue-300 font-medium">
                {discoveredServerInfo.name} Server Discovered
              </span>
            </div>
            <div className="space-y-2">
              <div className="text-sm">
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  Server ID:
                </span>
                <div className="mt-1 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                  <ExplorerLink
                    type="address"
                    hash={discoveredServerInfo.serverId}
                    chainId={chainId}
                    truncate={true}
                  />
                </div>
              </div>
              <div className="text-sm">
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  Server URL:
                </span>
                <div className="mt-1 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 font-mono text-xs">
                  {discoveredServerInfo.serverUrl}
                </div>
              </div>

              {/* Advanced Details Toggle */}
              {discoveredServerInfo.publicKey && (
                <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                  <Button
                    variant="light"
                    size="sm"
                    className="text-blue-600 dark:text-blue-400 p-0 h-auto min-w-0"
                    onPress={() => setShowAdvancedDetails(!showAdvancedDetails)}
                  >
                    <div className="flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      <span className="text-xs">Advanced Details</span>
                      {showAdvancedDetails ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </Button>

                  {showAdvancedDetails && (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm">
                        <span className="font-medium text-blue-700 dark:text-blue-300">
                          Public Key:
                        </span>
                        <div className="mt-1 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 font-mono text-xs break-all">
                          {discoveredServerInfo.publicKey}
                        </div>
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/50 p-2 rounded">
                        <strong>Use:</strong> Encrypt data for this server •{" "}
                        <strong>Type:</strong> ECDSA secp256k1
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
                This server is auto-populated below.
              </p>
            </div>
          </div>
        )}

        {/* Manual Trust Server Form */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium">Manual Setup</h4>
            <span className="text-sm text-gray-500">Advanced</span>
          </div>

          <FormBuilder
            fields={[
              {
                name: "serverId",
                label: "Server ID (Address)",
                type: "text",
                value: serverId,
                onChange: onServerIdChange,
                placeholder: "0x... or use Quick Setup above",
                required: true,
              },
              {
                name: "serverUrl",
                label: "Server URL",
                type: "text",
                value: serverUrl,
                onChange: onServerUrlChange,
                placeholder: "https://example.com or use Quick Setup above",
                required: true,
              },
              {
                name: "transactionType",
                label: "Transaction Type",
                type: "select",
                value: useGaslessTransaction ? "gasless" : "gas",
                onChange: (value) =>
                  onUseGaslessTransactionChange(value === "gasless"),
                options: [
                  { value: "gas", label: "Gas Transaction" },
                  { value: "gasless", label: "Gasless (Signature)" },
                ],
              },
            ]}
            onSubmit={
              useGaslessTransaction ? onTrustServerGasless : onTrustServer
            }
            isSubmitting={isTrustingServer}
            submitText={
              useGaslessTransaction ? "Sign & Trust Server" : "Trust Server"
            }
            submitIcon={<Shield className="h-4 w-4" />}
            status={trustServerError}
          />
        </div>

        {/* Trust Server Success Result */}
        {trustServerResult && (
          <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-700 dark:text-green-300 font-medium">
                Server trusted successfully!
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Transaction Hash:
              </p>
              <ExplorerLink
                type="tx"
                hash={trustServerResult}
                chainId={chainId}
                truncate={true}
              />
            </div>
          </div>
        )}

        {/* Trusted Servers List */}
        <div className="space-y-4 pt-2 border-t">
          <ResourceList
            title="Your Trusted Servers"
            description={`Servers you've authorized for data processing (${trustedServers.length} servers)`}
            items={trustedServers}
            isLoading={isLoadingTrustedServers}
            onRefresh={onRefreshTrustedServers}
            renderItem={(server, index) => (
              <TrustedServerListItem
                key={server}
                serverId={server}
                index={index}
                onUntrust={onUntrustServer}
                isUntrusting={isUntrusting}
                chainId={chainId}
              />
            )}
            emptyState={
              <EmptyState title="No trusted servers found." size="compact" />
            }
          />
        </div>

        {/* Trusted Server Setup Result Display */}
        {personalServerError && (
          <StatusMessage
            status={personalServerError}
            type="error"
            className="p-4"
          />
        )}

        {personalServerResult && (
          <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <p className="text-green-700 dark:text-green-300 font-medium">
                Personal server initialized successfully!
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Server ID (Derived Address):
              </p>
              <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                <ExplorerLink
                  type="address"
                  hash={personalServerResult}
                  chainId={chainId}
                  label="Server ID (Derived Address)"
                />
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
};
