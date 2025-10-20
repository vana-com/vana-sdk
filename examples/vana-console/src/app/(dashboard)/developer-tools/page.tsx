"use client";

import React, { useMemo } from "react";
import { useChainId } from "wagmi";
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
} from "lucide-react";
import { FormBuilder } from "@/components/ui/FormBuilder";
import { EmptyState } from "@/components/ui/EmptyState";
import { SchemaIdDisplay } from "@/components/ui/SchemaIdDisplay";
import { RefinerIdDisplay } from "@/components/ui/RefinerIdDisplay";
import { DlpIdDisplay } from "@/components/ui/DlpIdDisplay";
import { SchemaCreationForm } from "@/components/ui/SchemaCreationForm";
import { SchemaValidationTab } from "@/components/ui/SchemaValidationTab";
import { SchemaDefinitionModal } from "@/components/ui/SchemaDefinitionModal";
import { RefinerInstructionsModal } from "@/components/ui/RefinerInstructionsModal";
import { TransactionOptionsDemo } from "@/components/demo/TransactionOptionsDemo";
import { GranteesTab } from "./components/GranteesTab";
import { useSchemasAndRefiners } from "@/hooks/useSchemasAndRefiners";
import { useGrantees } from "@/hooks/useGrantees";
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
    schemaDefinition,
    isCreatingSchema,
    schemaStatus,
    lastCreatedSchemaId,

    // Refiners state
    refiners,
    isLoadingRefiners,

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
    setSchemaDefinition,
    setRefinerName,
    setRefinerDlpId,
    setRefinerSchemaId,
    setRefinerInstructionUrl,
    setUpdateRefinerId,
    setUpdateSchemaId,
  } = useSchemasAndRefiners();

  // Use custom hook for grantees management
  const {
    grantees,
    granteesTotal,
    isLoadingGrantees,
    isAddingGrantee,
    isRemoving,
    addGranteeError,
    ownerAddress,
    granteeAddress,
    granteePublicKey,
    loadGrantees,
    handleAddGrantee,
    handleRemoveGrantee,
    setOwnerAddress,
    setGranteeAddress,
    setGranteePublicKey,
  } = useGrantees();

  const [activeTab, setActiveTab] = React.useState("schemas");

  // Schema definition modal state
  const [schemaModalOpen, setSchemaModalOpen] = React.useState(false);
  const [selectedSchemaForModal, setSelectedSchemaForModal] = React.useState<{
    id: number;
    name: string;
    definitionUrl: string;
  } | null>(null);

  // Refiner instructions modal state
  const [refinerModalOpen, setRefinerModalOpen] = React.useState(false);
  const [selectedRefinerForModal, setSelectedRefinerForModal] = React.useState<{
    id: number;
    name: string;
    instructionUrl: string;
  } | null>(null);

  // Schemas pagination state
  const [schemasCurrentPage, setSchemasCurrentPage] = React.useState(1);
  const SCHEMAS_PER_PAGE = 10;

  // Refiners pagination state
  const [refinersCurrentPage, setRefinersCurrentPage] = React.useState(1);
  const REFINERS_PER_PAGE = 10;

  // Grantees pagination state
  const [granteesCurrentPage, setGranteesCurrentPage] = React.useState(1);
  const GRANTEES_PER_PAGE = 10;

  React.useEffect(() => {
    console.log("🟢 [DeveloperTools] useEffect FIRED", {
      activeTab,
      hasVana: !!vana,
      schemasCurrentPage,
      granteesCurrentPage,
    });

    if (vana) {
      if (activeTab === "schemas") {
        console.log("🟢 [DeveloperTools] Loading schemas");
        void loadSchemas(schemasCurrentPage, SCHEMAS_PER_PAGE);
      } else if (activeTab === "refiners") {
        console.log("🟢 [DeveloperTools] Loading refiners");
        void loadRefiners();
      } else if (activeTab === "grantees") {
        console.log("🟢 [DeveloperTools] Loading grantees");
        void loadGrantees(granteesCurrentPage, GRANTEES_PER_PAGE);
      }
    }
  }, [
    activeTab,
    vana,
    schemasCurrentPage,
    granteesCurrentPage,
    loadSchemas,
    loadRefiners,
    loadGrantees,
    SCHEMAS_PER_PAGE,
    GRANTEES_PER_PAGE,
  ]);

  // Calculate paginated refiners
  const paginatedRefiners = useMemo(() => {
    const startIndex = (refinersCurrentPage - 1) * REFINERS_PER_PAGE;
    const endIndex = startIndex + REFINERS_PER_PAGE;
    return refiners.slice(startIndex, endIndex);
  }, [refiners, refinersCurrentPage, REFINERS_PER_PAGE]);

  const schemaTotalPages = Math.ceil(schemasCount / SCHEMAS_PER_PAGE);
  const refinersTotalPages = Math.ceil(refiners.length / REFINERS_PER_PAGE);
  const granteesTotalPages = Math.ceil(granteesTotal / GRANTEES_PER_PAGE);

  // Reset to first page when count changes
  React.useEffect(() => {
    setSchemasCurrentPage(1);
  }, [schemasCount]);

  React.useEffect(() => {
    setRefinersCurrentPage(1);
  }, [refiners.length]);

  React.useEffect(() => {
    setGranteesCurrentPage(1);
  }, [granteesTotal]);

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
          schemaDefinition={schemaDefinition}
          onSchemaDefinitionChange={setSchemaDefinition}
          onCreateSchema={handleCreateSchema}
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
                  {schemasCount} schemas available
                </p>
              </div>
            </div>
            <Button
              onPress={() => loadSchemas(schemasCurrentPage, SCHEMAS_PER_PAGE)}
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
                  {schemas.map((schema) => (
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
                      <TableCell>{schema.dialect}</TableCell>
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
                          size="sm"
                          variant="flat"
                          onPress={() => {
                            setSelectedSchemaForModal({
                              id: schema.id,
                              name: schema.name,
                              definitionUrl: schema.definitionUrl,
                            });
                            setSchemaModalOpen(true);
                          }}
                          startContent={<ExternalLink className="h-3 w-3" />}
                        >
                          View Definition
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {schemasCount > SCHEMAS_PER_PAGE && (
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
                          size="sm"
                          variant="flat"
                          onPress={() => {
                            setSelectedRefinerForModal({
                              id: refiner.id,
                              name: refiner.name,
                              instructionUrl: refiner.refinementInstructionUrl,
                            });
                            setRefinerModalOpen(true);
                          }}
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

  // Layout handles wallet connection and VanaProvider initialization

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Developer Tools
        </h1>
        <p className="text-lg text-default-600">Build on Vana</p>
      </div>

      {/* Tabs */}
      <Tabs
        aria-label="Developer tools tabs"
        selectedKey={activeTab}
        onSelectionChange={(key) => {
          setActiveTab(key as string);
        }}
        className="w-full"
      >
        <Tab key="schemas" title="Schemas">
          {renderSchemasTab()}
          {vana && (
            <div className="mt-6">
              <SchemaValidationTab vana={vana} chainId={chainId || 14800} />
            </div>
          )}
        </Tab>
        <Tab key="refiners" title="Refiners">
          {renderRefinersTab()}
        </Tab>
        <Tab key="grantees" title="Grantees">
          <GranteesTab
            grantees={grantees}
            granteesTotal={granteesTotal}
            isLoadingGrantees={isLoadingGrantees}
            isAddingGrantee={isAddingGrantee}
            isRemoving={isRemoving}
            addGranteeError={addGranteeError}
            ownerAddress={ownerAddress}
            granteeAddress={granteeAddress}
            granteePublicKey={granteePublicKey}
            currentPage={granteesCurrentPage}
            totalPages={granteesTotalPages}
            perPage={GRANTEES_PER_PAGE}
            onOwnerAddressChange={setOwnerAddress}
            onGranteeAddressChange={setGranteeAddress}
            onGranteePublicKeyChange={setGranteePublicKey}
            onAddGrantee={handleAddGrantee}
            onRefreshGrantees={() =>
              loadGrantees(granteesCurrentPage, GRANTEES_PER_PAGE)
            }
            onRemoveGrantee={handleRemoveGrantee}
            onPageChange={setGranteesCurrentPage}
          />
        </Tab>
        <Tab key="transaction-options" title="Transaction Options">
          <TransactionOptionsDemo />
        </Tab>
      </Tabs>

      {/* Schema Definition Modal */}
      {selectedSchemaForModal && (
        <SchemaDefinitionModal
          isOpen={schemaModalOpen}
          onClose={() => {
            setSchemaModalOpen(false);
            setSelectedSchemaForModal(null);
          }}
          schemaId={selectedSchemaForModal.id}
          schemaName={selectedSchemaForModal.name}
          definitionUrl={selectedSchemaForModal.definitionUrl}
        />
      )}

      {/* Refiner Instructions Modal */}
      {selectedRefinerForModal && (
        <RefinerInstructionsModal
          isOpen={refinerModalOpen}
          onClose={() => {
            setRefinerModalOpen(false);
            setSelectedRefinerForModal(null);
          }}
          refinerId={selectedRefinerForModal.id}
          refinerName={selectedRefinerForModal.name}
          instructionUrl={selectedRefinerForModal.instructionUrl}
        />
      )}
    </div>
  );
}
