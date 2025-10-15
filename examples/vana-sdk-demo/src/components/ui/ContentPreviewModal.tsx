import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
} from "@heroui/react";
import { ExternalLink, AlertCircle } from "lucide-react";
import { CodeDisplay } from "./CodeDisplay";
import { convertIpfsUrl } from "@opendatalabs/vana-sdk/browser";

export interface ContentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Icon to display in header */
  icon?: React.ReactNode;
  /** Content to display */
  content: string;
  /** Whether content is loading */
  isLoading?: boolean;
  /** Error message if content failed to load */
  error?: string;
  /** Optional URL for "Open in New Tab" button */
  sourceUrl?: string;
  /** Language for syntax highlighting */
  language?: "json" | "text" | "javascript" | "typescript";
}

/**
 * Dumb presentation component for previewing content in a modal.
 * Handles loading states, errors, and content display.
 *
 * The parent component is responsible for fetching content using appropriate SDK methods.
 *
 * @example
 * ```tsx
 * // With loading state
 * <ContentPreviewModal
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   title="Schema Definition"
 *   content=""
 *   isLoading={true}
 *   language="json"
 * />
 *
 * // With content
 * <ContentPreviewModal
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   title="Grant File"
 *   content={grantContent}
 *   sourceUrl={grantUrl}
 *   language="json"
 * />
 *
 * // With error
 * <ContentPreviewModal
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   title="Schema Definition"
 *   content=""
 *   error="Failed to load schema"
 * />
 * ```
 */
export const ContentPreviewModal: React.FC<ContentPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  content,
  isLoading = false,
  error,
  sourceUrl,
  language = "json",
}) => {
  const httpUrl = sourceUrl ? convertIpfsUrl(sourceUrl) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          {icon}
          <div>
            <div>{title}</div>
            {subtitle && (
              <div className="text-sm font-normal text-default-500">
                {subtitle}
              </div>
            )}
          </div>
        </ModalHeader>
        <ModalBody>
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading content...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-danger/10 rounded-lg border border-danger/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-danger" />
                <p className="text-sm font-medium text-danger">
                  Failed to load content
                </p>
              </div>
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {!isLoading && !error && content && (
            <CodeDisplay
              code={content}
              language={language}
              maxHeight="max-h-[60vh]"
              showCopy={true}
              wrap={false}
            />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Close
          </Button>
          {httpUrl && (
            <Button
              as="a"
              href={httpUrl}
              target="_blank"
              rel="noopener noreferrer"
              color="primary"
              startContent={<ExternalLink className="h-4 w-4" />}
            >
              Open in New Tab
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
