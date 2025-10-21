/**
 * Operation Queue Component
 *
 * @remarks
 * Displays operations in a batch with drag-and-drop reordering and removal.
 * Uses @dnd-kit for accessible, touch-friendly drag-and-drop.
 */
"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AlertCircle } from "lucide-react";
import type { BatchOperation } from "../../lib/batch/builder-types";
import { EmptyState } from "../ui/EmptyState";
import { SortableOperationRow } from "./SortableOperationRow";

interface OperationQueueProps {
  operations: BatchOperation[];
  onRemove: (id: string) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
  /** Optional validation warnings */
  warnings?: Array<{
    code: string;
    message: string;
    operationIds?: string[];
  }>;
}

const columns = [
  { key: "drag", label: "", width: "40px" },
  { key: "order", label: "#", width: "50px" },
  { key: "type", label: "Action", width: "100px" },
  { key: "contract", label: "Contract" },
  { key: "role", label: "Role" },
  { key: "account", label: "Account" },
  { key: "actions", label: "", width: "80px" },
];

/**
 * OperationQueue displays operations with drag-and-drop reordering
 */
export function OperationQueue({
  operations,
  onRemove,
  onReorder,
  warnings = [],
}: OperationQueueProps) {
  // Configure drag sensors for mouse and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Check if operation has warnings
  const hasWarning = (opId: string): boolean => {
    return warnings.some((w) => w.operationIds?.includes(opId));
  };

  // Get warnings for operation
  const getWarnings = (opId: string): string[] => {
    return warnings
      .filter((w) => w.operationIds?.includes(opId))
      .map((w) => w.message);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = operations.findIndex((op) => op.id === active.id);
      const newIndex = operations.findIndex((op) => op.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(oldIndex, newIndex);
      }
    }
  };

  if (operations.length === 0) {
    return (
      <EmptyState
        Icon={AlertCircle}
        title="No operations"
        description="Add operations manually or use a template to get started"
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* Operation count */}
      <div className="flex items-center gap-2 text-sm text-default-500">
        <span className="font-semibold">{operations.length}</span>
        <span>operation{operations.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table with drag-and-drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="border border-divider rounded-lg overflow-hidden bg-content1">
          {/* Table header */}
          <div className="border-b border-divider bg-default-100">
            <div className="grid grid-cols-[40px_50px_100px_1fr_1fr_1fr_80px] gap-3 px-3 py-2">
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={`text-xs font-semibold text-default-600 ${
                    column.key === "actions" ||
                    column.key === "drag" ||
                    column.key === "order"
                      ? "text-center"
                      : ""
                  }`}
                >
                  {column.label}
                </div>
              ))}
            </div>
          </div>

          {/* Table body with sortable rows */}
          <SortableContext
            items={operations.map((op) => op.id)}
            strategy={verticalListSortingStrategy}
          >
            {operations.map((operation, index) => (
              <SortableOperationRow
                key={operation.id}
                operation={operation}
                index={index}
                onRemove={onRemove}
                warnings={getWarnings(operation.id)}
                hasWarning={hasWarning(operation.id)}
              />
            ))}
          </SortableContext>
        </div>
      </DndContext>
    </div>
  );
}
