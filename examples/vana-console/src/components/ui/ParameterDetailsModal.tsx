import React from "react";
import { Eye } from "lucide-react";
import { ContentPreviewModal } from "./ContentPreviewModal";

export interface ParameterDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  parameters: unknown;
  permissionId: string | number;
}

/**
 * Modal for viewing permission parameter details.
 * Thin wrapper around ContentPreviewModal with parameter-specific branding.
 */
export const ParameterDetailsModal: React.FC<ParameterDetailsModalProps> = ({
  isOpen,
  onClose,
  parameters,
  permissionId,
}) => {
  // Convert parameters to formatted JSON string
  const content =
    parameters === null
      ? "None"
      : typeof parameters === "string"
        ? parameters
        : JSON.stringify(parameters, null, 2);

  return (
    <ContentPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Parameter Details"
      subtitle={`Permission ID: ${permissionId}`}
      icon={<Eye className="h-5 w-5" />}
      content={content}
      isLoading={false}
      language="json"
    />
  );
};
