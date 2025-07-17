import React, { useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Pagination,
  Tabs,
  Tab,
  Spinner,
} from "@heroui/react";
import {
  Database,
  Brain,
  RefreshCw,
  Plus,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { Schema, Refiner } from "@opendatalabs/vana-sdk";
import { FormBuilder } from "../ui/FormBuilder";
import { EmptyState } from "../ui/EmptyState";
import { SchemaIdDisplay } from "../ui/SchemaIdDisplay";
import { RefinerIdDisplay } from "../ui/RefinerIdDisplay";
import { DlpIdDisplay } from "../ui/DlpIdDisplay";

/**
 * Props for the DeveloperDashboardView component
 */
export interface DeveloperDashboardViewProps {
  // Schema management
  schemasCount: number;
  refinersCount: number;
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
  updateRefinerId: string;
  onUpdateRefinerIdChange: (refinerId: string) => void;
  updateSchemaId: string;
  onUpdateSchemaIdChange: (schemaId: string) => void;
  onUpdateSchemaId: () => void;
  isUpdatingSchema: boolean;
  updateSchemaStatus: string;
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
 * Developer dashboard view component - consolidates schema and refiner management
 *
 * @remarks
 * This view serves as the control panel for application developers building on Vana.
 * It provides tools to manage protocol-level entities like Schemas and Refiners
 * in a clean, form-driven interface.
 *
 * The component consolidates the functionality of SchemaManagementCard into a single,
 * organized interface for better navigation and reduced cognitive load.
 *
 * @param props - The component props
 * @returns The rendered developer dashboard view
 */
export function DeveloperDashboardView({
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
}: DeveloperDashboardViewProps) {
  const [activeTab, setActiveTab] = React.useState("schemas");

  // Schemas pagination state
  const [schemasCurrentPage, setSchemasCurrentPage] = React.useState(1);
  const SCHEMAS_PER_PAGE = 10;

  // Refiners pagination state
  const [refinersCurrentPage, setRefinersCurrentPage] = React.useState(1);
  const REFINERS_PER_PAGE = 10;

  /**
   * Calculate paginated schemas
   */
  const paginatedSchemas = useMemo(() => {
    const startIndex = (schemasCurrentPage - 1) * SCHEMAS_PER_PAGE;
    const endIndex = startIndex + SCHEMAS_PER_PAGE;
    return schemas.slice(startIndex, endIndex);
  }, [schemas, schemasCurrentPage, SCHEMAS_PER_PAGE]);

  /**
   * Calculate paginated refiners
   */
  const paginatedRefiners = useMemo(() => {
    const startIndex = (refinersCurrentPage - 1) * REFINERS_PER_PAGE;
    const endIndex = startIndex + REFINERS_PER_PAGE;
    return refiners.slice(startIndex, endIndex);
  }, [refiners, refinersCurrentPage, REFINERS_PER_PAGE]);

  const schemaTotalPages = Math.ceil(schemas.length / SCHEMAS_PER_PAGE);
  const refinersTotalPages = Math.ceil(refiners.length / REFINERS_PER_PAGE);

  // Reset to first page when data changes
  React.useEffect(() => {
    setSchemasCurrentPage(1);
  }, [schemas.length]);

  React.useEffect(() => {
    setRefinersCurrentPage(1);
  }, [refiners.length]);

  /**
   * Renders the schemas tab content
   */
  const renderSchemasTab = () => (
    <div className="space-y-6">
      {/* Schema Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Database className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{schemasCount}</span>
            </div>
            <p className="text-sm text-default-500">Total Schemas</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Brain className="h-5 w-5 text-success" />
              <span className="text-2xl font-bold">{refinersCount}</span>
            </div>
            <p className="text-sm text-default-500">Total Refiners</p>
          </CardBody>
        </Card>
      </div>

      {/* Create Schema */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Create New Schema</h3>
          </div>
        </CardHeader>
        <CardBody>
          <FormBuilder
            title=""
            singleColumn={true}
            fields={[
              {
                name: "schemaName",
                label: "Schema Name",
                type: "text",
                value: schemaName,
                onChange: onSchemaNameChange,
                placeholder: "My Data Schema",
                description: "A descriptive name for your schema",
                required: true,
              },
              {
                name: "schemaType",
                label: "Schema Type",
                type: "text",
                value: schemaType,
                onChange: onSchemaTypeChange,
                placeholder: "user_profile",
                description: "The type identifier for this schema",
                required: true,
              },
              {
                name: "schemaDefinitionUrl",
                label: "Definition URL",
                type: "text",
                value: schemaDefinitionUrl,
                onChange: onSchemaDefinitionUrlChange,
                placeholder: "https://...",
                description: "URL to the JSON schema definition",
                required: true,
              },
            ]}
            onSubmit={onCreateSchema}
            isSubmitting={isCreatingSchema}
            submitText="Create Schema"
            submitIcon={<Database className="h-4 w-4" />}
            status={schemaStatus}
          />

          {lastCreatedSchemaId && (
            <div className="mt-4 p-3 bg-success/10 rounded-lg">
              <p className="text-sm font-medium text-success-700 mb-1">
                Schema created successfully!
              </p>
              <SchemaIdDisplay
                schemaId={lastCreatedSchemaId}
                chainId={chainId}
                showCopy={true}
                showExternalLink={true}
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create Refiner */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Create New Refiner</h3>
          </div>
        </CardHeader>
        <CardBody>
          <FormBuilder
            title=""
            singleColumn={true}
            fields={[
              {
                name: "refinerName",
                label: "Refiner Name",
                type: "text",
                value: refinerName,
                onChange: onRefinerNameChange,
                placeholder: "My Data Refiner",
                description: "A descriptive name for your refiner",
                required: true,
              },
              {
                name: "refinerDlpId",
                label: "DLP ID",
                type: "text",
                value: refinerDlpId,
                onChange: onRefinerDlpIdChange,
                placeholder: "1",
                description: "The Data Liquidity Pool ID",
                required: true,
              },
              {
                name: "refinerSchemaId",
                label: "Schema ID",
                type: "text",
                value: refinerSchemaId,
                onChange: onRefinerSchemaIdChange,
                placeholder: "1",
                description: "The schema ID this refiner will use",
                required: true,
              },
              {
                name: "refinerInstructionUrl",
                label: "Instruction URL",
                type: "text",
                value: refinerInstructionUrl,
                onChange: onRefinerInstructionUrlChange,
                placeholder: "https://...",
                description: "URL to the refiner instruction file",
                required: true,
              },
            ]}
            onSubmit={onCreateRefiner}
            isSubmitting={isCreatingRefiner}
            submitText="Create Refiner"
            submitIcon={<Brain className="h-4 w-4" />}
            status={refinerStatus}
          />

          {lastCreatedRefinerId && (
            <div className="mt-4 p-3 bg-success/10 rounded-lg">
              <p className="text-sm font-medium text-success-700 mb-1">
                Refiner created successfully!
              </p>
              <RefinerIdDisplay
                refinerId={lastCreatedRefinerId}
                chainId={chainId}
                showCopy={true}
                showExternalLink={true}
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Update Schema ID */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Update Refiner Schema</h3>
          </div>
        </CardHeader>
        <CardBody>
          <FormBuilder
            title=""
            singleColumn={true}
            fields={[
              {
                name: "updateRefinerId",
                label: "Refiner ID",
                type: "text",
                value: updateRefinerId,
                onChange: onUpdateRefinerIdChange,
                placeholder: "1",
                description: "The refiner ID to update",
                required: true,
              },
              {
                name: "updateSchemaId",
                label: "New Schema ID",
                type: "text",
                value: updateSchemaId,
                onChange: onUpdateSchemaIdChange,
                placeholder: "2",
                description: "The new schema ID to assign",
                required: true,
              },
            ]}
            onSubmit={onUpdateSchemaId}
            isSubmitting={isUpdatingSchema}
            submitText="Update Schema"
            submitIcon={<RotateCcw className="h-4 w-4" />}
            status={updateSchemaStatus}
          />
        </CardBody>
      </Card>

      {/* Schemas List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">Schemas</h3>
                <p className="text-sm text-default-500">
                  {schemas.length} schemas available
                </p>
              </div>
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
        </CardHeader>
        <CardBody>
          {isLoadingSchemas ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading schemas...</span>
            </div>
          ) : schemas.length === 0 ? (
            <EmptyState
              icon={<Database className="h-12 w-12" />}
              title="No schemas found"
              description="Create a schema above to get started"
            />
          ) : (
            <div className="space-y-4">
              <Table aria-label="Schemas table" removeWrapper>
                <TableHeader>
                  <TableColumn>ID</TableColumn>
                  <TableColumn>Name</TableColumn>
                  <TableColumn>Type</TableColumn>
                  <TableColumn>Source</TableColumn>
                  <TableColumn>Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedSchemas.map((schema) => (
                    <TableRow key={schema.id}>
                      <TableCell>
                        <SchemaIdDisplay
                          schemaId={schema.id}
                          chainId={chainId}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>{schema.name}</TableCell>
                      <TableCell>{schema.type}</TableCell>
                      <TableCell>
                        {schema.source && (
                          <Chip
                            size="sm"
                            color={
                              schema.source === "created"
                                ? "success"
                                : "default"
                            }
                            variant="flat"
                          >
                            {schema.source}
                          </Chip>
                        )}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {schemas.length > SCHEMAS_PER_PAGE && (
                <div className="flex justify-center">
                  <Pagination
                    total={schemaTotalPages}
                    page={schemasCurrentPage}
                    onChange={setSchemasCurrentPage}
                    showControls={true}
                    size="sm"
                  />
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Refiners List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">Refiners</h3>
                <p className="text-sm text-default-500">
                  {refiners.length} refiners available
                </p>
              </div>
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
        </CardHeader>
        <CardBody>
          {isLoadingRefiners ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading refiners...</span>
            </div>
          ) : refiners.length === 0 ? (
            <EmptyState
              icon={<Brain className="h-12 w-12" />}
              title="No refiners found"
              description="Create a refiner above to get started"
            />
          ) : (
            <div className="space-y-4">
              <Table aria-label="Refiners table" removeWrapper>
                <TableHeader>
                  <TableColumn>ID</TableColumn>
                  <TableColumn>Name</TableColumn>
                  <TableColumn>DLP ID</TableColumn>
                  <TableColumn>Schema ID</TableColumn>
                  <TableColumn>Source</TableColumn>
                  <TableColumn>Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedRefiners.map((refiner) => (
                    <TableRow key={refiner.id}>
                      <TableCell>
                        <RefinerIdDisplay
                          refinerId={refiner.id}
                          chainId={chainId}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>{refiner.name}</TableCell>
                      <TableCell>
                        <DlpIdDisplay
                          dlpId={refiner.dlpId}
                          chainId={chainId}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>
                        <SchemaIdDisplay
                          schemaId={refiner.schemaId}
                          chainId={chainId}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>
                        {refiner.source && (
                          <Chip
                            size="sm"
                            color={
                              refiner.source === "created"
                                ? "success"
                                : "default"
                            }
                            variant="flat"
                          >
                            {refiner.source}
                          </Chip>
                        )}
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
                          View Instructions
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {refiners.length > REFINERS_PER_PAGE && (
                <div className="flex justify-center">
                  <Pagination
                    total={refinersTotalPages}
                    page={refinersCurrentPage}
                    onChange={setRefinersCurrentPage}
                    showControls={true}
                    size="sm"
                  />
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Developer Tools
        </h1>
        <p className="text-lg text-default-600">
          Manage protocol-level entities and server integrations
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Database className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{schemasCount}</span>
            </div>
            <p className="text-sm text-default-500">Schemas</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Brain className="h-5 w-5 text-success" />
              <span className="text-2xl font-bold">{refinersCount}</span>
            </div>
            <p className="text-sm text-default-500">Refiners</p>
          </CardBody>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        aria-label="Developer tools tabs"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        className="w-full"
      >
        <Tab key="schemas" title="Schemas & Refiners">
          {renderSchemasTab()}
        </Tab>
      </Tabs>
    </div>
  );
}
