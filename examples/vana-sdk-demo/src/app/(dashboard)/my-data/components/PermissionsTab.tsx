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
  SortDescriptor,
  Tooltip,
} from "@heroui/react";
import { Search, ExternalLink, RefreshCw, Shield, Eye } from "lucide-react";
import type { GrantedPermission } from "@opendatalabs/vana-sdk/browser";
import { convertIpfsUrl } from "@opendatalabs/vana-sdk/browser";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDisplay } from "@/components/ui/StatusDisplay";
import { CopyButton } from "@/components/ui/CopyButton";
import { FileIdDisplay } from "@/components/ui/FileIdDisplay";
import { PermissionDisplay } from "@/components/ui/PermissionDisplay";

interface PermissionsTabProps {
  // Permission data
  userPermissions: GrantedPermission[];
  isLoadingPermissions: boolean;
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

  // Renders permission parameters with tooltip
  const renderParameters = (parameters: unknown) => {
    if (parameters === null) return "None";

    const paramStr =
      typeof parameters === "string"
        ? parameters
        : JSON.stringify(parameters, null, 2);

    return (
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
        >
          View Details
        </Button>
      </Tooltip>
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
              onChange={(e) => onPermissionLookupIdChange(e.target.value)}
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
                  <TableColumn key="operation" allowsSorting>
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
                        <Chip variant="flat" color="primary" size="sm">
                          {permission.operation}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-small font-medium">
                            {permission.files.length} file
                            {permission.files.length !== 1 ? "s" : ""}
                          </span>
                          {permission.files.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-w-48">
                              {permission.files.slice(0, 3).map((fileId) => (
                                <FileIdDisplay
                                  key={fileId}
                                  fileId={fileId}
                                  chainId={chainId}
                                  showCopy={false}
                                  showExternalLink={true}
                                  className="text-tiny"
                                />
                              ))}
                              {permission.files.length > 3 && (
                                <span className="text-tiny text-default-400">
                                  +{permission.files.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {renderParameters(permission.parameters)}
                          <Tooltip content="View grant file on IPFS">
                            <Button
                              as="a"
                              href={convertIpfsUrl(permission.grant)}
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
                      </TableCell>
                      <TableCell>
                        <Button
                          color="danger"
                          variant="flat"
                          size="sm"
                          onPress={() =>
                            onRevokePermission(permission.id.toString())
                          }
                          isLoading={isRevoking}
                          isDisabled={isRevoking}
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
