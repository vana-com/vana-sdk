// src/components/ui/ResourceList.tsx

"use client";

import React from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Progress,
  Spinner,
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
}: ResourceListProps<T>) {
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
          <div className="space-y-3">
            {items.map((item, index) => renderItem(item, index))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
