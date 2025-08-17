import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Textarea,
  Input,
  Divider,
  Chip,
  Progress,
} from "@heroui/react";
import {
  Upload,
  FileText,
  Lock,
  CheckCircle,
  AlertCircle,
  Shield,
  Database,
} from "lucide-react";
import type { VanaInstance, Schema } from "@opendatalabs/vana-sdk/browser-wasm";
import { SchemaSelector } from "./SchemaSelector";
import { InputModeToggle } from "./InputModeToggle";
import { ExplorerLink } from "./ExplorerLink";
import { FileIdDisplay } from "./FileIdDisplay";
import { validateDataAgainstSchema } from "../../utils/schemaValidation";

export interface DataUploadFormProps {
  /** Vana SDK instance */
  vana: VanaInstance;

  /** Current input mode */
  inputMode: "text" | "file";
  onInputModeChange: (mode: "text" | "file") => void;

  /** Text data input */
  textData: string;
  onTextDataChange: (text: string) => void;

  /** File input */
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;

  /** Schema selection */
  selectedSchemaId: number | null;
  onSchemaChange: (schemaId: number | null) => void;

  /** Upload handler */
  onUpload: (data: {
    content: string;
    filename?: string;
    schemaId?: number;
    isValid?: boolean;
    validationErrors?: string[];
  }) => void;
  isUploading: boolean;

  /** Upload result */
  uploadResult: {
    fileId: number;
    transactionHash: string;
    isValid?: boolean;
    validationErrors?: string[];
  } | null;

  /** Upload error */
  uploadError: string | null;

  /** Chain ID for explorer links */
  chainId: number;

  /** Configuration options */
  showSchemaSelector?: boolean;
  showValidation?: boolean;
  allowWithoutSchema?: boolean;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * DataUploadForm component - Reusable form for uploading data with optional schema validation
 *
 * @remarks
 * This component provides a unified interface for uploading data across different contexts
 * (My Data tab, Demo Experience, etc.). It supports text/file input modes, schema selection,
 * and data validation.
 */
export const DataUploadForm: React.FC<DataUploadFormProps> = ({
  vana,
  inputMode,
  onInputModeChange,
  textData,
  onTextDataChange,
  selectedFile,
  onFileSelect,
  selectedSchemaId,
  onSchemaChange,
  onUpload,
  isUploading,
  uploadResult,
  uploadError,
  chainId,
  showSchemaSelector = true,
  showValidation = true,
  allowWithoutSchema = true,
  title = "Upload Data",
  description = "Upload text or file data to the blockchain with optional schema validation",
  className = "",
}) => {
  const [selectedSchema, setSelectedSchema] = useState<Schema | null>(null);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: string[];
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  /**
   * Handles file selection from input
   */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    onFileSelect(file);
  };

  /**
   * Validates current data against selected schema
   */
  const validateData = async () => {
    if (!selectedSchema || !showValidation) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const content =
        inputMode === "text" ? textData : (await selectedFile?.text()) || "";

      if (!content.trim()) {
        setValidationResult({
          isValid: false,
          errors: ["No data to validate"],
        });
        return;
      }

      const result = await validateDataAgainstSchema(content, selectedSchema);
      setValidationResult(result);
    } catch (error) {
      setValidationResult({
        isValid: false,
        errors: [
          `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      });
    } finally {
      setIsValidating(false);
    }
  };

  /**
   * Handles the upload process
   */
  const handleUpload = async () => {
    const content =
      inputMode === "text" ? textData : (await selectedFile?.text()) || "";

    if (!content.trim()) {
      return;
    }

    // Validate data if schema is selected and validation is enabled
    let isValid = true;
    let validationErrors: string[] = [];

    if (selectedSchema && showValidation) {
      try {
        const result = await validateDataAgainstSchema(content, selectedSchema);
        isValid = result.isValid;
        validationErrors = result.errors;
      } catch (error) {
        isValid = false;
        validationErrors = [
          `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ];
      }
    }

    onUpload({
      content,
      filename: selectedFile?.name,
      schemaId: selectedSchemaId || undefined,
      isValid,
      validationErrors,
    });
  };

  /**
   * Determines if upload is ready
   */
  const isUploadReady = () => {
    const hasData = inputMode === "text" ? textData.trim() : selectedFile;
    const hasSchemaIfRequired = allowWithoutSchema || selectedSchemaId;
    return hasData && hasSchemaIfRequired;
  };

