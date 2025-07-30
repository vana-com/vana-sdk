"use client";

import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  ExternalLink,
  RefreshCw,
  Shield,
  Trash2,
  Server,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { FormBuilder } from "@/components/ui/FormBuilder";

interface TrustedServer {
  id: number;
  owner: string;
  url: string;
  serverAddress: string;
  publicKey: string;
  name?: string;
  endBlock?: bigint; // Optional field for server expiration
}

interface ServersTabProps {
  // Server data
  trustedServers: TrustedServer[];
  isLoadingServers: boolean;
  isTrustingServer: boolean;
  isUntrusting: boolean;
  isDiscoveringServer: boolean;
  trustServerError: string;

  // Input state
  queryMode: "subgraph" | "rpc" | "auto";
  serverAddress: string;
  serverUrl: string;
  publicKey: string;

  // Callbacks
  onServerAddressChange: (address: string) => void;
  onServerUrlChange: (url: string) => void;
  onPublicKeyChange: (key: string) => void;
  onQueryModeChange: (mode: "subgraph" | "rpc" | "auto") => void;
  onTrustServer: () => void;
  onRefreshServers: () => void;
  onUntrustServer: (serverId: number) => void;
  onDiscoverReplicateServer: () => void;
}

export function ServersTab({
  trustedServers,
  isLoadingServers,
  isTrustingServer,
  isUntrusting,
  isDiscoveringServer,
  trustServerError,
  queryMode,
  serverAddress,
  serverUrl,
  publicKey,
  onServerAddressChange,
  onServerUrlChange,
  onPublicKeyChange,
  onQueryModeChange,
  onTrustServer,
  onRefreshServers,
  onUntrustServer,
  onDiscoverReplicateServer,
}: ServersTabProps) {
  return (
    <div className="space-y-6">
      {/* Trust Server */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Trust New Server</h3>
          </div>
        </CardHeader>
        <CardBody>
          <FormBuilder
            title=""
            singleColumn={true}
            fields={[
              {
                name: "serverAddress",
                label: "Server Address",
                type: "text",
                value: serverAddress,
                onChange: onServerAddressChange,
                placeholder: "0x...",
                description: "The Ethereum address of the server",
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
              {
                name: "publicKey",
                label: "Public Key",
                type: "text",
                value: publicKey,
                onChange: onPublicKeyChange,
                placeholder: "0x...",
                description: "The server's public key for encryption",
                required: true,
              },
            ]}
            onSubmit={onTrustServer}
            isSubmitting={isTrustingServer}
            submitText="Add and Trust Server"
            submitIcon={<Shield className="h-4 w-4" />}
            status={trustServerError}
            additionalButtons={
              <Button
                onPress={onDiscoverReplicateServer}
                isLoading={isDiscoveringServer}
                variant="bordered"
                startContent={<Server className="h-4 w-4" />}
              >
                Get Hosted Server Details
              </Button>
            }
          />
        </CardBody>
      </Card>

      {/* Trusted Servers List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">Your Trusted Servers</h3>
                <p className="text-sm text-default-500">
                  {trustedServers.length} server
                  {trustedServers.length !== 1 ? "s" : ""} trusted
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
                <SelectItem key="auto" textValue="Auto (Smart Fallback)">
                  Auto (Smart Fallback)
                </SelectItem>
                <SelectItem key="subgraph" textValue="Subgraph (Fast)">
                  Subgraph (Fast)
                </SelectItem>
                <SelectItem key="rpc" textValue="RPC (Direct)">
                  RPC (Direct)
                </SelectItem>
              </Select>
              <Button
                onPress={onRefreshServers}
                variant="bordered"
                size="sm"
                startContent={
                  isLoadingServers ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )
                }
                isDisabled={isLoadingServers}
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {trustedServers.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title="No trusted servers"
              description="Trust a server above to see it listed here"
            />
          ) : (
            <Table aria-label="Trusted servers table" removeWrapper>
              <TableHeader>
                <TableColumn>Server ID</TableColumn>
                <TableColumn>Owner</TableColumn>
                <TableColumn>Server Address</TableColumn>
                <TableColumn>URL</TableColumn>
                <TableColumn>Public Key</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {trustedServers.map((server) => {
                  // For now, assume all servers in the list are Active since they're returned by the API
                  // In the future, this would check: server.endBlock === 0n || server.endBlock >= currentBlockNumber
                  const isActive = true; // Placeholder logic - all servers are Active for now
                  const status = isActive ? "Active" : "Untrusted";

                  return (
                    <TableRow key={server.id}>
                      <TableCell>
                        <span className="font-mono text-sm">{server.id}</span>
                      </TableCell>
                      <TableCell>
                        <AddressDisplay
                          address={server.owner}
                          truncate={true}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>
                        <AddressDisplay
                          address={server.serverAddress}
                          truncate={true}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>
                        {server.url && (
                          <div className="flex items-center gap-2">
                            <Button
                              as="a"
                              href={server.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              variant="flat"
                              isIconOnly
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                            <CopyButton
                              value={server.url}
                              tooltip="Copy server URL"
                              isInline
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <CopyButton
                          value={server.publicKey}
                          tooltip="Copy public key"
                          isInline
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <CheckCircle className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-danger" />
                          )}
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              isActive
                                ? "bg-success/20 text-success-700"
                                : "bg-danger/20 text-danger-700"
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* Only show Untrust button for Active servers */}
                        {isActive && (
                          <Button
                            color="danger"
                            variant="flat"
                            size="sm"
                            onPress={() => onUntrustServer(server.id)}
                            isLoading={isUntrusting}
                            isDisabled={isUntrusting}
                            startContent={<Trash2 className="h-3 w-3" />}
                          >
                            Untrust
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
