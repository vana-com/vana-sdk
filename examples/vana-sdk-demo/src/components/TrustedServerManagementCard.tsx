import React from "react";
import { Card, CardHeader, CardBody } from "@heroui/react";
import { Shield } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { FormBuilder } from "./ui/FormBuilder";
import { StatusMessage } from "./ui/StatusMessage";
import { ResourceList } from "./ui/ResourceList";
import { TrustedServerListItem } from "./TrustedServerListItem";
import { EmptyState } from "./ui/EmptyState";
import { ExplorerLink } from "./ui/ExplorerLink";

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
        {/* Trust Server Form */}
        <FormBuilder
          title="Trust Server"
          fields={[
            {
              name: "serverId",
              label: "Server ID (Address)",
              type: "text",
              value: serverId,
              onChange: onServerIdChange,
              placeholder: "0x...",
              required: true,
            },
            {
              name: "serverUrl",
              label: "Server URL",
              type: "text",
              value: serverUrl,
              onChange: onServerUrlChange,
              placeholder: "https://example.com",
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