  /**
   * Gets the current data content for display
   */
  const getCurrentContent = () => {
    return inputMode === "text" ? textData : selectedFile?.name || "";
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-default-600">{description}</p>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {/* Input Mode Toggle */}
          <div>
            <InputModeToggle
              mode={inputMode}
              onModeChange={onInputModeChange}
              disabled={isUploading}
            />
          </div>

          {/* Data Input */}
          {inputMode === "text" ? (
            <Textarea
              label="Text Data"
              placeholder="Enter your text data here..."
              value={textData}
              onChange={(e) => onTextDataChange(e.target.value)}
              minRows={4}
              maxRows={8}
              description="Enter the text data you want to upload and encrypt"
              disabled={isUploading}
            />
          ) : (
            <div>
              <Input
                type="file"
                label="Select File"
                description="Choose a file to upload and encrypt"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              {selectedFile && (
                <div className="mt-2 p-2 bg-default-50 rounded">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm">{selectedFile.name}</span>
                    <Chip size="sm" variant="flat">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </Chip>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Schema Selection */}
          {showSchemaSelector && (
            <div>
              <SchemaSelector
                vana={vana}
                selectedSchemaId={selectedSchemaId}
                onSchemaChange={(schemaId, schema) => {
                  onSchemaChange(schemaId);
                  setSelectedSchema(schema || null);
                  setValidationResult(null);
                }}
                showSchemaInfo={true}
                includeNoneOption={allowWithoutSchema}
                placeholder="Select a schema (optional)"
                disabled={isUploading}
              />
            </div>
          )}

          {/* Validation Section */}
          {showValidation && selectedSchema && (
            <div className="space-y-3">
              <Divider />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Data Validation</h4>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={validateData}
                    isLoading={isValidating}
                    isDisabled={!getCurrentContent() || isUploading}
                    startContent={
                      !isValidating ? <Shield className="h-4 w-4" /> : undefined
                    }
                  >
                    {isValidating ? "Validating..." : "Validate Data"}
                  </Button>
                </div>

                {validationResult && (
                  <div
                    className={`p-3 rounded-lg ${
                      validationResult.isValid
                        ? "bg-success/10 border border-success/20"
                        : "bg-danger/10 border border-danger/20"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {validationResult.isValid ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-danger" />
                      )}
                      <span
                        className={`text-sm font-medium ${
                          validationResult.isValid
                            ? "text-success"
                            : "text-danger"
                        }`}
                      >
                        {validationResult.isValid
                          ? "Data is valid"
                          : "Data validation failed"}
                      </span>
                    </div>
                    {validationResult.errors.length > 0 && (
                      <div className="space-y-1">
                        {validationResult.errors.map((error, index) => (
                          <div key={index} className="text-xs text-danger">
                            • {error}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Privacy Notice */}
          <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg">
            <Lock className="h-4 w-4 text-warning" />
            <div className="text-sm text-warning-600">
              <strong>Privacy guarantee:</strong> Your data will be encrypted
              before upload and only you can decrypt it with your wallet
              signature.
            </div>
          </div>

          {/* Upload Button */}
          <Button
            onPress={handleUpload}
            isLoading={isUploading}
            color="primary"
            size="lg"
            className="w-full"
            isDisabled={!isUploadReady()}
            startContent={
              !isUploading ? <Lock className="h-4 w-4" /> : undefined
            }
          >
            {isUploading
              ? "Encrypting and uploading..."
              : "Encrypt and Upload Data"}
          </Button>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <Progress
                size="sm"
                isIndeterminate
                color="primary"
                className="max-w-md"
              />
              <div className="text-xs text-default-500">
                Processing your data securely...
              </div>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="p-3 bg-success/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">
                  Data uploaded successfully!
                </span>
              </div>
              <div className="text-xs space-y-1">
                <div>
                  File ID:{" "}
                  <FileIdDisplay
                    fileId={uploadResult.fileId}
                    chainId={chainId}
                  />
                </div>
                <div>
                  Transaction:{" "}
                  <ExplorerLink
                    type="tx"
                    hash={uploadResult.transactionHash}
                    chainId={chainId}
                  />
                </div>
                {uploadResult.isValid !== undefined && (
                  <div className="flex items-center gap-1 mt-2">
                    <Database className="h-3 w-3" />
                    <span
                      className={
                        uploadResult.isValid ? "text-success" : "text-warning"
                      }
                    >
                      Schema validation:{" "}
                      {uploadResult.isValid ? "Passed" : "Failed"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="p-3 bg-danger/10 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-danger" />
                <span className="text-sm font-medium text-danger">
                  Upload failed
                </span>
              </div>
              <div className="text-xs text-danger">{uploadError}</div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
};
