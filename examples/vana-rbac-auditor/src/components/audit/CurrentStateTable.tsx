/**
 * Current State Table Component
 * Displays active role assignments with sorting, search, and pagination
 */
"use client";

import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Input,
  Pagination,
  Spinner,
  Chip,
  Tooltip,
  type SortDescriptor,
} from "@heroui/react";
import {
  Search,
  AlertTriangle,
  Shield,
  Users,
  Bot,
  UserX,
  Clock,
  HelpCircle,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { CurrentStateEntry } from "../../lib/types";
import { AddressDisplay } from "../ui/AddressDisplay";
import { RoleBadge } from "../ui/RoleBadge";
import { ContractDisplay } from "../ui/ContractDisplay";
import { EmptyState } from "../ui/EmptyState";
import {
  isKnownAddress,
  isCoreTeamAddress,
  isServiceAccount,
  isDeactivatedAddress,
  isDeprecatedAddress,
} from "../../config/addresses";
import { isKnownContract } from "../../config/contracts";

interface CurrentStateTableProps {
  data: CurrentStateEntry[];
  network: "mainnet" | "moksha";
  isLoading?: boolean;
}

const ITEMS_PER_PAGE = 50;

/**
 * Filter categories for slicing data
 */
type FilterType =
  | "anomalies"
  | "unknown"
  | "core-team"
  | "service-accounts"
  | "deactivated"
  | "deprecated"
  | "admin-roles";

/**
 * Check if role is an admin role (high privilege)
 */
function isAdminRole(roleName: string): boolean {
  const adminKeywords = ["ADMIN", "OWNER", "PAUSER"];
  return adminKeywords.some((keyword) =>
    roleName.toUpperCase().includes(keyword),
  );
}

const columns = [
  { key: "anomaly", label: "", sortable: true }, // Icon-only column
  { key: "address", label: "Address", sortable: true },
  { key: "role", label: "Role", sortable: true },
  { key: "contract", label: "Contract", sortable: true },
];

/**
 * CurrentStateTable shows active permissions
 */
export function CurrentStateTable({
  data,
  network,
  isLoading = false,
}: CurrentStateTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | "all">(50);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "address",
    direction: "ascending",
  });
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(
    new Set(),
  );

  // Toggle filter on/off
  const toggleFilter = (filter: FilterType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  // Check if entry matches a filter
  const matchesFilter = (
    entry: CurrentStateEntry,
    filter: FilterType,
  ): boolean => {
    switch (filter) {
      case "anomalies":
        return entry.isAnomaly;
      case "unknown":
        // Not unknown if it's a known address OR a known contract
        return (
          !isKnownAddress(entry.address) &&
          !isKnownContract(entry.address, network)
        );
      case "core-team":
        return isCoreTeamAddress(entry.address);
      case "service-accounts":
        return isServiceAccount(entry.address);
      case "deactivated":
        return isDeactivatedAddress(entry.address);
      case "deprecated":
        return isDeprecatedAddress(entry.address);
      case "admin-roles":
        return isAdminRole(entry.role);
      default:
        return true;
    }
  };

  // Filter data
  const filteredData = useMemo(() => {
    let filtered = data;

    // Apply active filters (AND logic - must match ALL active filters)
    if (activeFilters.size > 0) {
      filtered = filtered.filter((entry) =>
        Array.from(activeFilters).every((filter) =>
          matchesFilter(entry, filter),
        ),
      );
    }

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (entry) =>
          entry.address.toLowerCase().includes(search) ||
          entry.label?.toLowerCase().includes(search) ||
          entry.role.toLowerCase().includes(search) ||
          entry.contract.toLowerCase().includes(search),
      );
    }

    return filtered;
  }, [data, searchTerm, activeFilters]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortDescriptor.column) return filteredData;

    return [...filteredData].sort((a, b) => {
      let comparison = 0;

      // Special handling for anomaly column
      if (sortDescriptor.column === "anomaly") {
        comparison = (a.isAnomaly ? 1 : 0) - (b.isAnomaly ? 1 : 0);
      } else {
        const aValue = a[sortDescriptor.column as keyof CurrentStateEntry];
        const bValue = b[sortDescriptor.column as keyof CurrentStateEntry];

        if (typeof aValue === "string" && typeof bValue === "string") {
          comparison = aValue.localeCompare(bValue);
        }
      }

      return sortDescriptor.direction === "descending"
        ? -comparison
        : comparison;
    });
  }, [filteredData, sortDescriptor]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (itemsPerPage === "all") {
      return sortedData;
    }
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const totalPages =
    itemsPerPage === "all" ? 1 : Math.ceil(sortedData.length / itemsPerPage);

  // Compute filter counts
  const filterCounts = useMemo(() => {
    return {
      anomalies: data.filter((e) => e.isAnomaly).length,
      unknown: data.filter(
        (e) =>
          !isKnownAddress(e.address) && !isKnownContract(e.address, network),
      ).length,
      coreTeam: data.filter((e) => isCoreTeamAddress(e.address)).length,
      serviceAccounts: data.filter((e) => isServiceAccount(e.address)).length,
      deactivated: data.filter((e) => isDeactivatedAddress(e.address)).length,
      deprecated: data.filter((e) => isDeprecatedAddress(e.address)).length,
      adminRoles: data.filter((e) => isAdminRole(e.role)).length,
    };
  }, [data, network]);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilters]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Spinner size="lg" />
        <span className="ml-3 text-default-500">Loading permissions...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        Icon={Shield}
        title="No Permissions Found"
        description="No active role assignments discovered during audit"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Chips - Single Row */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <Input
          placeholder="Search by address, role, or contract..."
          value={searchTerm}
          onValueChange={setSearchTerm}
          startContent={<Search className="h-4 w-4 text-default-500" />}
          classNames={{
            base: "max-w-md flex-shrink-0",
            inputWrapper: "bg-content2/20 border-divider/50",
          }}
          aria-label="Search current permissions by address, role, or contract"
          autoFocus
        />

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {/* Security Filters */}
          {filterCounts.anomalies > 0 && (
            <Chip
              size="sm"
              variant={activeFilters.has("anomalies") ? "solid" : "flat"}
              color={activeFilters.has("anomalies") ? "warning" : "default"}
              startContent={<AlertTriangle className="h-3 w-3" />}
              onClick={() => toggleFilter("anomalies")}
              className="cursor-pointer"
            >
              Anomalies ({filterCounts.anomalies})
            </Chip>
          )}
          {filterCounts.unknown > 0 && (
            <Chip
              size="sm"
              startContent={<HelpCircle className="h-3 w-3" />}
              variant={activeFilters.has("unknown") ? "solid" : "flat"}
              color={activeFilters.has("unknown") ? "danger" : "default"}
              onClick={() => toggleFilter("unknown")}
              className="cursor-pointer"
            >
              Unknown ({filterCounts.unknown})
            </Chip>
          )}
          {filterCounts.deactivated > 0 && (
            <Chip
              size="sm"
              variant={activeFilters.has("deactivated") ? "solid" : "flat"}
              color={activeFilters.has("deactivated") ? "danger" : "default"}
              startContent={<UserX className="h-3 w-3" />}
              onClick={() => toggleFilter("deactivated")}
              className="cursor-pointer"
            >
              Deactivated ({filterCounts.deactivated})
            </Chip>
          )}
          {filterCounts.deprecated > 0 && (
            <Chip
              size="sm"
              variant={activeFilters.has("deprecated") ? "solid" : "flat"}
              color={activeFilters.has("deprecated") ? "warning" : "default"}
              startContent={<Clock className="h-3 w-3" />}
              onClick={() => toggleFilter("deprecated")}
              className="cursor-pointer"
            >
              Deprecated ({filterCounts.deprecated})
            </Chip>
          )}

          {/* Identity Filters */}
          {filterCounts.coreTeam > 0 && (
            <Chip
              size="sm"
              variant={activeFilters.has("core-team") ? "solid" : "flat"}
              color={activeFilters.has("core-team") ? "primary" : "default"}
              startContent={<Users className="h-3 w-3" />}
              onClick={() => toggleFilter("core-team")}
              className="cursor-pointer"
            >
              Core Team ({filterCounts.coreTeam})
            </Chip>
          )}
          {filterCounts.serviceAccounts > 0 && (
            <Chip
              size="sm"
              variant={activeFilters.has("service-accounts") ? "solid" : "flat"}
              color={
                activeFilters.has("service-accounts") ? "secondary" : "default"
              }
              startContent={<Bot className="h-3 w-3" />}
              onClick={() => toggleFilter("service-accounts")}
              className="cursor-pointer"
            >
              Services ({filterCounts.serviceAccounts})
            </Chip>
          )}

          {/* Permission Filters */}
          {filterCounts.adminRoles > 0 && (
            <Chip
              size="sm"
              variant={activeFilters.has("admin-roles") ? "solid" : "flat"}
              color={activeFilters.has("admin-roles") ? "success" : "default"}
              startContent={<Shield className="h-3 w-3" />}
              onClick={() => toggleFilter("admin-roles")}
              className="cursor-pointer"
            >
              Admin ({filterCounts.adminRoles})
            </Chip>
          )}
        </div>
      </div>

      {/* Table */}
      <Table
        aria-label="Current state permissions"
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        classNames={{
          wrapper: "border border-divider/50 shadow-lg",
          th: "bg-content2/50 text-foreground font-semibold",
          td: "py-4",
        }}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.key} allowsSorting={column.sortable}>
              {column.label}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={paginatedData}
          emptyContent={
            searchTerm
              ? `No results for "${searchTerm}"`
              : "No permissions to display"
          }
        >
          {(item) => (
            <TableRow
              key={`${item.address || "no-addr"}-${item.roleHash}-${item.contractAddress}`}
              className={
                item.isAnomaly ? "bg-warning/10 border-l-4 border-warning" : ""
              }
            >
              <TableCell className="w-12">
                {item.isAnomaly && (
                  <Tooltip
                    content={
                      item.anomalyDescription || "Security anomaly detected"
                    }
                  >
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </Tooltip>
                )}
              </TableCell>
              <TableCell>
                <AddressDisplay
                  address={item.address}
                  label={item.label}
                  network={network}
                />
              </TableCell>
              <TableCell>
                <RoleBadge role={item.role} roleHash={item.roleHash} />
              </TableCell>
              <TableCell>
                <ContractDisplay
                  name={item.contract}
                  address={item.contractAddress}
                  network={network}
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination Controls */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4 flex-wrap justify-center">
          {/* Page Size Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-default-500">Show:</span>
            {[25, 50, 100, "all"].map((size) => (
              <Chip
                key={size}
                size="sm"
                variant={itemsPerPage === size ? "solid" : "flat"}
                color={itemsPerPage === size ? "primary" : "default"}
                onClick={() => {
                  setItemsPerPage(size as number | "all");
                  setCurrentPage(1);
                }}
                className="cursor-pointer"
              >
                {size === "all" ? "All" : size}
              </Chip>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              total={totalPages}
              page={currentPage}
              onChange={setCurrentPage}
              showControls
              size="sm"
            />
          )}
        </div>

        {/* Results Summary */}
        <p className="text-sm text-default-500">
          Showing {paginatedData.length} of {sortedData.length} permissions
          {sortedData.length !== data.length && ` (${data.length} total)`}
        </p>
      </div>
    </div>
  );
}
