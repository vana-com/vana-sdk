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
  Alert,
} from "@heroui/react";
import { RefreshCw, Users, Trash2, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { FormBuilder } from "@/components/ui/FormBuilder";

interface Grantee {
  id: number;
  address: string;
  name?: string;
}

interface GranteesTabProps {
  // Grantee data
  grantees: Grantee[];
  isLoadingGrantees: boolean;
  isAddingGrantee: boolean;
  isRemoving: boolean;
  addGranteeError: string;

  // Input state
  queryMode: "subgraph" | "rpc" | "auto";
  granteeAddress: string;
  granteeName: string;

  // Callbacks
  onGranteeAddressChange: (address: string) => void;
  onGranteeNameChange: (name: string) => void;
  onQueryModeChange: (mode: "subgraph" | "rpc" | "auto") => void;
  onAddGrantee: () => void;
  onRefreshGrantees: () => void;
  onRemoveGrantee: (granteeId: number) => void;
}

export function GranteesTab({
  grantees,
  isLoadingGrantees,
  isAddingGrantee,
  isRemoving,
  addGranteeError,
  queryMode,
  granteeAddress,
  granteeName,
  onGranteeAddressChange,
  onGranteeNameChange,
  onQueryModeChange,
  onAddGrantee,
  onRefreshGrantees,
  onRemoveGrantee,
}: GranteesTabProps) {
  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Alert
        variant="bordered"
        color="primary"
        title="Application Section"
        description="This is a section only for applications to define grantee"
        startContent={<Users className="h-5 w-5" />}
      />

      {/* Add Grantee */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Add New Grantee</h3>
          </div>
        </CardHeader>
        <CardBody>
          <FormBuilder
            title=""
            singleColumn={true}
            fields={[
              {
                name: "granteeAddress",
                label: "Grantee Address",
                type: "text",
                value: granteeAddress,
                onChange: onGranteeAddressChange,
                placeholder: "0x...",
                description: "The Ethereum address of the grantee",
                required: true,
              },
              {
                name: "granteeName",
                label: "Grantee Name (Optional)",
                type: "text",
                value: granteeName,
                onChange: onGranteeNameChange,
                placeholder: "Grantee display name",
                description: "Optional display name for the grantee",
                required: false,
              },
            ]}
            onSubmit={onAddGrantee}
            isSubmitting={isAddingGrantee}
            submitText="Add Grantee"
            submitIcon={<Plus className="h-4 w-4" />}
            status={addGranteeError}
          />
        </CardBody>
      </Card>

      {/* Grantees List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">All Grantees</h3>
                <p className="text-sm text-default-500">
                  {grantees.length} grantee{grantees.length !== 1 ? "s" : ""}{" "}
                  registered
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
                onPress={onRefreshGrantees}
                variant="bordered"
                size="sm"
                startContent={
                  isLoadingGrantees ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )
                }
                isDisabled={isLoadingGrantees}
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {grantees.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="No grantees found"
              description="Add a grantee above to see it listed here"
            />
          ) : (
            <Table aria-label="Grantees table" removeWrapper>
              <TableHeader>
                <TableColumn>Grantee ID</TableColumn>
                <TableColumn>Address</TableColumn>
                <TableColumn>Name</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {grantees.map((grantee) => (
                  <TableRow key={grantee.id}>
                    <TableCell>
                      <span className="font-mono text-sm">{grantee.id}</span>
                    </TableCell>
                    <TableCell>
                      <AddressDisplay
                        address={grantee.address}
                        truncate={true}
                        showCopy={true}
                        showExternalLink={true}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{grantee.name || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Button
                        color="danger"
                        variant="flat"
                        size="sm"
                        onPress={() => onRemoveGrantee(grantee.id)}
                        isLoading={isRemoving}
                        isDisabled={isRemoving}
                        startContent={<Trash2 className="h-3 w-3" />}
                      >
                        Remove
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
