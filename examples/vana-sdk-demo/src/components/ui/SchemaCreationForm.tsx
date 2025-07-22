import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Textarea,
} from "@heroui/react";
import { Plus, CheckCircle, AlertCircle, Database, Shield } from "lucide-react";
import type { VanaInstance } from "@opendatalabs/vana-sdk/browser";
import { validateSchemaDefinition } from "../../utils/schemaValidation";
import { SchemaIdDisplay } from "./SchemaIdDisplay";

export interface SchemaCreationFormProps {
  /** Vana SDK instance */
  vana: VanaInstance;

  /** Schema form data */
  schemaName: string;
  onSchemaNameChange: (name: string) => void;
  schemaType: string;
  onSchemaTypeChange: (type: string) => void;

  /** Schema creation handler */
  onCreateSchema: (data: {
    name: string;
    type: string;
    definitionUrl: string;
  }) => void;
  isCreatingSchema: boolean;
  schemaStatus: string;
  lastCreatedSchemaId: number | null;

  /** Chain ID for explorer links */
  chainId: number;

  /** Configuration */
  title?: string;
  description?: string;
  className?: string;
}

/**
 * SchemaCreationForm component - Enhanced schema creation with auto-upload functionality
 *
 * @remarks
 * This component provides an enhanced schema creation experience where users can:
 * 1. Write their schema definition directly in the UI
 * 2. Validate the schema against the metaschema
 * 3. Automatically upload the schema to IPFS
 * 4. Create the schema on the blockchain
 */
export const SchemaCreationForm: React.FC<SchemaCreationFormProps> = ({
  vana,
  schemaName,
  onSchemaNameChange,
  schemaType,
  onSchemaTypeChange,
  onCreateSchema,
  isCreatingSchema,
  schemaStatus,
  lastCreatedSchemaId,
  chainId,
  title = "Create New Schema",
  description = "Create a new data schema with automatic IPFS upload",
  className = "",
}) => {
  const [schemaDefinition, setSchemaDefinition] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: string[];
  } | null>(null);
  const [_isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /**
   * Validates the schema definition
   */
  const validateSchema = () => {
    if (!schemaDefinition.trim()) {
      setValidationResult({
        isValid: false,
        errors: ["Schema definition cannot be empty"],
      });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Parse the schema definition
      const parsedSchema = JSON.parse(schemaDefinition);

      // Validate using our schema validation utility
      const result = validateSchemaDefinition(
        parsedSchema,
        schemaName || "Untitled Schema",
      );
      setValidationResult(result);
    } catch (error) {
      setValidationResult({
        isValid: false,
        errors: [
          `Invalid JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      });
    } finally {
      setIsValidating(false);
    }
  };

  /**
   * Handles the schema creation process using the new high-level API
   */
  const handleCreateSchema = async () => {
    if (!schemaName.trim() || !schemaType.trim() || !schemaDefinition.trim()) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Use the new high-level schema creation API
      const result = await vana.schemas.create({
        name: schemaName,
        type: schemaType,
        definition: schemaDefinition,
      });

      setUploadedUrl(result.definitionUrl);
      setUploadError(null);

      // Call the callback with the new schema information
      onCreateSchema({
        name: schemaName,
        type: schemaType,
        definitionUrl: result.definitionUrl,
      });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Schema creation failed",
      );
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Checks if the form is ready for submission
   */
  const isFormReady = () => {
    return schemaName.trim() && schemaType.trim() && schemaDefinition.trim();
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-default-600">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {/* Basic Schema Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Schema Name"
              placeholder="My Data Schema"
              value={schemaName}
              onChange={(e) => onSchemaNameChange(e.target.value)}
              description="A descriptive name for your schema"
              isRequired
            />
            <Input
              label="Schema Type"
              placeholder="user_profile"
              value={schemaType}
              onChange={(e) => onSchemaTypeChange(e.target.value)}
              description="The type identifier for this schema"
              isRequired
            />
          </div>

          {/* Schema Definition */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Schema Definition</label>
              <Button
                size="sm"
                variant="flat"
                onPress={validateSchema}
                isLoading={isValidating}
                startContent={
                  !isValidating ? <Shield className="h-4 w-4" /> : undefined
                }
              >
                {isValidating ? "Validating..." : "Validate Schema"}
              </Button>
            </div>
            <Textarea
              placeholder={`{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "User's full name"
    },
    "age": {
      "type": "number",
      "minimum": 0,
      "description": "User's age"
    }
  },
  "required": ["name"]
}`}
              value={schemaDefinition}
              onChange={(e) => setSchemaDefinition(e.target.value)}
              minRows={10}
              maxRows={20}
              description="JSON Schema definition for your data structure"
              classNames={{
                input: "font-mono text-sm",
              }}
            />
          </div>

          {/* Validation Result */}
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
                    validationResult.isValid ? "text-success" : "text-danger"
                  }`}
                >
                  {validationResult.isValid
                    ? "Schema is valid"
                    : "Schema validation failed"}
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

          {/* Upload Error Display */}
          {uploadError && (
            <div className="p-3 bg-danger/10 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-danger" />
                <span className="text-sm font-medium text-danger">
                  Schema creation failed
                </span>
              </div>
              <div className="text-xs text-danger">{uploadError}</div>
            </div>
          )}

          {/* Success Display */}
          {uploadedUrl && (
            <div className="p-3 bg-success/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">
                  Schema created successfully!
                </span>
              </div>
              <div className="text-xs">
                <strong>Definition URL:</strong> {uploadedUrl}
              </div>
            </div>
          )}

          {/* Schema Status */}
          {schemaStatus && (
            <div className="p-3 bg-info/10 rounded-lg">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-info" />
                <span className="text-sm text-info">{schemaStatus}</span>
              </div>
            </div>
          )}

          {/* Create Schema Button */}
          <Button
            onPress={handleCreateSchema}
            isLoading={isCreatingSchema}
            color="primary"
            size="lg"
            className="w-full"
            isDisabled={!isFormReady()}
            startContent={
              !isCreatingSchema ? <Database className="h-4 w-4" /> : undefined
            }
          >
            {isCreatingSchema ? "Creating schema..." : "Create Schema"}
          </Button>

          {/* Success Result */}
          {lastCreatedSchemaId && (
            <div className="p-3 bg-success/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">
                  Schema created successfully!
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Schema ID:</span>
                <SchemaIdDisplay
                  schemaId={lastCreatedSchemaId}
                  chainId={chainId}
                  showCopy={true}
                  showExternalLink={true}
                />
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
};
