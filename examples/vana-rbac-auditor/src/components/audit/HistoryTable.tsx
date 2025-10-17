/**
 * History Table Component
 * Displays chronological event log of role grants and revokes
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
  Chip,
  type SortDescriptor,
} from "@heroui/react";
import { Search, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useMemo } from "react";
import type { HistoryEntry } from "../../lib/types";
import { AddressDisplay } from "../ui/AddressDisplay";
import { EmptyState } from "../ui/EmptyState";
import { BlockDisplay } from "../ui/BlockDisplay";
import { TimestampDisplay } from "../ui/TimestampDisplay";
import { TransactionDisplay } from "../ui/TransactionDisplay";
import { RoleBadge } from "../ui/RoleBadge";
import { Shield } from "lucide-react";

interface HistoryTableProps {
  data: HistoryEntry[];
  network: "mainnet" | "moksha";
  isLoading?: boolean;
}

const ITEMS_PER_PAGE = 50;

const columns = [
  { key: "timestamp", label: "Time", sortable: true },
  { key: "action", label: "Action", sortable: true },
  { key: "role", label: "Role", sortable: false },
  { key: "target", label: "Target", sortable: false },
  { key: "sender", label: "Sender", sortable: false },
  { key: "tx", label: "Tx", sortable: false },
];

/**
 * HistoryTable shows event log
 */
export function HistoryTable({
  data,
  network,
  isLoading = false,
}: HistoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | "all">(50);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "timestamp",
    direction: "descending", // Newest first
  });

  // Filter data
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;

    const search = searchTerm.toLowerCase();
    return data.filter(
      (entry) =>
        entry.targetAddress.toLowerCase().includes(search) ||
        entry.targetLabel?.toLowerCase().includes(search) ||
        entry.senderAddress.toLowerCase().includes(search) ||
        entry.senderLabel?.toLowerCase().includes(search) ||
        entry.role.toLowerCase().includes(search) ||
        entry.txHash.toLowerCase().includes(search) ||
        entry.contract.toLowerCase().includes(search),
    );
  }, [data, searchTerm]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortDescriptor.column) return filteredData;

    return [...filteredData].sort((a, b) => {
      let comparison = 0;

      switch (sortDescriptor.column) {
        case "block":
          comparison = a.block - b.block;
          break;
        case "timestamp":
          comparison = a.timestamp - b.timestamp;
          break;
        case "action":
          comparison = a.action.localeCompare(b.action);
          break;
        default:
          comparison = 0;
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

  const totalPages = itemsPerPage === "all" ? 1 : Math.ceil(sortedData.length / itemsPerPage);

  // Reset page when search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <span className="text-default-500">Loading history...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        Icon={Shield}
        title="No History Found"
        description="No role events discovered during audit"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <Input
        placeholder="Search by address, role, tx hash, or contract..."
        value={searchTerm}
        onValueChange={setSearchTerm}
        startContent={<Search className="h-4 w-4 text-default-500" />}
        classNames={{
          base: "max-w-md",
          inputWrapper: "bg-content2/20 border-divider/50",
        }}
        aria-label="Search event history by address, role, transaction hash, or contract"
        autoFocus
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <Table
          aria-label="Role event history"
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
          classNames={{
            wrapper: "border border-divider/50 shadow-lg",
            th: "bg-content2/50 text-foreground font-semibold",
            td: "py-3",
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
                : "No events to display"
            }
          >
            {(item) => (
              <TableRow key={`${item.block}-${item.logIndex}`}>
                <TableCell>
                  <TimestampDisplay timestamp={item.timestamp} />
                </TableCell>
                <TableCell>
                  {item.action === "granted" ? (
                    <Chip
                      size="sm"
                      color="success"
                      variant="flat"
                      startContent={<ArrowUp className="h-3 w-3" />}
                    >
                      Granted
                    </Chip>
                  ) : (
                    <Chip
                      size="sm"
                      color="danger"
                      variant="flat"
                      startContent={<ArrowDown className="h-3 w-3" />}
                    >
                      Revoked
                    </Chip>
                  )}
                </TableCell>
                <TableCell>
                  <RoleBadge
                    role={item.role}
                    roleHash={item.roleHash}
                    size="sm"
                  />
                </TableCell>
                <TableCell>
                  <AddressDisplay
                    address={item.targetAddress}
                    label={item.targetLabel}
                    network={network}
                    showExplorer={false}
                    compact
                  />
                </TableCell>
                <TableCell>
                  <AddressDisplay
                    address={item.senderAddress}
                    label={item.senderLabel}
                    network={network}
                    showExplorer={false}
                    compact
                  />
                </TableCell>
                <TableCell>
                  <TransactionDisplay
                    txHash={item.txHash}
                    network={network}
                    compact
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
          Showing {paginatedData.length} of {sortedData.length} events
          {sortedData.length !== data.length && ` (${data.length} total)`}
        </p>
      </div>
    </div>
  );
}
