/**
 * Sortable Operation Row
 *
 * @remarks
 * Individual draggable row for operation queue using @dnd-kit
 */
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Chip, Button, Tooltip } from "@heroui/react";
import { GripVertical, Trash2, AlertCircle } from "lucide-react";
import type { BatchOperation } from "../../lib/batch/builder-types";

interface SortableOperationRowProps {
  operation: BatchOperation;
  index: number;
  onRemove: (id: string) => void;
  warnings: string[];
  hasWarning: boolean;
}

export function SortableOperationRow({
  operation,
  index,
  onRemove,
  warnings,
  hasWarning,
}: SortableOperationRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: operation.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[40px_50px_100px_1fr_1fr_1fr_80px] gap-3 px-3 py-3 border-b border-divider last:border-b-0 hover:bg-default-50"
    >
      <div className="flex items-center justify-center">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-default-400" />
        </div>
      </div>
      <div className="flex items-center justify-center">
        <span className="text-xs text-default-400 font-mono">{index + 1}</span>
      </div>
      <div className="flex items-center">
        <Chip
          size="sm"
          color={operation.type === "grant" ? "success" : "warning"}
          variant="flat"
          className="capitalize"
        >
          {operation.type}
        </Chip>
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-sm font-medium">{operation.contract.name}</span>
        <span className="text-xs text-default-400 font-mono">
          {operation.contract.address.slice(0, 8)}...
          {operation.contract.address.slice(-6)}
        </span>
      </div>
      <div className="flex flex-col justify-center">
        {operation.metadata?.roleLabel ? (
          <>
            <span className="text-sm font-medium">
              {operation.metadata.roleLabel}
            </span>
            <span className="text-xs text-default-400 font-mono">
              {operation.parameters.role.slice(0, 10)}...
            </span>
          </>
        ) : (
          <span className="text-sm font-mono">
            {operation.parameters.role.slice(0, 12)}...
          </span>
        )}
      </div>
      <div className="flex flex-col justify-center">
        {operation.metadata?.accountLabel ? (
          <>
            <span className="text-sm font-medium">
              {operation.metadata.accountLabel}
            </span>
            <span className="text-xs text-default-400 font-mono">
              {operation.parameters.account.slice(0, 8)}...
              {operation.parameters.account.slice(-6)}
            </span>
          </>
        ) : (
          <span className="text-sm font-mono">
            {operation.parameters.account.slice(0, 8)}...
            {operation.parameters.account.slice(-6)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {hasWarning && (
          <Tooltip
            content={
              <div className="max-w-xs">
                {warnings.map((msg, idx) => (
                  <div key={idx} className="text-xs py-1">
                    {msg}
                  </div>
                ))}
              </div>
            }
          >
            <AlertCircle className="h-4 w-4 text-warning" />
          </Tooltip>
        )}
        <Button
          size="sm"
          variant="light"
          color="danger"
          isIconOnly
          onPress={() => {
            onRemove(operation.id);
          }}
          aria-label="Remove operation"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
