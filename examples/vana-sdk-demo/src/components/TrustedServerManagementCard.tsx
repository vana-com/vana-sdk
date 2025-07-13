import React from "react";
import {
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Select,
  SelectItem,
} from "@heroui/react";
import { Shield, ExternalLink, Trash2 } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { FormBuilder } from "./ui/FormBuilder";
import { AddressDisplay } from "./ui/AddressDisplay";
import { EmptyState } from "./ui/EmptyState";

interface TrustedServerManagementCardProps {
  // Form state
  serverId: string;
  onServerIdChange: (value: string) => void;
  serverUrl: string;
  onServerUrlChange: (value: string) => void;

  // Actions
  onTrustServer: () => void;
  isTrustingServer: boolean;
  onUntrustServer?: (serverId: string) => void;
  isUntrusting?: boolean;

  // Server discovery (only to populate form)
  onDiscoverReplicateServer: () => void;
  isDiscoveringServer: boolean;

  // Trusted servers list
  trustedServers?: Array<{
    id: string;
    url?: string;
    name?: string;
  }>;
  isLoadingServers?: boolean;
  onRefreshServers?: () => void;

  // Results and status
  trustServerError: string;
  chainId?: number;

  // Query mode selection
  queryMode?: "subgraph" | "rpc" | "auto";
  onQueryModeChange?: (mode: "subgraph" | "rpc" | "auto") => void;
}

export const TrustedServerManagementCard: React.FC<
  TrustedServerManagementCardProps
> = ({
  serverId,
  onServerIdChange,
  serverUrl,
  onServerUrlChange,
  onTrustServer,
  isTrustingServer,
  onUntrustServer,
  isUntrusting = false,
  onDiscoverReplicateServer,
  isDiscoveringServer,
  trustedServers = [],
  isLoadingServers = false,
  onRefreshServers,
  trustServerError,
  chainId = 14800,
  queryMode = "auto",
  onQueryModeChange,
}) => {
  return (
    <section id="trusted-servers">
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
      <div className="mt-6">
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
              description: "The Ethereum address of the server to trust",
              required: true,
            },
            {
              name: "serverUrl",
              label: "Server URL",
              type: "text",
              value: serverUrl,
              onChange: onServerUrlChange,
              placeholder: "https://...",
              description: "The API endpoint URL of the server",
              required: true,
            },
          ]}
          onSubmit={onTrustServer}
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
              Get Hosted Server Details
            </Button>
          }
        />

        {/* Trusted Servers Table - only show if parent supports this functionality */}
        {onRefreshServers && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-lg font-semibold">Your Trusted Servers</h4>
                <p className="text-small text-default-500">
                  {trustedServers.length} server
                  {trustedServers.length !== 1 ? "s" : ""} trusted
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onQueryModeChange && (
                  <Select
                    size="sm"
                    label="Query Mode"
                    placeholder="Select query mode"
                    selectedKeys={[queryMode]}
                    onSelectionChange={(keys) => {
                      const mode = Array.from(keys)[0] as
                        | "subgraph"
                        | "rpc"
                        | "auto";
                      onQueryModeChange(mode);
                    }}
                    className="w-40"
                  >
                    <SelectItem key="auto">Auto (Smart Fallback)</SelectItem>
                    <SelectItem key="subgraph">Subgraph (Fast)</SelectItem>
                    <SelectItem key="rpc">RPC (Direct)</SelectItem>
                  </Select>
                )}
                <Button
                  onPress={onRefreshServers}
                  variant="bordered"
                  size="sm"
                  isLoading={isLoadingServers}
                >
                  Refresh
                </Button>
              </div>
            </div>

            {trustedServers.length === 0 ? (
              <EmptyState
                icon={<Shield className="h-12 w-12" />}
                title="No trusted servers"
                description="Trust a server above to see it listed here"
              />
            ) : (
              <Table
                aria-label="Trusted servers table"
                removeWrapper
                classNames={{
                  th: "bg-default-100 text-default-700",
                  td: "py-4",
                }}
              >
                <TableHeader>
                  <TableColumn>Server Address</TableColumn>
                  <TableColumn>URL</TableColumn>
                  <TableColumn>Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {trustedServers.map((server) => (
                    <TableRow key={server.id}>
                      <TableCell>
                        <AddressDisplay
                          address={server.id}
                          chainId={chainId}
                          showCopy={true}
                          showExternalLink={true}
                          truncate={true}
                        />
                      </TableCell>
                      <TableCell>
                        {server.url ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm truncate max-w-48">
                              {server.url}
                            </span>
                            <Button
                              size="sm"
                              variant="flat"
                              isIconOnly
                              as="a"
                              href={server.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open server URL"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-default-400">No URL</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          color="danger"
                          variant="flat"
                          size="sm"
                          onPress={() => onUntrustServer?.(server.id)}
                          isLoading={isUntrusting}
                          isDisabled={isUntrusting}
                          startContent={<Trash2 className="h-3 w-3" />}
                        >
                          Untrust
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
