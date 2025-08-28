"use client";

import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Pagination,
  Tooltip,
  type SortDescriptor,
} from "@heroui/react";
import {
  Search,
  ExternalLink,
  RefreshCw,
  Shield,
  Eye,
  FileText,
} from "lucide-react";
import {
  convertIpfsUrl,
  type OnChainPermissionGrant,
  type GrantedPermission,
} from "@opendatalabs/vana-sdk/browser";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDisplay } from "@/components/ui/StatusDisplay";
import { CopyButton } from "@/components/ui/CopyButton";
import { FileIdDisplay } from "@/components/ui/FileIdDisplay";
import { PermissionDisplay } from "@/components/ui/PermissionDisplay";

interface PermissionsTabProps {
  // Fast on-chain permission data - loads instantly
  userPermissions: OnChainPermissionGrant[];
  isLoadingPermissions: boolean;

  // Slow off-chain resolution data - loads on-demand
  resolvedPermissions: Map<string, GrantedPermission>;
  resolvingPermissions: Set<string>;

  // Actions
  onResolvePermissionDetails: (permissionId: string) => Promise<void>;
  isRevoking: boolean;

  // Permission lookup
  permissionLookupId: string;
  isLookingUpPermission: boolean;
  permissionLookupStatus: string;
  lookedUpPermission: GrantedPermission | null;

  // Pagination
  permissionsCurrentPage: number;
  permissionsSortDescriptor: SortDescriptor;
  permissionsTotalPages: number;
  PERMISSIONS_PER_PAGE: number;

  // Chain info
  chainId: number;

  // Callbacks
  onRefreshPermissions: () => void;
  onPermissionLookupIdChange: (id: string) => void;
  onLookupPermission: () => void;
  onRevokePermission: (permissionId: string) => void;
  setPermissionsCurrentPage: (page: number) => void;
  setPermissionsSortDescriptor: (descriptor: SortDescriptor) => void;
}

