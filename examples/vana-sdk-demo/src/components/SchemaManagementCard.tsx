import React from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Spinner,
  Chip,
} from "@heroui/react";
import {
  Database,
  Brain,
  RotateCcw,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { FormBuilder } from "./ui/FormBuilder";
import { EmptyState } from "./ui/EmptyState";
import { ExplorerLink } from "./ui/ExplorerLink";
import { CopyButton } from "./ui/CopyButton";
import { Schema, Refiner } from "vana-sdk";

interface SchemaManagementCardProps {
  // Statistics
  schemasCount: number;
  refinersCount: number;

  // Schema creation
  schemaName: string;
  onSchemaNameChange: (name: string) => void;
  schemaType: string;
  onSchemaTypeChange: (type: string) => void;
  schemaDefinitionUrl: string;
  onSchemaDefinitionUrlChange: (url: string) => void;
  onCreateSchema: () => void;
  isCreatingSchema: boolean;
  schemaStatus: string;
  lastCreatedSchemaId: number | null;

  // Refiner creation
  refinerName: string;
  onRefinerNameChange: (name: string) => void;
  refinerDlpId: string;
  onRefinerDlpIdChange: (dlpId: string) => void;
  refinerSchemaId: string;
  onRefinerSchemaIdChange: (schemaId: string) => void;
  refinerInstructionUrl: string;
  onRefinerInstructionUrlChange: (url: string) => void;
  onCreateRefiner: () => void;
  isCreatingRefiner: boolean;
  refinerStatus: string;
  lastCreatedRefinerId: number | null;

  // Schema ID update
  updateRefinerId: string;
  onUpdateRefinerIdChange: (refinerId: string) => void;
  updateSchemaId: string;
  onUpdateSchemaIdChange: (schemaId: string) => void;
  onUpdateSchemaId: () => void;
  isUpdatingSchema: boolean;
  updateSchemaStatus: string;

  // Lists
  schemas: (Schema & { source?: "discovered" | "created" })[];
  isLoadingSchemas: boolean;
  onRefreshSchemas: () => void;
  refiners: (Refiner & { source?: "discovered" | "created" })[];
  isLoadingRefiners: boolean;
  onRefreshRefiners: () => void;

  // Chain info
  chainId: number;
}

/**
 * SchemaManagementCard component - Complete schema and refiner management workflow
 * Demonstrates addSchema(), addRefiner(), getSchemas(), getRefiners()
 */
export const SchemaManagementCard: React.FC<SchemaManagementCardProps> = ({
  schemasCount,
  refinersCount,
  schemaName,
  onSchemaNameChange,
  schemaType,
  onSchemaTypeChange,
  schemaDefinitionUrl,
  onSchemaDefinitionUrlChange,
  onCreateSchema,
  isCreatingSchema,
  schemaStatus,
  lastCreatedSchemaId,
  refinerName,
  onRefinerNameChange,
  refinerDlpId,
  onRefinerDlpIdChange,
  refinerSchemaId,
  onRefinerSchemaIdChange,
  refinerInstructionUrl,
  onRefinerInstructionUrlChange,
  onCreateRefiner,
  isCreatingRefiner,
  refinerStatus,
  lastCreatedRefinerId,
  updateRefinerId,
  onUpdateRefinerIdChange,
  updateSchemaId,
  onUpdateSchemaIdChange,
  onUpdateSchemaId,
  isUpdatingSchema,
  updateSchemaStatus,
  schemas,
  isLoadingSchemas,
  onRefreshSchemas,
  refiners,
  isLoadingRefiners,
  onRefreshRefiners,
  chainId,
}) => {
  return (
    <section id="schemas">
      <SectionHeader
        icon={<Database className="h-5 w-5" />}
        title="Schema Management"
        description={
          <>
            <em>
              Demonstrates: `addSchema()`, `addRefiner()`, `getSchemas()`,
              `getRefiners()`
            </em>
            <br />
            Manage data schemas and refiners for structured data processing
            workflows.
          </>
        }
      />
      <div className="mt-6 space-y-6">
        {/* Schema Statistics */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {schemasCount}
            </div>
            <div className="text-sm text-muted-foreground">Total Schemas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {refinersCount}
            </div>
            <div className="text-sm text-muted-foreground">Total Refiners</div>
          </div>
        </div>

        {/* Create Schema */}
        <div>
          <FormBuilder
            title="Create New Schema"
            fields={[
              {
                name: "name",
                label: "Name",
                type: "text",
                placeholder: "e.g., User Profile Schema",
                description: "A descriptive name for your schema",
                value: schemaName,
                onChange: onSchemaNameChange,
                required: true,
              },
              {
                name: "type",
                label: "Type",
                type: "text",
                placeholder: "e.g., json-schema",
                description: "The schema format type (e.g., json-schema, avro)",
                value: schemaType,
                onChange: onSchemaTypeChange,
                required: true,
              },
              {
                name: "definitionUrl",
                label: "Definition URL",
                type: "url",
                placeholder: "https://example.com/schema.json",
                description: "URL to the schema definition file",
                value: schemaDefinitionUrl,
                onChange: onSchemaDefinitionUrlChange,
                required: true,
              },
            ]}
            onSubmit={onCreateSchema}
            isSubmitting={isCreatingSchema}
            submitText="Create Schema"
            submitIcon={<Database className="h-4 w-4" />}
            status={schemaStatus}
            statusType={schemaStatus?.includes("❌") ? "error" : "success"}
          />
          {lastCreatedSchemaId && (
            <div className="p-3 bg-success/10 border border-success rounded mt-4">
              <p className="text-success text-sm">
                ✅ Schema created successfully with ID:{" "}
                <strong>{lastCreatedSchemaId}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Create Refiner */}
        <div>
          <FormBuilder
            title="Create New Refiner"
            fields={[
              {
                name: "name",
                label: "Name",
                type: "text",
                placeholder: "e.g., Privacy-Preserving Analytics",
                description: "A descriptive name for your refiner",
                value: refinerName,
                onChange: onRefinerNameChange,
                required: true,
              },
              {
                name: "dlpId",
                label: "DLP ID",
                type: "number",
                placeholder: "e.g., 1",
                description:
                  "The Data Liquidity Pool ID this refiner belongs to",
                value: refinerDlpId,
                onChange: onRefinerDlpIdChange,
                required: true,
              },
              {
                name: "schemaId",
                label: "Schema ID",
                type: "number",
                placeholder: "e.g., 1",
                description: "The ID of the schema this refiner processes",
                value: refinerSchemaId,
                onChange: onRefinerSchemaIdChange,
                required: true,
              },
              {
                name: "instructionUrl",
                label: "Instruction URL",
                type: "url",
                placeholder: "https://example.com/instructions.md",
                description: "URL to the refiner's processing instructions",
                value: refinerInstructionUrl,
                onChange: onRefinerInstructionUrlChange,
                required: true,
              },
            ]}
            onSubmit={onCreateRefiner}
            isSubmitting={isCreatingRefiner}
            submitText="Create Refiner"
            submitIcon={<Brain className="h-4 w-4" />}
            status={refinerStatus}
            statusType={refinerStatus?.includes("❌") ? "error" : "success"}
          />
          {lastCreatedRefinerId && (
            <div className="p-3 bg-success/10 border border-success rounded mt-4">
              <p className="text-success text-sm">
                ✅ Refiner created successfully with ID:{" "}
                <strong>{lastCreatedRefinerId}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Update Schema ID */}
        <div>
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Update the schema ID for an existing refiner (useful for migrating
              existing refiners to new schema structure).
            </p>
          </div>
          <FormBuilder
            title="Update Refiner Schema ID"
            fields={[
              {
                name: "refinerId",
                label: "Refiner ID",
                type: "number",
                placeholder: "e.g., 1",
                description: "The ID of the refiner to update",
                value: updateRefinerId,
                onChange: onUpdateRefinerIdChange,
                required: true,
              },
              {
                name: "schemaId",
                label: "New Schema ID",
                type: "number",
                placeholder: "e.g., 2",
                description: "The new schema ID to assign to this refiner",
                value: updateSchemaId,
                onChange: onUpdateSchemaIdChange,
                required: true,
              },
            ]}
            onSubmit={onUpdateSchemaId}
            isSubmitting={isUpdatingSchema}
            submitText="Update Schema ID"
            submitIcon={<RotateCcw className="h-4 w-4" />}
            status={updateSchemaStatus}
            statusType={
              updateSchemaStatus?.includes("❌") ? "error" : "success"
            }
          />
        </div>

        {/* Schemas List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold">Schema Registry</h3>
              <p className="text-small text-default-500">
                Browse and manage data schemas ({schemas.length} schemas)
              </p>
            </div>
            <Button
              onPress={onRefreshSchemas}
              variant="bordered"
              size="sm"
              startContent={
                isLoadingSchemas ? (
                  <Spinner size="sm" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              isDisabled={isLoadingSchemas}
            >
              Refresh
            </Button>
          </div>

          {isLoadingSchemas ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading schemas...</span>
            </div>
          ) : schemas.length === 0 ? (
            <EmptyState
              icon={<Database className="h-8 w-8" />}
              title="No schemas found"
              size="compact"
            />
          ) : (
            <Table
              aria-label="Schemas table"
              removeWrapper
              classNames={{
                th: "bg-default-100 text-default-700",
                td: "py-4",
              }}
            >
              <TableHeader>
                <TableColumn>ID</TableColumn>
                <TableColumn>Name</TableColumn>
                <TableColumn>Type</TableColumn>
                <TableColumn>Definition</TableColumn>
                <TableColumn>Source</TableColumn>
              </TableHeader>
              <TableBody>
                {schemas.map((schema) => (
                  <TableRow key={schema.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-small">
                          {schema.id}
                        </span>
                        <CopyButton
                          value={schema.id.toString()}
                          tooltip="Copy schema ID"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{schema.name}</span>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat">
                        {schema.type}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Button
                        as="a"
                        href={schema.definitionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        variant="flat"
                        startContent={<ExternalLink className="h-3 w-3" />}
                      >
                        View Definition
                      </Button>
                    </TableCell>
                    <TableCell>
                      {schema.source && (
                        <Chip
                          size="sm"
                          color={
                            schema.source === "created" ? "success" : "default"
                          }
                          variant="flat"
                        >
                          {schema.source}
                        </Chip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Refiners List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold">Refiner Registry</h3>
              <p className="text-small text-default-500">
                Browse and manage data refiners ({refiners.length} refiners)
              </p>
            </div>
            <Button
              onPress={onRefreshRefiners}
              variant="bordered"
              size="sm"
              startContent={
                isLoadingRefiners ? (
                  <Spinner size="sm" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              isDisabled={isLoadingRefiners}
            >
              Refresh
            </Button>
          </div>

          {isLoadingRefiners ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading refiners...</span>
            </div>
          ) : refiners.length === 0 ? (
            <EmptyState
              icon={<Brain className="h-8 w-8" />}
              title="No refiners found"
              size="compact"
            />
          ) : (
            <Table
              aria-label="Refiners table"
              removeWrapper
              classNames={{
                th: "bg-default-100 text-default-700",
                td: "py-4",
              }}
            >
              <TableHeader>
                <TableColumn>ID</TableColumn>
                <TableColumn>Name</TableColumn>
                <TableColumn>Owner</TableColumn>
                <TableColumn>DLP ID</TableColumn>
                <TableColumn>Schema ID</TableColumn>
                <TableColumn>Instructions</TableColumn>
                <TableColumn>Source</TableColumn>
              </TableHeader>
              <TableBody>
                {refiners.map((refiner) => (
                  <TableRow key={refiner.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-small">
                          {refiner.id}
                        </span>
                        <CopyButton
                          value={refiner.id.toString()}
                          tooltip="Copy refiner ID"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{refiner.name}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ExplorerLink
                          type="address"
                          hash={refiner.owner}
                          chainId={chainId}
                          truncate={true}
                          showExternalIcon={false}
                        />
                        <CopyButton
                          value={refiner.owner}
                          tooltip="Copy owner address"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color="secondary">
                        DLP #{refiner.dlpId}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat">
                        Schema #{refiner.schemaId}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Button
                        as="a"
                        href={refiner.refinementInstructionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        variant="flat"
                        startContent={<ExternalLink className="h-3 w-3" />}
                      >
                        Download Instructions
                      </Button>
                    </TableCell>
                    <TableCell>
                      {refiner.source && (
                        <Chip
                          size="sm"
                          color={
                            refiner.source === "created" ? "success" : "default"
                          }
                          variant="flat"
                        >
                          {refiner.source}
                        </Chip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </section>
  );
};
