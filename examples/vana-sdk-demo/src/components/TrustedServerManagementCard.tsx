import React from "react";
import { Card, CardHeader, CardBody, Button } from "@heroui/react";
import { Shield } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { FormBuilder } from "./ui/FormBuilder";
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

  // Actions
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
  chainId?: number;
}

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
  trustServerError,
  trustServerResult,
  trustedServers,
  isLoadingTrustedServers,
  onRefreshTrustedServers,
  onUntrustServer,
  isUntrusting,
  chainId,
}) => {
  return (
    <Card id="trusted-servers">
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
        <FormBuilder
          title=""
          singleColumn={true}
          fields={[
            {
              name: "serverId",
              label: "Server ID",
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
              placeholder: "https://...",
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
          submitText="Trust Server"
          submitIcon={<Shield className="h-4 w-4" />}
          status={trustServerError}
          additionalButtons={
            <Button
              onPress={onDiscoverReplicateServer}
              isLoading={isDiscoveringServer}
              variant="bordered"
            >
              <Shield className="h-4 w-4 mr-2" />
              Get Hosted Server
            </Button>
          }
        />

        {trustServerResult && chainId && (
          <div className="p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded">
            <ExplorerLink
              type="tx"
              hash={trustServerResult}
              chainId={chainId}
              truncate={true}
            />
          </div>
        )}

        <ResourceList
          title="Trusted Servers"
          description={`${trustedServers.length} servers`}
          items={trustedServers}
          isLoading={isLoadingTrustedServers}
          onRefresh={onRefreshTrustedServers}
          renderItem={(server, index) =>
            chainId ? (
              <TrustedServerListItem
                key={server}
                serverId={server}
                index={index}
                onUntrust={onUntrustServer}
                isUntrusting={isUntrusting}
                chainId={chainId}
              />
            ) : null
          }
          emptyState={
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title="No trusted servers yet"
            />
          }
        />
      </CardBody>
    </Card>
  );
};
