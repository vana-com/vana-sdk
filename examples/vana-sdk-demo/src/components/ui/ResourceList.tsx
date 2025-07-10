// src/components/ui/ResourceList.tsx

"use client";

import React, { useState, useMemo } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Progress,
  Spinner,
  Pagination,
} from "@heroui/react";
import { RotateCcw } from "lucide-react";

interface ResourceListProps<T> {
  title: string;
  description: string;
  items: T[];
  isLoading: boolean;
  onRefresh: () => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyState: React.ReactNode;
  className?: string;
  itemsPerPage?: number;
}

export function ResourceList<T>({
  title,
  description,
  items,
  isLoading,
  onRefresh,
  renderItem,
  emptyState,
  className = "",
  itemsPerPage = 3,
}: ResourceListProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return items.slice(startIndex, startIndex + itemsPerPage);
  }, [items, currentPage, itemsPerPage]);

  // Reset to first page when items change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [items.length]);

  const showPagination = !isLoading && items.length > itemsPerPage;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex-grow">
          <h4 className="font-medium text-base">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          onPress={onRefresh}
          disabled={isLoading}
          variant="bordered"
          size="sm"
        >
          {isLoading ? (
            <Spinner size="sm" className="mr-2" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </CardHeader>

      <CardBody>
        {isLoading ? (
          <div className="text-center py-8 space-y-4">
            <Progress
              size="md"
              isIndeterminate
              aria-label={`Loading ${title}...`}
              className="max-w-md mx-auto"
            />
            <p className="text-muted-foreground">Loading {title}...</p>
          </div>
        ) : items.length === 0 ? (
          emptyState
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {paginatedItems.map((item, index) =>
                renderItem(item, (currentPage - 1) * itemsPerPage + index),
              )}
            </div>

            {showPagination && (
              <div className="flex justify-center pt-4">
                <Pagination
                  total={totalPages}
                  page={currentPage}
                  onChange={setCurrentPage}
                  showControls
                  size="sm"
                />
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
