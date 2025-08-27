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
  Alert,
} from "@heroui/react";
import { RefreshCw, Users, Trash2, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { CopyButton } from "@/components/ui/CopyButton";
import { FormBuilder } from "@/components/ui/FormBuilder";
import type { Grantee } from "@opendatalabs/vana-sdk/browser";

interface GranteesTabProps {
  // Grantee data
  grantees: Grantee[];
  isLoadingGrantees: boolean;
  isAddingGrantee: boolean;
  isRemoving: boolean;
  addGranteeError: string;

  // Input state
  ownerAddress: string;
  granteeAddress: string;
  granteePublicKey: string;

  // Callbacks
  onOwnerAddressChange: (address: string) => void;
  onGranteeAddressChange: (address: string) => void;
  onGranteePublicKeyChange: (publicKey: string) => void;
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
  ownerAddress,
  granteeAddress,
  granteePublicKey,
  onOwnerAddressChange,
  onGranteeAddressChange,
  onGranteePublicKeyChange,
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
                name: "ownerAddress",
                label: "Owner Address",
                type: "text",
                value: ownerAddress,
                onChange: onOwnerAddressChange,
                placeholder: "0x...",
                description: "The owner address for the grantee",
                required: true,
              },
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
                name: "granteePublicKey",
                label: "Public Key",
                type: "text",
                value: granteePublicKey,
                onChange: onGranteePublicKeyChange,
                placeholder: "0x...",
                description: "The public key for the grantee",
                required: true,
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
                <TableColumn>Owner</TableColumn>
                <TableColumn>Address</TableColumn>
                <TableColumn>Public Key</TableColumn>
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
                        address={grantee.owner}
                        truncate={true}
                        showCopy={true}
                        showExternalLink={true}
                      />
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
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-sm cursor-default"
                          title={grantee.publicKey}
                        >
                          {grantee.publicKey
                            ? `${grantee.publicKey.slice(0, 8)}...${grantee.publicKey.slice(-6)}`
                            : "—"}
                        </span>
                        {grantee.publicKey && (
                          <CopyButton
                            value={grantee.publicKey}
                            isInline
                            size="sm"
                            variant="flat"
                            tooltip="Copy public key"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        color="danger"
                        variant="flat"
                        size="sm"
                        onPress={() => {
                          onRemoveGrantee(grantee.id);
                        }}
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
