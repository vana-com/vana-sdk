import React, { useState, useEffect, Fragment } from "react";
import {
  Select,
  SelectItem,
  Spinner,
  Card,
  CardBody,
  Chip,
  Button,
} from "@heroui/react";
import { Database, ExternalLink, Info } from "lucide-react";
import type { Schema, VanaInstance } from "@opendatalabs/vana-sdk/browser";

interface SchemaSelectorProps {
  /** Vana SDK instance for loading schemas */
  vana: VanaInstance | null;
  /** Currently selected schema ID (null for no selection) */
  selectedSchemaId: number | null;
  /** Callback when schema selection changes */
  onSchemaChange: (schemaId: number | null, schema?: Schema | null) => void;
  /** Whether to show schema information when selected */
  showSchemaInfo?: boolean;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Custom placeholder text */
  placeholder?: string;
  /** Whether to include "None" option */
  includeNoneOption?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SchemaSelector component - Reusable schema selection dropdown
 *
 * @remarks
 * This component provides a consistent way to select schemas across the application.
 * It loads available schemas from the blockchain and displays them in a searchable dropdown.
 * Optionally displays schema information when a schema is selected.
 */
export const SchemaSelector: React.FC<SchemaSelectorProps> = ({
  vana,
  selectedSchemaId,
  onSchemaChange,
  showSchemaInfo = true,
  disabled = false,
  placeholder = "Select a schema...",
  includeNoneOption = true,
  className = "",
}) => {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load available schemas
  useEffect(() => {
    const loadSchemas = async () => {
      if (!vana) return;

      setIsLoading(true);
      setError(null);

      try {
        const count = await vana.schemas.count();
        const schemaList: Schema[] = [];

        // Load all schemas (or first 50 to prevent performance issues)
        const maxToLoad = Math.min(count, 50);

        for (let i = 1; i <= maxToLoad; i++) {
          try {
            const schema = await vana.schemas.get(i);
            schemaList.push(schema);
          } catch (error) {
            console.warn(`Failed to load schema ${i}:`, error);
          }
        }

        setSchemas(schemaList);
      } catch (error) {
        console.error("Failed to load schemas:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load schemas",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadSchemas();
  }, [vana]);

  // Update selected schema when selectedSchemaId changes
  useEffect(() => {
    if (selectedSchemaId === null) {
      setSelectedSchema(null);
    } else {
      const schema = schemas.find((s) => s.id === selectedSchemaId);
      setSelectedSchema(schema || null);
    }
  }, [selectedSchemaId, schemas]);

  const handleSelectionChange = (keys: Set<React.Key> | "all") => {
    const keySet = new Set(
      typeof keys === "string" ? [keys] : Array.from(keys),
    );
    const selectedKey = Array.from(keySet)[0];

    if (selectedKey === "none") {
      onSchemaChange(null, null);
    } else {
      const schemaId = parseInt(selectedKey as string);
      const schema = schemas.find((s) => s.id === schemaId);
      onSchemaChange(schemaId, schema || null);
    }
  };

  const getSelectedKeys = (): Set<string> => {
    if (selectedSchemaId === null || selectedSchemaId === undefined) {
      return includeNoneOption ? new Set(["none"]) : new Set();
    }
    return new Set([selectedSchemaId.toString()]);
  };

  if (error) {
    return (
      <div className={`text-sm text-danger ${className}`}>
        <Info className="inline h-4 w-4 mr-1" />
        {error}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Select
          label="Schema"
          placeholder={isLoading ? "Loading schemas..." : placeholder}
          selectedKeys={getSelectedKeys()}
          onSelectionChange={handleSelectionChange}
          isDisabled={disabled || isLoading}
          startContent={
            isLoading ? <Spinner size="sm" /> : <Database className="h-4 w-4" />
          }
          description={
            includeNoneOption
              ? "Select a schema to validate data against, or choose 'None' to upload without validation"
              : "Select a schema to validate data against"
          }
        >
          <Fragment>
            {includeNoneOption && (
              <SelectItem key="none" textValue="None - No validation">
                <div className="flex items-center gap-2">
                  <span className="text-default-500">None</span>
                  <span className="text-xs text-default-400">
                    (no validation)
                  </span>
                </div>
              </SelectItem>
            )}
            {schemas.map((schema) => (
              <SelectItem
                key={schema.id.toString()}
                textValue={`${schema.name} - ${schema.dialect}`}
              >
                <div className="flex items-center justify-between w-full">
                  <div>
                    <div className="font-medium">{schema.name}</div>
                    <div className="text-xs text-default-500">
                      {schema.dialect}
                    </div>
                  </div>
                  <Chip size="sm" variant="flat" color="secondary">
                    ID: {schema.id}
                  </Chip>
                </div>
              </SelectItem>
            ))}
          </Fragment>
        </Select>
      </div>

      {/* Schema Information Display */}
      {showSchemaInfo && selectedSchema && (
        <Card className="bg-secondary/10">
          <CardBody className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-secondary mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  {selectedSchema.name}
                </h4>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="font-medium">Dialect:</span>{" "}
                    {selectedSchema.dialect}
                  </div>
                  <div>
                    <span className="font-medium">Schema ID:</span>{" "}
                    {selectedSchema.id}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Definition:</span>
                    <Button
                      as="a"
                      href={selectedSchema.definitionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      variant="light"
                      startContent={<ExternalLink className="h-3 w-3" />}
                    >
                      View Schema
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* No Schema Selected Info */}
      {showSchemaInfo && includeNoneOption && selectedSchemaId === null && (
        <Card className="bg-warning/10">
          <CardBody className="p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-warning mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning mb-1">
                  No schema selected
                </p>
                <p className="text-warning/80">
                  Data will be uploaded without validation. Consider selecting a
                  schema to ensure your data meets specific format requirements.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
};
