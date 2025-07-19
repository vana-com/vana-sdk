"use client";

import React, { useMemo } from "react";
import { useChainId, useWalletClient } from "wagmi";
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
  RotateCcw,
  ExternalLink,
  Copy,
} from "lucide-react";
import { FormBuilder } from "@/components/ui/FormBuilder";
import { EmptyState } from "@/components/ui/EmptyState";
import { SchemaIdDisplay } from "@/components/ui/SchemaIdDisplay";
import { RefinerIdDisplay } from "@/components/ui/RefinerIdDisplay";
import { DlpIdDisplay } from "@/components/ui/DlpIdDisplay";
import { SchemaCreationForm } from "@/components/ui/SchemaCreationForm";
import { SchemaValidationTab } from "@/components/ui/SchemaValidationTab";
import { AdvancedToolsTab } from "@/components/ui/AdvancedToolsTab";
import { useSchemasAndRefiners } from "@/hooks/useSchemasAndRefiners";
import { useVana } from "@/providers/VanaProvider";

/**
 * Developer Tools page - Manage protocol-level entities and server integrations
 *
 * This page serves as the control panel for application developers building on Vana.
 * It provides tools to manage protocol-level entities like Schemas and Refiners
 * in a clean, form-driven interface.
 */
export default function DeveloperToolsPage() {
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { vana } = useVana();

  // Use custom hook for schemas and refiners management
  const {
    // Schemas state
    schemas,
    isLoadingSchemas,
    schemasCount,
    
    // Schema creation state
    schemaName,
    schemaType,
    schemaDefinitionUrl: _schemaDefinitionUrl,
    isCreatingSchema,
    schemaStatus,
    lastCreatedSchemaId,
    
    // Refiners state
    refiners,
    isLoadingRefiners,
    refinersCount,
    
    // Refiner creation state
    refinerName,
    refinerDlpId,
    refinerSchemaId,
    refinerInstructionUrl,
    isCreatingRefiner,
    refinerStatus,
    lastCreatedRefinerId,
    
    // Schema update state
    updateRefinerId,
    updateSchemaId,
    isUpdatingSchema,
    updateSchemaStatus,
    
    // Actions
    loadSchemas,
    loadRefiners,
    handleCreateSchema,
    handleCreateRefiner,
    handleUpdateSchemaId,
    
    // Setters
    setSchemaName,
    setSchemaType,
    setSchemaDefinitionUrl,
    setRefinerName,
    setRefinerDlpId,
    setRefinerSchemaId,
    setRefinerInstructionUrl,
    setUpdateRefinerId,
    setUpdateSchemaId,
  } = useSchemasAndRefiners();
  
  const [activeTab, setActiveTab] = React.useState("schemas");

  // Schemas pagination state
  const [schemasCurrentPage, setSchemasCurrentPage] = React.useState(1);
  const SCHEMAS_PER_PAGE = 10;

  // Refiners pagination state
  const [refinersCurrentPage, setRefinersCurrentPage] = React.useState(1);
  const REFINERS_PER_PAGE = 10;

  // Calculate paginated schemas
  const paginatedSchemas = useMemo(() => {
    const startIndex = (schemasCurrentPage - 1) * SCHEMAS_PER_PAGE;
    const endIndex = startIndex + SCHEMAS_PER_PAGE;
    return schemas.slice(startIndex, endIndex);
  }, [schemas, schemasCurrentPage, SCHEMAS_PER_PAGE]);

  // Calculate paginated refiners
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

  // Renders the schemas tab content
  const renderSchemasTab = () => (
    <div className="space-y-6">
      {/* Create Schema */}
      {vana && (
        <SchemaCreationForm
          vana={vana}
          schemaName={schemaName}
          onSchemaNameChange={setSchemaName}
          schemaType={schemaType}
          onSchemaTypeChange={setSchemaType}
          onCreateSchema={({ name: _name, type: _type, definitionUrl }) => {
            // Update the URL field in the hook state
            setSchemaDefinitionUrl(definitionUrl);
            // Call the hook's create schema handler
            handleCreateSchema();
          }}
          isCreatingSchema={isCreatingSchema}
          schemaStatus={schemaStatus}
          lastCreatedSchemaId={lastCreatedSchemaId}
          chainId={chainId || 14800}
        />
      )}

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
              onPress={loadSchemas}
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
                          chainId={chainId || 14800}
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
    </div>
  );

  // Renders the contracts tab content
  const renderContractsTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Smart Contracts</h3>
          </div>
        </CardHeader>
        <CardBody>
          {vana ? (
            <div className="space-y-4">
              <Table aria-label="Smart contracts table" removeWrapper>
                <TableHeader>
                  <TableColumn>Contract Name</TableColumn>
                  <TableColumn>Address</TableColumn>
                  <TableColumn>Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {vana.protocol
                    .getAvailableContracts()
                    .filter((contractName) => {
                      try {
                        vana.protocol.getContract(contractName);
                        return true;
                      } catch {
                        return false;
                      }
                    })
                    .map((contractName) => {
                      const contract = vana.protocol.getContract(contractName);
                      return (
                        <TableRow key={contractName}>
                          <TableCell>{contractName}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">
                                {contract.address}
                              </span>
                              <Button
                                size="sm"
                                variant="flat"
                                isIconOnly
                                onPress={() =>
                                  navigator.clipboard.writeText(contract.address)
                                }
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              as="a"
                              href={`https://vanascan.io/address/${contract.address}?tab=contract`}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              variant="flat"
                              startContent={<ExternalLink className="h-3 w-3" />}
                            >
                              View on Explorer
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center p-8">
              <p>Loading Vana SDK...</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  // Renders the refiners tab content
  const renderRefinersTab = () => (
    <div className="space-y-6">
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
                onChange: setRefinerName,
                placeholder: "My Data Refiner",
                description: "A descriptive name for your refiner",
                required: true,
              },
              {
                name: "refinerDlpId",
                label: "DLP ID",
                type: "text",
                value: refinerDlpId,
                onChange: setRefinerDlpId,
                placeholder: "1",
                description: "The Data Liquidity Pool ID",
                required: true,
              },
              {
                name: "refinerSchemaId",
                label: "Schema ID",
                type: "text",
                value: refinerSchemaId,
                onChange: setRefinerSchemaId,
                placeholder: "1",
                description: "The schema ID this refiner will use",
                required: true,
              },
              {
                name: "refinerInstructionUrl",
                label: "Instruction URL",
                type: "text",
                value: refinerInstructionUrl,
                onChange: setRefinerInstructionUrl,
                placeholder: "https://...",
                description: "URL to the refiner instruction file",
                required: true,
              },
            ]}
            onSubmit={handleCreateRefiner}
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
                chainId={chainId || 14800}
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
                onChange: setUpdateRefinerId,
                placeholder: "1",
                description: "The refiner ID to update",
                required: true,
              },
              {
                name: "updateSchemaId",
                label: "New Schema ID",
                type: "text",
                value: updateSchemaId,
                onChange: setUpdateSchemaId,
                placeholder: "2",
                description: "The new schema ID to assign",
                required: true,
              },
            ]}
            onSubmit={handleUpdateSchemaId}
            isSubmitting={isUpdatingSchema}
            submitText="Update Schema"
            submitIcon={<RotateCcw className="h-4 w-4" />}
            status={updateSchemaStatus}
          />
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
              onPress={loadRefiners}
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
                          chainId={chainId || 14800}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>{refiner.name}</TableCell>
                      <TableCell>
                        <DlpIdDisplay
                          dlpId={refiner.dlpId}
                          chainId={chainId || 14800}
                          showCopy={true}
                          showExternalLink={true}
                        />
                      </TableCell>
                      <TableCell>
                        <SchemaIdDisplay
                          schemaId={refiner.schemaId}
                          chainId={chainId || 14800}
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

  // Show loading if no vana instance
  if (!vana) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-2 text-default-500">Loading Vana SDK...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
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
        <Tab key="schemas" title="Schemas">
          {renderSchemasTab()}
        </Tab>
        <Tab key="validation" title="Schema Validation">
          <SchemaValidationTab vana={vana} chainId={chainId || 14800} />
        </Tab>
        <Tab key="advanced" title="Advanced Tools">
          {walletClient && (
            <AdvancedToolsTab
              vana={vana}
              schemas={schemas}
              walletClient={walletClient}
              chainId={chainId || 14800}
            />
          )}
        </Tab>
        <Tab key="refiners" title="Refiners">
          {renderRefinersTab()}
        </Tab>
        <Tab key="contracts" title="Contracts">
          {renderContractsTab()}
        </Tab>
      </Tabs>
    </div>
  );
}