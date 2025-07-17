import React, { useMemo, useState } from "react";
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
  Pagination,
  SortDescriptor,
} from "@heroui/react";
import {
  GrantedPermission,
  convertIpfsUrl,
} from "@opendatalabs/vana-sdk/browser";
import { Shield, ExternalLink, Eye, RefreshCw } from "lucide-react";
import { PermissionDisplay } from "./ui/PermissionDisplay";
import { CopyButton } from "./ui/CopyButton";
import { FileIdDisplay } from "./ui/FileIdDisplay";
import { useChainId } from "wagmi";

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
  const chainId = useChainId();

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "id",
    direction: "descending",
  });
  const ITEMS_PER_PAGE = 10;

  // Calculate sorted and paginated items
  const paginatedPermissions = useMemo(() => {
    const sortedPermissions = [...userPermissions];

    // Sort permissions based on sortDescriptor
    if (sortDescriptor.column) {
      sortedPermissions.sort((a, b) => {
        const aValue = a[sortDescriptor.column as keyof typeof a];
        const bValue = b[sortDescriptor.column as keyof typeof b];

        let comparison = 0;
        if (typeof aValue === "number" && typeof bValue === "number") {
          comparison = aValue - bValue;
        } else if (typeof aValue === "bigint" && typeof bValue === "bigint") {
          comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return sortDescriptor.direction === "descending"
          ? -comparison
          : comparison;
      });
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedPermissions.slice(startIndex, endIndex);
  }, [userPermissions, currentPage, ITEMS_PER_PAGE, sortDescriptor]);

  const totalPages = Math.ceil(userPermissions.length / ITEMS_PER_PAGE);

  // Reset to first page when userPermissions changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [userPermissions.length]);
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
    { key: "id", label: "Permission ID", allowsSorting: true },
    { key: "operation", label: "Operation", allowsSorting: true },
    { key: "files", label: "Files", allowsSorting: false },
    { key: "parameters", label: "Parameters", allowsSorting: false },
    { key: "actions", label: "Actions", allowsSorting: false },
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
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h4 className="text-lg font-semibold">Permissions Management</h4>
            <p className="text-small text-default-500">
              {userPermissions.length} permission
              {userPermissions.length !== 1 ? "s" : ""} granted
            </p>
          </div>
        </div>
        <Button
          onPress={onRefresh}
          variant="bordered"
          size="sm"
          startContent={
            isLoading ? (
              <Spinner size="sm" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )
          }
          isDisabled={isLoading}
        >
          Refresh
        </Button>
      </div>

      <Table
        aria-label="Permissions table"
        removeWrapper
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        classNames={{
          th: "bg-default-100 text-default-700",
          td: "py-4",
        }}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn
              key={column.key}
              className="text-left"
              allowsSorting={column.allowsSorting}
            >
              {column.label}
            </TableColumn>
          )}
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
                  onPress={() => handleRevoke(permission)}
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

      {/* Pagination */}
      {userPermissions.length > ITEMS_PER_PAGE && (
        <div className="flex justify-center mt-4">
          <Pagination
            total={totalPages}
            page={currentPage}
            onChange={setCurrentPage}
            showControls={true}
            size="sm"
          />
        </div>
      )}

      {/* Status info */}
      {userPermissions.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-600">
          Showing {paginatedPermissions.length} of {userPermissions.length}{" "}
          permissions
          {userPermissions.length > ITEMS_PER_PAGE && (
            <span className="ml-2">
              • Page {currentPage} of {totalPages}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
