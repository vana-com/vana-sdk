import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Textarea,
  Select,
  SelectItem,
} from "@heroui/react";
import { CheckCircle, FileCheck, AlertTriangle } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { ErrorMessage } from "./ui/ErrorMessage";
import type { Vana } from "vana-sdk";

interface SchemaValidationCardProps {
  vana: Vana | null;
}

/**
 * SchemaValidationCard - Demonstrates schema validation features
 * Shows how to validate data contracts and user data against schemas
 */
export const SchemaValidationCard: React.FC<SchemaValidationCardProps> = ({
  vana,
}) => {
  const [validationMode, setValidationMode] = useState<"contract" | "data">(
    "contract",
  );
  const [contractInput, setContractInput] = useState<string>(`{
  "name": "User Profile",
  "version": "1.0.0",
  "description": "Basic user profile schema",
  "dialect": "json",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "age": { "type": "number", "minimum": 0 },
      "email": { "type": "string", "format": "email" }
    },
    "required": ["name", "email"]
  }
}`);

  const [dataInput, setDataInput] = useState<string>(`{
  "name": "Alice Smith",
  "age": 30,
  "email": "alice@example.com"
}`);

  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    message: string;
    details?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateContract = async () => {
    if (!vana) {
      setError("Vana SDK not initialized");
      return;
    }

    setIsValidating(true);
    setError(null);
    setValidationResult(null);

    try {
      const contract = JSON.parse(contractInput);
      vana.data.validateDataContract(contract);

      setValidationResult({
        isValid: true,
        message: "✅ Data contract is valid!",
        details: `Valid ${contract.dialect} schema contract for "${contract.name}" v${contract.version}`,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "SchemaValidationError") {
        const schemaErr = err as { message: string }; // Type assertion for validation error
        setValidationResult({
          isValid: false,
          message: "❌ Data contract validation failed",
          details: schemaErr.message,
        });
      } else {
        setError(
          err instanceof Error ? err.message : "Unknown validation error",
        );
      }
    } finally {
      setIsValidating(false);
    }
  };

  const validateData = async () => {
    if (!vana) {
      setError("Vana SDK not initialized");
      return;
    }

    setIsValidating(true);
    setError(null);
    setValidationResult(null);

    try {
      const contract = JSON.parse(contractInput);
      const data = JSON.parse(dataInput);

      // First validate the contract
      vana.data.validateDataContract(contract);

      // Then validate the data against the contract
      vana.data.validateDataAgainstContract(data, contract);

      setValidationResult({
        isValid: true,
        message: "✅ Data validation successful!",
        details: "The provided data matches the schema requirements.",
      });
    } catch (err) {
      if (err instanceof Error && err.name === "SchemaValidationError") {
        const schemaErr = err as { message: string }; // Type assertion for validation error
        setValidationResult({
          isValid: false,
          message: "❌ Data validation failed",
          details: schemaErr.message,
        });
      } else {
        setError(
          err instanceof Error ? err.message : "Unknown validation error",
        );
      }
    } finally {
      setIsValidating(false);
    }
  };

  const loadExampleContract = (type: "json" | "sqlite") => {
    if (type === "json") {
      setContractInput(`{
  "name": "Instagram Export",
  "version": "1.0.0",
  "description": "Schema for Instagram profile data",
  "dialect": "json",
  "schema": {
    "type": "object",
    "properties": {
      "profile": {
        "type": "object",
        "properties": {
          "username": { "type": "string" },
          "followers": { "type": "number" },
          "verified": { "type": "boolean" }
        },
        "required": ["username"]
      },
      "posts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "likes": { "type": "number" },
            "caption": { "type": "string" }
          }
        }
      }
    },
    "required": ["profile"]
  }
}`);
      setDataInput(`{
  "profile": {
    "username": "alice_smith",
    "followers": 1500,
    "verified": false
  },
  "posts": [
    {
      "id": "post_123",
      "likes": 42,
      "caption": "Beautiful sunset! 🌅"
    }
  ]
}`);
    } else {
      setContractInput(`{
  "name": "Browsing Data Analytics",
  "version": "1.0.0",
  "description": "Schema for browsing data analytics",
  "dialect": "sqlite",
  "dialectVersion": "3",
  "schema": "CREATE TABLE users (\\n  user_id VARCHAR NOT NULL,\\n  email VARCHAR NOT NULL,\\n  name VARCHAR NOT NULL,\\n  created_at DATETIME NOT NULL,\\n  PRIMARY KEY (user_id)\\n);\\n\\nCREATE TABLE browsing_entries (\\n  entry_id INTEGER NOT NULL,\\n  user_id VARCHAR NOT NULL,\\n  url VARCHAR NOT NULL,\\n  time_spent INTEGER NOT NULL,\\n  timestamp DATETIME NOT NULL,\\n  PRIMARY KEY (entry_id),\\n  FOREIGN KEY(user_id) REFERENCES users (user_id)\\n);"
}`);
      setDataInput(
        "# SQLite schemas validate structure, not data content\n# Data validation only supported for JSON dialect",
      );
    }
  };

  return (
    <section id="schema-validation">
      <SectionHeader
        icon={<FileCheck className="h-5 w-5" />}
        title="Schema Validation"
        description={
          <>
            <em>
              Demonstrates: `validateDataContract()`,
              `validateDataAgainstContract()`
            </em>
            <br />
            Validate data contracts against the Vana meta-schema and validate
            user data against JSON schemas.
          </>
        }
      />

      <div className="mt-6 space-y-6">
        {/* Example buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="bordered"
            onPress={() => loadExampleContract("json")}
            startContent={<FileCheck className="h-4 w-4" />}
          >
            Load JSON Example
          </Button>
          <Button
            size="sm"
            variant="bordered"
            onPress={() => loadExampleContract("sqlite")}
            startContent={<FileCheck className="h-4 w-4" />}
          >
            Load SQLite Example
          </Button>
        </div>

        {/* Data Contract Input */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Data Contract</h3>
            <p className="text-sm text-default-500">
              Enter a Vana data contract to validate against the meta-schema
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <Textarea
              value={contractInput}
              onChange={(e) => setContractInput(e.target.value)}
              placeholder="Enter data contract JSON..."
              minRows={10}
              maxRows={15}
              className="font-mono text-sm"
            />
          </CardBody>
        </Card>

        {/* Validation Mode */}
        <div className="flex items-center gap-4">
          <Select
            value={validationMode}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              setValidationMode(selected as "contract" | "data");
            }}
            className="max-w-xs"
            label="Validation Mode"
          >
            <SelectItem key="contract" value="contract">
              Validate Contract Only
            </SelectItem>
            <SelectItem key="data" value="data">
              Validate Data Against Contract
            </SelectItem>
          </Select>

          <Button
            color="primary"
            onPress={
              validationMode === "contract" ? validateContract : validateData
            }
            isLoading={isValidating}
            disabled={!vana || isValidating}
          >
            {isValidating
              ? "Validating..."
              : validationMode === "contract"
                ? "Validate Contract"
                : "Validate Data"}
          </Button>
        </div>

        {/* Data Input (only for data validation mode) */}
        {validationMode === "data" && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">User Data</h3>
              <p className="text-sm text-default-500">
                Enter user data to validate against the JSON schema (only works
                with JSON dialect)
              </p>
            </CardHeader>
            <CardBody className="space-y-4">
              <Textarea
                value={dataInput}
                onChange={(e) => setDataInput(e.target.value)}
                placeholder="Enter user data JSON..."
                minRows={8}
                maxRows={12}
                className="font-mono text-sm"
              />
            </CardBody>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <ErrorMessage error={error} onDismiss={() => setError(null)} />
        )}

        {/* Validation Result */}
        {validationResult && (
          <Card
            className={
              validationResult.isValid
                ? "border-success-200 bg-success-50"
                : "border-warning-200 bg-warning-50"
            }
          >
            <CardBody className="flex flex-row items-start gap-3 p-4">
              {validationResult.isValid ? (
                <CheckCircle className="h-5 w-5 text-success-500 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-warning-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`font-medium text-sm ${validationResult.isValid ? "text-success-700" : "text-warning-700"}`}
                >
                  {validationResult.message}
                </p>
                {validationResult.details && (
                  <p
                    className={`text-sm mt-1 ${validationResult.isValid ? "text-success-600" : "text-warning-600"}`}
                  >
                    {validationResult.details}
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </section>
  );
};
