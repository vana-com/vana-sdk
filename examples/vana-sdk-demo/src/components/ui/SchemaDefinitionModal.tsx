import React from "react";
import { Database } from "lucide-react";
import { ContentPreviewModal } from "./ContentPreviewModal";

export interface SchemaDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemaId: number;
  schemaName: string;
  definitionUrl: string;
}

/**
 * Modal for previewing schema definitions.
 * Thin wrapper around ContentPreviewModal with schema-specific branding.
 */
export const SchemaDefinitionModal: React.FC<SchemaDefinitionModalProps> = ({
  isOpen,
  onClose,
  schemaId,
  schemaName,
  definitionUrl,
}) => {
  return (
    <ContentPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Schema Definition"
      subtitle={`${schemaName} (ID: ${schemaId})`}
      icon={<Database className="h-5 w-5" />}
      url={definitionUrl}
      language="json"
    />
  );
};
