import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Textarea,
  Select,
  SelectItem,
  Chip,
  Progress,
  RadioGroup,
  Radio,
} from "@heroui/react";
import {
  Shield,
  FileText,
  Users,
  CheckCircle,
  ArrowRight,
  AlertCircle,
  Brain,
  Sparkles,
  Lock,
  Server,
  Database,
} from "lucide-react";
import type { UserFile, Schema, Vana } from "@opendatalabs/vana-sdk";
import { StatusMessage } from "../ui/StatusMessage";
import { AddressDisplay } from "../ui/AddressDisplay";
import { FileIdDisplay } from "../ui/FileIdDisplay";
import { ExplorerLink } from "../ui/ExplorerLink";
import { EmptyState } from "../ui/EmptyState";

/**
 * Props for the DemoExperienceView component
 */
export interface DemoExperienceViewProps {
  // SDK instance
  vana: Vana;

  // Step 1: Trust server
  serverId: string;
  onServerIdChange: (value: string) => void;
  serverUrl: string;
  onServerUrlChange: (value: string) => void;
  onDiscoverReplicateServer: () => void;
  isDiscoveringServer: boolean;
  onTrustServer: () => void;
  isTrustingServer: boolean;
  trustServerError: string;
  trustedServers: Array<{
    id: string;
    url?: string;
    name?: string;
  }>;

  // Step 2: Choose data
  userFiles: (UserFile & {
    source?: "discovered" | "looked-up" | "uploaded";
  })[];
  selectedFiles: number[];
  onFileSelection: (fileId: number, selected: boolean) => void;
  newTextData: string;
  onNewTextDataChange: (text: string) => void;
  onUploadNewText: () => void;
  isUploadingNewText: boolean;
  newTextUploadResult: { fileId: number; transactionHash: string } | null;

  // Step 3: Grant permission
  onGrantPermission: () => void;
  isGranting: boolean;
  grantStatus: string;
  grantTxHash: string;
  applicationAddress: string;

  // Step 4: Run LLM
  onRunLLM: (permissionId: string) => void;
  isRunningLLM: boolean;
  llmResult: unknown;
  llmError: string;
  lastUsedPermissionId: string;

  // Chain info
  chainId: number;
}

/**
 * Demo experience view component - the hero flow that delivers the "Aha!" moment
 *
 * @remarks
 * This component provides the flagship demonstration of the Vana SDK's capabilities
 * through a carefully crafted 4-step journey that showcases user-owned data
 * and privacy-preserving permissions.
 *
 * The flow is designed to be lean, guided, and deliver maximum impact by showing
 * how a user can maintain control over their data while enabling AI processing.
 *
 * @param props - The component props
 * @returns The rendered demo experience view
 */