export function PermissionsTab({
  userPermissions,
  isLoadingPermissions,
  resolvedPermissions,
  resolvingPermissions,
  onResolvePermissionDetails,
  isRevoking,
  permissionLookupId,
  isLookingUpPermission,
  permissionLookupStatus,
  lookedUpPermission,
  permissionsCurrentPage,
  permissionsSortDescriptor,
  permissionsTotalPages,
  PERMISSIONS_PER_PAGE,
  chainId,
  onRefreshPermissions,
  onPermissionLookupIdChange,
  onLookupPermission,
  onRevokePermission,
  setPermissionsCurrentPage,
  setPermissionsSortDescriptor,
}: PermissionsTabProps) {
  // Calculate paginated permissions
  const sortedPermissions = [...userPermissions];

  if (permissionsSortDescriptor.column) {
    sortedPermissions.sort((a, b) => {
      const aValue = a[permissionsSortDescriptor.column as keyof typeof a];
      const bValue = b[permissionsSortDescriptor.column as keyof typeof b];

      let comparison = 0;
      if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else if (typeof aValue === "bigint" && typeof bValue === "bigint") {
        comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return permissionsSortDescriptor.direction === "descending"
        ? -comparison
        : comparison;
    });
  }

  const startIndex = (permissionsCurrentPage - 1) * PERMISSIONS_PER_PAGE;
  const endIndex = startIndex + PERMISSIONS_PER_PAGE;
  const paginatedPermissions = sortedPermissions.slice(startIndex, endIndex);

  // Helper functions for resolution state
  const isResolved = (permissionId: string) =>
    resolvedPermissions.has(permissionId);
  const isResolving = (permissionId: string) =>
    resolvingPermissions.has(permissionId);
  const getResolved = (permissionId: string) =>
    resolvedPermissions.get(permissionId);

  // Progressive disclosure render functions
  const renderParameters = (permission: OnChainPermissionGrant) => {
    const permissionId = permission.id.toString();
    const resolved = getResolved(permissionId);

    if (!isResolved(permissionId)) {
      return (
        <Button
          size="sm"
          variant="bordered"
          onPress={() => onResolvePermissionDetails(permissionId)}
          isLoading={isResolving(permissionId)}
          startContent={
            !isResolving(permissionId) ? <Eye className="h-3 w-3" /> : undefined
          }
          className="text-xs"
        >
          {isResolving(permissionId) ? "Loading..." : "Load Details"}
        </Button>
      );
    }

    if (!resolved)
      return <span className="text-danger text-sm">Error loading</span>;

    const paramStr = JSON.stringify(resolved.parameters, null, 2);

    return (
      <div className="flex gap-2">
        <Tooltip
          content={
            <pre className="text-xs max-w-sm max-h-40 overflow-auto">
              {paramStr}
            </pre>
          }
          placement="left"
        >
          <Button
            size="sm"
            variant="flat"
            startContent={<Eye className="h-3 w-3" />}
            className="text-xs"
          >
            View Details
          </Button>
        </Tooltip>
        <Tooltip content="View grant file on IPFS">
          <Button
            as="a"
            href={convertIpfsUrl(permission.grantUrl)}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            variant="flat"
            isIconOnly
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Tooltip>
      </div>
    );
  };

  const renderOperation = (permission: OnChainPermissionGrant) => {
    const permissionId = permission.id.toString();
    const resolved = getResolved(permissionId);

    if (!isResolved(permissionId)) {
      return (
        <Button
          size="sm"
          variant="bordered"
          onPress={() => onResolvePermissionDetails(permissionId)}
          isLoading={isResolving(permissionId)}
          startContent={
            !isResolving(permissionId) ? (
              <FileText className="h-3 w-3" />
            ) : undefined
          }
          className="text-xs"
        >
          {isResolving(permissionId) ? "Loading..." : "Load Operation"}
        </Button>
      );
    }

    if (!resolved) {
      return (
        <Chip variant="flat" color="danger" size="sm">
          Error
        </Chip>
      );
    }

    return (
      <Chip variant="flat" color="primary" size="sm">
        {resolved.operation}
      </Chip>
    );
  };

  const renderFiles = (permission: OnChainPermissionGrant) => {
    const permissionId = permission.id.toString();
    const resolved = getResolved(permissionId);

    if (!isResolved(permissionId)) {
      return (
        <Button
          size="sm"
          variant="bordered"
          onPress={() => onResolvePermissionDetails(permissionId)}
          isLoading={isResolving(permissionId)}
          startContent={
            !isResolving(permissionId) ? (
              <FileText className="h-3 w-3" />
            ) : undefined
          }
          className="text-xs"
        >
          {isResolving(permissionId) ? "Loading..." : "Load Files"}
        </Button>
      );
    }

    if (!resolved) {
      return <span className="text-danger text-sm">Error loading</span>;
    }

    return (
      <div className="flex flex-col gap-1">
        <span className="text-small font-medium">
          {resolved.files.length} file{resolved.files.length !== 1 ? "s" : ""}
        </span>
        {resolved.files.length > 0 && (
          <div className="flex flex-wrap gap-1 max-w-48">
            {resolved.files.slice(0, 3).map((fileId: number) => (
              <FileIdDisplay
                key={fileId}
                fileId={fileId}
                chainId={chainId}
                showCopy={false}
                showExternalLink={true}
                className="text-tiny"
              />
            ))}
            {resolved.files.length > 3 && (
              <span className="text-tiny text-default-400">
                +{resolved.files.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Permission Lookup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Permission Lookup</h3>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Enter permission ID"
              type="text"
              value={permissionLookupId}
              onChange={(e) => {
                onPermissionLookupIdChange(e.target.value);
              }}
              className="max-w-xs"
              size="sm"
              description="Search for a specific permission by its numeric ID"
            />
            <ActionButton
              onPress={onLookupPermission}
              disabled={!permissionLookupId.trim()}
              loading={isLookingUpPermission}
              icon={<Search className="h-4 w-4" />}
              loadingIconOnly={true}
              size="sm"
            >
              Search
            </ActionButton>
          </div>
          {permissionLookupStatus && (
            <StatusDisplay status={permissionLookupStatus} className="mt-4" />
          )}
          {lookedUpPermission && (
            <div className="mt-4 p-3 bg-success/10 rounded-lg">
              <p className="text-sm font-medium text-success mb-2">
                Permission Found:
              </p>
              <div className="space-y-1 text-xs">
                <div>
                  <strong>ID:</strong> {lookedUpPermission.id.toString()}
                </div>
                <div>
                  <strong>Operation:</strong> {lookedUpPermission.operation}
                </div>
                <div>
                  <strong>Files:</strong> {lookedUpPermission.files.length} file
                  {lookedUpPermission.files.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Permissions Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">
                  Permissions Management
                </h3>
                <p className="text-sm text-default-500">
                  {userPermissions.length} permission
                  {userPermissions.length !== 1 ? "s" : ""} granted
                </p>
              </div>
            </div>
            <Button
              onPress={onRefreshPermissions}
              variant="bordered"
              size="sm"
              startContent={
                isLoadingPermissions ? (
                  <Spinner size="sm" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              isDisabled={isLoadingPermissions}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {isLoadingPermissions ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading permissions...</span>
            </div>
          ) : userPermissions.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title="No permissions granted yet"
              description="Grant permissions to data processors to see them here"
            />
          ) : (
            <div className="space-y-4">
              <Table
                aria-label="Permissions table"
                removeWrapper
                sortDescriptor={permissionsSortDescriptor}
                onSortChange={setPermissionsSortDescriptor}
                classNames={{
                  th: "bg-default-100 text-default-700",
                  td: "py-4",
                }}
              >
                <TableHeader>
                  <TableColumn key="id" allowsSorting>
                    Permission ID
                  </TableColumn>
                  <TableColumn key="grantor" allowsSorting>
                    Grantor
                  </TableColumn>
                  <TableColumn key="active" allowsSorting>
                    Status
                  </TableColumn>
                  <TableColumn key="operation" allowsSorting={false}>
                    Operation
                  </TableColumn>
                  <TableColumn key="files" allowsSorting={false}>
                    Files
                  </TableColumn>
                  <TableColumn key="parameters" allowsSorting={false}>
                    Parameters
                  </TableColumn>
                  <TableColumn key="actions" allowsSorting={false}>
                    Actions
                  </TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedPermissions.map((permission) => (
                    <TableRow key={permission.id.toString()}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PermissionDisplay
                            permissionId={permission.id}
                            className="inline-flex"
                          />
                          <CopyButton
                            value={permission.id.toString()}
                            tooltip="Copy permission ID"
                            isInline
                            size="sm"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-default-100 px-2 py-1 rounded">
                            {permission.grantor.slice(0, 6)}...
                            {permission.grantor.slice(-4)}
                          </code>
                          <CopyButton
                            value={permission.grantor}
                            tooltip="Copy grantor address"
                            isInline
                            size="sm"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip
                          variant="flat"
                          color={permission.active ? "success" : "danger"}
                          size="sm"
                        >
                          {permission.active ? "Active" : "Inactive"}
                        </Chip>
                      </TableCell>
                      <TableCell>{renderOperation(permission)}</TableCell>
                      <TableCell>{renderFiles(permission)}</TableCell>
                      <TableCell>{renderParameters(permission)}</TableCell>
                      <TableCell>
                        <Button
                          color="danger"
                          variant="flat"
                          size="sm"
                          onPress={() => {
                            onRevokePermission(permission.id.toString());
                          }}
                          isLoading={isRevoking}
                          isDisabled={isRevoking || !permission.active}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Permissions Pagination */}
              {userPermissions.length > PERMISSIONS_PER_PAGE && (
                <div className="flex justify-center mt-4">
                  <Pagination
                    total={permissionsTotalPages}
                    page={permissionsCurrentPage}
                    onChange={setPermissionsCurrentPage}
                    showControls={true}
                    size="sm"
                  />
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
