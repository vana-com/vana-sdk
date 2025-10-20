import React, { useState, useEffect } from "react";
import { Database } from "lucide-react";
import { ContentPreviewModal } from "./ContentPreviewModal";
import { useVana } from "@/providers/VanaProvider";

export interface SchemaDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemaId: number;
  schemaName: string;
  definitionUrl: string;
}

/**
 * Modal for previewing schema definitions.
 * Smart wrapper around ContentPreviewModal that fetches schema content using SDK.
 */
export const SchemaDefinitionModal: React.FC<SchemaDefinitionModalProps> = ({
  isOpen,
  onClose,
  schemaId,
  schemaName,
  definitionUrl,
}) => {
  const { vana } = useVana();
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !definitionUrl || !vana) {
      return;
    }

    setIsLoading(true);
    setError("");
    setContent("");

    const fetchSchemaContent = async () => {
      try {
        // Use SDK's retrieveDefinition method which handles proxy
        const schemaContent =
          await vana.schemas.retrieveDefinition(definitionUrl);
        setContent(schemaContent);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch schema definition",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSchemaContent();
  }, [isOpen, definitionUrl, vana]);

  return (
    <ContentPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Schema Definition"
      subtitle={`${schemaName} (ID: ${schemaId})`}
      icon={<Database className="h-5 w-5" />}
      content={content}
      isLoading={isLoading}
      error={error}
      sourceUrl={definitionUrl}
      language="json"
    />
  );
};