export function DemoExperienceView({
  vana,
  serverId,
  onServerIdChange: _onServerIdChange,
  serverUrl: _serverUrl,
  onServerUrlChange: _onServerUrlChange,
  onDiscoverReplicateServer,
  isDiscoveringServer,
  onTrustServer,
  isTrustingServer,
  trustServerError,
  trustedServers,
  userFiles,
  selectedFiles,
  onFileSelection,
  newTextData,
  onNewTextDataChange,
  onUploadNewText,
  isUploadingNewText,
  newTextUploadResult,
  onGrantPermission,
  isGranting,
  grantStatus,
  grantTxHash,
  applicationAddress,
  onRunLLM,
  isRunningLLM,
  llmResult,
  llmError,
  lastUsedPermissionId,
  chainId,
}: DemoExperienceViewProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [dataChoice, setDataChoice] = useState<"new" | "existing">("new");
  const [selectedTrustedServer, setSelectedTrustedServer] =
    useState<string>("");
  const [fileSchemas, setFileSchemas] = useState<Map<number, Schema>>(
    new Map(),
  );

  // Fetch schema information for files that have schema IDs
  useEffect(() => {
    const fetchSchemas = async () => {
      const schemaMap = new Map<number, Schema>();

      for (const file of userFiles) {
        const schemaId =
          "schemaId" in file ? (file.schemaId as number) : undefined;
        if (
          schemaId &&
          typeof schemaId === "number" &&
          !fileSchemas.has(schemaId)
        ) {
          try {
            const schema = await vana.data.getSchema(schemaId);
            schemaMap.set(schemaId, schema);
          } catch (error) {
            console.warn(`Failed to fetch schema ${schemaId}:`, error);
          }
        }
      }

      if (schemaMap.size > 0) {
        setFileSchemas((prev) => new Map([...prev, ...schemaMap]));
      }
    };

    if (userFiles.length > 0) {
      fetchSchemas();
    }
  }, [userFiles, vana, fileSchemas]);

  // Determine step completion status
  const isStep1Complete = trustedServers.length > 0 && selectedTrustedServer;
  const isStep2Complete =
    (dataChoice === "new" && newTextUploadResult) ||
    (dataChoice === "existing" && selectedFiles.length > 0);
  const isStep3Complete = grantTxHash && lastUsedPermissionId;
  const isStep4Complete = Boolean(llmResult && !llmError);

  /**
   * Handles moving to the next step
   */
  const handleNextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  /**
   * Handles the trust server action with one-click setup
   */
  const handleTrustServerWithSetup = async () => {
    await onDiscoverReplicateServer();
    if (serverId && _serverUrl) {
      await onTrustServer();
      // Auto-select the server that was just trusted
      setSelectedTrustedServer(serverId);
    }
  };

  /**
   * Handles the LLM execution with the predefined prompt
   */
  const handleRunLLM = () => {
    if (lastUsedPermissionId) {
      onRunLLM(lastUsedPermissionId);
    }
  };

  /**
   * Renders the step indicator
   */
  const renderStepIndicator = () => {
    const steps = [
      { number: 1, title: "Trust Server", completed: isStep1Complete },
      { number: 2, title: "Choose Data", completed: isStep2Complete },
      { number: 3, title: "Grant Permission", completed: isStep3Complete },
      { number: 4, title: "Generate Profile", completed: isStep4Complete },
    ];

    return (
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  step.completed
                    ? "bg-success text-success-foreground border-success"
                    : currentStep === step.number
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-default-100 text-default-500 border-default-200"
                }`}
              >
                {step.completed ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-semibold">{step.number}</span>
                )}
              </div>
              <div className="text-center">
                <div className="text-sm font-medium">{step.title}</div>
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-default-400" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  /**
   * Renders step 1: Trust a server
   */
  const renderStep1 = () => (
    <Card className={currentStep === 1 ? "border-primary" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Step 1: Trust a Server</h3>
          {isStep1Complete && <CheckCircle className="h-5 w-5 text-success" />}
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <p className="text-sm text-default-600">
            Trust a server to securely process your data without exposing it to
            others.
          </p>

          {trustedServers.length === 0 ? (
            <div className="space-y-4">
              <Button
                onPress={handleTrustServerWithSetup}
                isLoading={isDiscoveringServer || isTrustingServer}
                color="primary"
                size="lg"
                className="w-full"
                startContent={<Server className="h-5 w-5" />}
              >
                {isDiscoveringServer || isTrustingServer
                  ? "Setting up server..."
                  : "One-Click Setup: Trust Replicate Server"}
              </Button>

              {trustServerError && (
                <div className="text-sm text-danger">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  {trustServerError}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-success/10 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">
                    Server trusted successfully!
                  </span>
                </div>
                <div className="text-xs text-success-600">
                  You can now securely process data through this server.
                </div>
              </div>

              <Select
                label="Select trusted server"
                placeholder="Choose a server"
                selectedKeys={
                  selectedTrustedServer ? [selectedTrustedServer] : []
                }
                onSelectionChange={(keys) => {
                  const serverId = Array.from(keys)[0] as string;
                  setSelectedTrustedServer(serverId);
                }}
              >
                {trustedServers.map((server) => (
                  <SelectItem key={server.id}>
                    {server.name || server.id}
                  </SelectItem>
                ))}
              </Select>

              {isStep1Complete && (
                <Button
                  onPress={handleNextStep}
                  color="primary"
                  endContent={<ArrowRight className="h-4 w-4" />}
                >
                  Continue to Data Selection
                </Button>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );

  /**
   * Renders step 2: Choose your data
   */
  const renderStep2 = () => (
    <Card className={currentStep === 2 ? "border-primary" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Step 2: Choose Your Data</h3>
          {isStep2Complete && <CheckCircle className="h-5 w-5 text-success" />}
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <p className="text-sm text-default-600">
            Provide some personal data for AI analysis. This data will be
            encrypted and only the trusted server can access it.
          </p>

          <RadioGroup
            value={dataChoice}
            onValueChange={(value) =>
              setDataChoice(value as "new" | "existing")
            }
            orientation="horizontal"
            className="mb-4"
          >
            <Radio value="new">Add New Text</Radio>
            <Radio value="existing">Select Existing File</Radio>
          </RadioGroup>

          {dataChoice === "new" ? (
            <div className="space-y-4">
              <Textarea
                label="Personal Data"
                placeholder="Write something personal... a journal entry, your thoughts, or anything that represents you."
                value={newTextData}
                onChange={(e) => onNewTextDataChange(e.target.value)}
                minRows={4}
                maxRows={8}
                description="This will be encrypted and registered on-chain before processing."
              />

              <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg">
                <Lock className="h-4 w-4 text-warning" />
                <div className="text-sm text-warning-600">
                  <strong>Privacy guarantee:</strong> Your data is encrypted
                  before upload and only the trusted server you authorized can
                  decrypt it.
                </div>
              </div>

              {newTextUploadResult ? (
                <div className="p-3 bg-success/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-success">
                      Data uploaded and encrypted!
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      File ID:{" "}
                      <FileIdDisplay
                        fileId={newTextUploadResult.fileId}
                        chainId={chainId}
                      />
                    </div>
                    <div>
                      Transaction:{" "}
                      <ExplorerLink
                        type="tx"
                        hash={newTextUploadResult.transactionHash}
                        chainId={chainId}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  onPress={onUploadNewText}
                  isLoading={isUploadingNewText}
                  color="primary"
                  isDisabled={!newTextData.trim()}
                  startContent={<Lock className="h-4 w-4" />}
                >
                  {isUploadingNewText
                    ? "Encrypting and uploading..."
                    : "Encrypt and Upload Data"}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {userFiles.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title="No files found"
                  description="You need to upload some files first. Switch to 'Add New Text' to create data for this demo."
                />
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium mb-2">
                    Select files to use ({selectedFiles.length} selected):
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {userFiles.slice(0, 5).map((file) => {
                      const schemaId =
                        "schemaId" in file
                          ? (file.schemaId as number)
                          : undefined;
                      const schema =
                        schemaId && typeof schemaId === "number"
                          ? fileSchemas.get(schemaId)
                          : null;

                      return (
                        <div
                          key={file.id}
                          className={`p-2 border rounded cursor-pointer transition-colors ${
                            selectedFiles.includes(file.id)
                              ? "border-primary bg-primary/5"
                              : "border-default-200 hover:bg-default-50"
                          }`}
                          onClick={() =>
                            onFileSelection(
                              file.id,
                              !selectedFiles.includes(file.id),
                            )
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              <span className="text-sm">File {file.id}</span>
                              {file.source && (
                                <Chip size="sm" variant="flat">
                                  {file.source}
                                </Chip>
                              )}
                              {schema && (
                                <Chip
                                  size="sm"
                                  variant="flat"
                                  color="secondary"
                                  startContent={
                                    <Database className="h-3 w-3" />
                                  }
                                >
                                  {schema.name}
                                </Chip>
                              )}
                            </div>
                            {selectedFiles.includes(file.id) && (
                              <CheckCircle className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          {schema && (
                            <div className="mt-1 text-xs text-default-500">
                              Schema: {schema.type}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {isStep2Complete && (
            <Button
              onPress={handleNextStep}
              color="primary"
              endContent={<ArrowRight className="h-4 w-4" />}
            >
              Continue to Grant Permission
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );

  /**
   * Renders step 3: Grant permission
   */
  const renderStep3 = () => (
    <Card className={currentStep === 3 ? "border-primary" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Step 3: Grant Permission</h3>
          {isStep3Complete && <CheckCircle className="h-5 w-5 text-success" />}
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <p className="text-sm text-default-600">
            Grant this demo application permission to use your data via the
            trusted server.
          </p>

          <div className="p-3 bg-primary/10 rounded-lg">
            <div className="text-sm font-medium text-primary mb-2">
              Permission Details:
            </div>
            <div className="text-xs space-y-1">
              <div>
                <strong>Operation:</strong> AI personality profile generation
              </div>
              <div>
                <strong>Data:</strong>{" "}
                {dataChoice === "new"
                  ? "Your new text data"
                  : `${selectedFiles.length} selected files`}
              </div>
              <div>
                <strong>Server:</strong> {selectedTrustedServer}
              </div>
              {applicationAddress && (
                <div>
                  <strong>Grantee:</strong>{" "}
                  <AddressDisplay
                    address={applicationAddress}
                    truncate={true}
                  />
                </div>
              )}
            </div>
          </div>

          {grantStatus && <StatusMessage status={grantStatus} />}

          {grantTxHash ? (
            <div className="p-3 bg-success/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">
                  Permission granted successfully!
                </span>
              </div>
              <div className="text-xs">
                Transaction:{" "}
                <ExplorerLink type="tx" hash={grantTxHash} chainId={chainId} />
              </div>
            </div>
          ) : (
            <Button
              onPress={onGrantPermission}
              isLoading={isGranting}
              color="primary"
              isDisabled={!isStep1Complete || !isStep2Complete}
              startContent={<Users className="h-4 w-4" />}
            >
              {isGranting ? "Granting permission..." : "Grant Permission"}
            </Button>
          )}

          {isStep3Complete && (
            <Button
              onPress={handleNextStep}
              color="primary"
              endContent={<ArrowRight className="h-4 w-4" />}
            >
              Continue to Generate Profile
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );

  /**
   * Renders step 4: The payoff
   */
  const renderStep4 = () => (
    <Card className={currentStep === 4 ? "border-primary" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Step 4: Generate AI Profile</h3>
          {isStep4Complete && <CheckCircle className="h-5 w-5 text-success" />}
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <p className="text-sm text-default-600">
            <strong>The moment you've been waiting for:</strong> Generate a
            comprehensive personality profile from your private data.
          </p>

          <div className="p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-600">
                AI Prompt: "Generate a personality profile based on the
                following text."
              </span>
            </div>
            <div className="text-xs text-purple-600">
              This insight will be generated using your private data, accessible
              only to you and the trusted server.
            </div>
          </div>

          {llmError && (
            <div className="p-3 bg-danger/10 rounded-lg border border-danger-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-danger" />
                <span className="text-sm font-medium text-danger">
                  Error generating profile
                </span>
              </div>
              <div className="text-xs text-danger">{llmError}</div>
            </div>
          )}

          {llmResult ? (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-semibold text-blue-600">
                    Your AI-Generated Personality Profile
                  </span>
                </div>
                <div className="prose prose-sm max-w-none">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {typeof llmResult === "string"
                      ? llmResult
                      : JSON.stringify(llmResult, null, 2)}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-success/10 rounded-lg">
                <div className="text-sm font-medium text-success mb-1">
                  🎉 Congratulations! You've experienced the power of Vana:
                </div>
                <ul className="text-xs text-success-600 space-y-1">
                  <li>• Your data remained private and encrypted</li>
                  <li>• Only the trusted server could access it</li>
                  <li>• You maintained full control over permissions</li>
                  <li>• AI generated personalized insights just for you</li>
                </ul>
              </div>
            </div>
          ) : (
            <Button
              onPress={handleRunLLM}
              isLoading={isRunningLLM}
              color="primary"
              size="lg"
              className="w-full"
              isDisabled={!isStep3Complete}
              startContent={<Brain className="h-5 w-5" />}
            >
              {isRunningLLM
                ? "Generating your profile..."
                : "Generate My AI Personality Profile"}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          AI Profile Demo
        </h1>
        <p className="text-lg text-default-600 max-w-2xl mx-auto">
          Experience the power of user-owned data. Generate AI insights while
          maintaining complete control over your privacy.
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="mb-8">
        <Progress
          value={(currentStep / 4) * 100}
          className="max-w-md mx-auto"
          color="primary"
          aria-label={`Demo progress: Step ${currentStep} of 4 (${Math.round((currentStep / 4) * 100)}% complete)`}
        />
      </div>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Steps */}
      <div className="space-y-6 max-w-2xl mx-auto">
        {currentStep >= 1 && renderStep1()}
        {currentStep >= 2 && renderStep2()}
        {currentStep >= 3 && renderStep3()}
        {currentStep >= 4 && renderStep4()}
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-default-500 mt-12">
        <p>
          This demo showcases the Vana network's privacy-preserving data
          processing capabilities.
          <br />
          Your data is encrypted, your permissions are explicit, and you
          maintain full control.
        </p>
      </div>
    </div>
  );
}
