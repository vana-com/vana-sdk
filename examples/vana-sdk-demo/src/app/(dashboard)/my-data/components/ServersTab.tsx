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
import { ExternalLink, RefreshCw, Shield, Trash2, Server } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { FormBuilder } from "@/components/ui/FormBuilder";

interface TrustedServer {
  id: string;
  url: string;
  name: string;
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
  serverId: string;
  serverUrl: string;

  // Callbacks
  onServerIdChange: (id: string) => void;
  onServerUrlChange: (url: string) => void;
  onQueryModeChange: (mode: "subgraph" | "rpc" | "auto") => void;
  onTrustServer: (serverId?: string, serverUrl?: string) => void;
  onRefreshServers: () => void;
  onUntrustServer: (serverId: string) => void;
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
  serverId,
  serverUrl,
  onServerIdChange,
  onServerUrlChange,
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
