import React, { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import { ContentPreviewModal } from "./ContentPreviewModal";
import { useVana } from "@/providers/VanaProvider";

export interface PermissionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissionId: string | number;
  grantUrl: string;
}

/**
 * Modal for previewing permission grant details.
 * Smart wrapper around ContentPreviewModal that fetches grant content using SDK.
 */
export const PermissionDetailsModal: React.FC<PermissionDetailsModalProps> = ({
  isOpen,
  onClose,
  permissionId,
  grantUrl,
}) => {
  const { vana } = useVana();
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !grantUrl || !vana) {
      return;
    }

    setIsLoading(true);
    setError("");
    setContent("");

    const fetchGrantContent = async () => {
      try {
        // Use SDK's retrieveGrantFile method which handles proxy
        const grantFile = await vana.permissions.retrieveGrantFile(grantUrl);
        const grantContent = JSON.stringify(grantFile, null, 2);
        setContent(grantContent);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch grant content",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void fetchGrantContent();
  }, [isOpen, grantUrl, vana]);

  return (
    <ContentPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Permission Details"
      subtitle={`Permission ID: ${permissionId}`}
      icon={<Shield className="h-5 w-5" />}
      content={content}
      isLoading={isLoading}
      error={error}
      sourceUrl={grantUrl}
      language="json"
    />
  );
};
