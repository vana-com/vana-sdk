import React from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Tooltip,
  Chip,
  Spinner,
} from "@heroui/react";
import { GrantedPermission, convertIpfsUrl } from "vana-sdk";
import { Shield, ExternalLink, Eye } from "lucide-react";
import { PermissionDisplay } from "./ui/PermissionDisplay";

interface PermissionsTableProps {
  /**
   * Array of user permissions to display
   */
  userPermissions: GrantedPermission[];
  /**
   * Whether permissions are currently loading
   */
  isLoading: boolean;
  /**
   * Callback to revoke a permission
   */
  onRevoke: (permissionId: string) => void;
  /**
   * Whether a revoke operation is in progress
   */
  isRevoking: boolean;
  /**
   * Callback to refresh permissions list
   */
  onRefresh: () => void;
}

/**
 * PermissionsTable component displays user permissions in a clean, scannable table format
 * replacing the previous card-based list approach for better usability
 */
export const PermissionsTable: React.FC<PermissionsTableProps> = ({
  userPermissions,
  isLoading,
  onRevoke,
  isRevoking,
  onRefresh,
}) => {
  const handleRevoke = (permission: GrantedPermission) => {
    onRevoke(permission.id.toString());
  };

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

  const columns = [
    { key: "permissionId", label: "Permission ID" },
    { key: "operation", label: "Operation" },
    { key: "files", label: "Files" },
    { key: "parameters", label: "Parameters" },
    { key: "actions", label: "Actions" },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Spinner size="lg" />
        <span className="ml-3">Loading permissions...</span>
      </div>
    );
  }

  if (userPermissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Shield className="h-12 w-12 text-default-300 mb-4" />
        <h3 className="text-lg font-semibold text-default-600 mb-2">
          No permissions granted yet
        </h3>
        <p className="text-default-400 mb-4">
          Grant permissions to data processors to see them here.
        </p>
        <Button onPress={onRefresh} variant="flat">
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-lg font-semibold">Permissions Management</h4>
          <p className="text-small text-default-500">
            {userPermissions.length} permission
            {userPermissions.length !== 1 ? "s" : ""} granted
          </p>
        </div>
        <Button
          onPress={onRefresh}
          variant="bordered"
          size="sm"
          startContent={isLoading ? <Spinner size="sm" /> : undefined}
          isDisabled={isLoading}
        >
          Refresh
        </Button>
      </div>

      <Table
        aria-label="Permissions table"
        removeWrapper
        classNames={{
          th: "bg-default-100 text-default-700",
          td: "py-4",
        }}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key} className="text-left">
              {column.label}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={userPermissions}>
          {(permission) => (
            <TableRow key={permission.id.toString()}>
              <TableCell>
                <PermissionDisplay
                  permissionId={permission.id}
                  className="inline-flex"
                />
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
                    <span className="text-tiny text-default-400">
                      IDs: {permission.files.join(", ")}
                    </span>
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
                      startContent={<ExternalLink className="h-3 w-3" />}
                    >
                      Grant File
                    </Button>
                  </Tooltip>
                </div>
              </TableCell>

              <TableCell>
                <Button
                  color="danger"
                  variant="flat"
                  size="sm"
                  onPress={() => handleRevoke(permission)}
                  isLoading={isRevoking}
                  isDisabled={isRevoking}
                >
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
