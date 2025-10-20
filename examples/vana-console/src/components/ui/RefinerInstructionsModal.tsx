import React, { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import { ContentPreviewModal } from "./ContentPreviewModal";
import { useVana } from "@/providers/VanaProvider";

export interface RefinerInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  refinerId: number;
  refinerName: string;
  instructionUrl: string;
}

/**
 * Modal for viewing refiner instructions.
 * Smart wrapper around ContentPreviewModal that fetches refiner instructions using SDK.
 */
export const RefinerInstructionsModal: React.FC<
  RefinerInstructionsModalProps
> = ({ isOpen, onClose, refinerId, refinerName, instructionUrl }) => {
  const { vana } = useVana();
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !instructionUrl || !vana) {
      return;
    }

    setIsLoading(true);
    setError("");
    setContent("");

    const fetchInstructionsContent = async () => {
      try {
        // Use SDK's retrieveRefinementInstructions method which handles proxy
        const instructionsContent =
          await vana.schemas.retrieveRefinementInstructions(instructionUrl);
        setContent(instructionsContent);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch refiner instructions",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void fetchInstructionsContent();
  }, [isOpen, instructionUrl, vana]);

  return (
    <ContentPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title="Refiner Instructions"
      subtitle={`${refinerName} (ID: ${refinerId})`}
      icon={<Brain className="h-5 w-5" />}
      content={content}
      isLoading={isLoading}
      error={error}
      sourceUrl={instructionUrl}
      language="json"
    />
  );
};
