import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Textarea,
  Chip,
} from "@heroui/react";
import {
  Shield,
  CheckCircle,
  AlertCircle,
  FileText,
  Database,
  Code,
} from "lucide-react";
import type { Vana, Schema } from "@opendatalabs/vana-sdk/browser";
import { SchemaSelector } from "./SchemaSelector";
import { validateDataAgainstSchema } from "../../utils/schemaValidation";

export interface SchemaValidationTabProps {
  /** Vana SDK instance */
  vana: Vana;

  /** Chain ID for explorer links */
  chainId: number;

  /** Configuration */
  className?: string;
}

/**
 * SchemaValidationTab component - Allows developers to validate data against existing schemas
 *
 * @remarks
 * This component provides a validation testing interface where developers can:
 * 1. Select any existing schema from the blockchain
 * 2. Input test data (JSON or text)
 * 3. Validate the data against the schema
 * 4. See detailed validation results and error messages
 */
export const SchemaValidationTab: React.FC<SchemaValidationTabProps> = ({
  vana,
  chainId: _chainId,
  className = "",
}) => {
  const [selectedSchemaId, setSelectedSchemaId] = useState<number | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<Schema | null>(null);
  const [testData, setTestData] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: string[];
  } | null>(null);

  /**
   * Example data for different schema types
   */
  const getExampleData = () => {
    if (!selectedSchema) return "";

    // Try to generate meaningful example based on schema name/type
    const schemaName = selectedSchema.name.toLowerCase();
    const _schemaType = selectedSchema.type.toLowerCase();

    if (schemaName.includes("user") || schemaName.includes("profile")) {
      return JSON.stringify(
        {
          name: "John Doe",
          age: 30,
          email: "john@example.com",
          preferences: {
            theme: "dark",
            notifications: true,
          },
        },
        null,
        2,
      );
    }

    if (schemaName.includes("product") || schemaName.includes("item")) {
      return JSON.stringify(
        {
          title: "Sample Product",
          price: 29.99,
          category: "Electronics",
          inStock: true,
          tags: ["popular", "new"],
        },
        null,
        2,
      );
    }

    if (schemaName.includes("event") || schemaName.includes("log")) {
      return JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: "Sample log message",
          metadata: {
            userId: "user123",
            action: "login",
          },
        },
        null,
        2,
      );
    }

    // Generic example
    return JSON.stringify(
      {
        id: 1,
        name: "Sample Item",
        type: "example",
        active: true,
        created: new Date().toISOString(),
      },
      null,
      2,
    );
  };

  /**
   * Loads example data into the test data field
   */
  const loadExampleData = () => {
    setTestData(getExampleData());
  };

  /**
   * Validates the test data against the selected schema
   */
  const validateTestData = async () => {
    if (!selectedSchema || !testData.trim()) {
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await validateDataAgainstSchema(testData, selectedSchema);
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
   * Clears all form data
   */
  const clearForm = () => {
    setTestData("");
    setValidationResult(null);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Schema Validation</h3>
              <p className="text-sm text-default-600">
                Test data validation against existing schemas
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Schema Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h4 className="text-lg font-semibold">Select Schema</h4>
          </div>
        </CardHeader>
        <CardBody>
          <SchemaSelector
            vana={vana}
            selectedSchemaId={selectedSchemaId}
            onSchemaChange={(schemaId, schema) => {
              setSelectedSchemaId(schemaId);
              setSelectedSchema(schema || null);
              setValidationResult(null);
            }}
            showSchemaInfo={true}
            includeNoneOption={false}
            placeholder="Choose a schema to validate against..."
          />
        </CardBody>
      </Card>

      {/* Test Data Input */}
      {selectedSchema && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <h4 className="text-lg font-semibold">Test Data</h4>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  onPress={loadExampleData}
                  startContent={<Code className="h-4 w-4" />}
                >
                  Load Example
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={clearForm}
                  startContent={<AlertCircle className="h-4 w-4" />}
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <Textarea
                placeholder="Enter your test data here (JSON format)..."
                value={testData}
                onChange={(e) => setTestData(e.target.value)}
                minRows={8}
                maxRows={16}
                description="Enter JSON data to validate against the selected schema"
                classNames={{
                  input: "font-mono text-sm",
                }}
              />

              <div className="flex items-center gap-2">
                <Button
                  onPress={validateTestData}
                  isLoading={isValidating}
                  color="primary"
                  isDisabled={!testData.trim()}
                  startContent={
                    !isValidating ? <Shield className="h-4 w-4" /> : undefined
                  }
                >
                  {isValidating ? "Validating..." : "Validate Data"}
                </Button>

                {selectedSchema && (
                  <Chip
                    variant="flat"
                    color="secondary"
                    startContent={<Database className="h-3 w-3" />}
                  >
                    {selectedSchema.name}
                  </Chip>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Validation Results */}
      {validationResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <h4 className="text-lg font-semibold">Validation Results</h4>
            </div>
          </CardHeader>
          <CardBody>
            <div
              className={`p-4 rounded-lg ${
                validationResult.isValid
                  ? "bg-success/10 border border-success/20"
                  : "bg-danger/10 border border-danger/20"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                {validationResult.isValid ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-danger" />
                )}
                <span
                  className={`font-semibold ${
                    validationResult.isValid ? "text-success" : "text-danger"
                  }`}
                >
                  {validationResult.isValid
                    ? "✓ Data is valid"
                    : "✗ Validation failed"}
                </span>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-danger">
                    Validation Errors:
                  </p>
                  <div className="space-y-1">
                    {validationResult.errors.map((error, index) => (
                      <div
                        key={index}
                        className="text-sm text-danger pl-4 border-l-2 border-danger/30"
                      >
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validationResult.isValid && (
                <div className="mt-2">
                  <p className="text-sm text-success">
                    🎉 Your data conforms to the selected schema specification!
                  </p>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Help Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h4 className="text-lg font-semibold">How to Use</h4>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-primary">1</span>
              </div>
              <div>
                <p className="font-medium">Select a Schema</p>
                <p className="text-default-600">
                  Choose any existing schema from the blockchain to validate
                  against.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-primary">2</span>
              </div>
              <div>
                <p className="font-medium">Input Test Data</p>
                <p className="text-default-600">
                  Enter your JSON data or use the "Load Example" button to get
                  started.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-primary">3</span>
              </div>
              <div>
                <p className="font-medium">Validate</p>
                <p className="text-default-600">
                  Click "Validate Data" to check if your data conforms to the
                  schema.
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
