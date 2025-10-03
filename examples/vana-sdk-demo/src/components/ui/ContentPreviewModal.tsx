import React, { useState, useEffect } from "react";
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
  /** URL to fetch content from (mutually exclusive with content) */
  url?: string;
  /** Direct content to display (mutually exclusive with url) */
  content?: string;
  /** Language for syntax highlighting */
  language?: "json" | "text" | "javascript" | "typescript";
}

/**
 * Generic modal for previewing content - either from a URL or direct content.
 * Handles IPFS URL conversion, loading states, and JSON formatting.
 *
 * @example
 * ```tsx
 * // From URL
 * <ContentPreviewModal
 *   url="ipfs://QmHash..."
 *   title="Schema Definition"
 *   language="json"
 * />
 *
 * // Direct content
 * <ContentPreviewModal
 *   content={jsonString}
 *   title="File Content"
 *   language="json"
 * />
 * ```
 */
export const ContentPreviewModal: React.FC<ContentPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  url,
  content: directContent,
  language = "json",
}) => {
  const [fetchedContent, setFetchedContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Fetch content when modal opens and URL is provided
  useEffect(() => {
    if (!isOpen || !url) {
      return;
    }

    setIsLoading(true);
    setError("");
    setFetchedContent("");

    const httpUrl = convertIpfsUrl(url);

    fetch(httpUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        // Try to parse and format as JSON if it's JSON
        if (language === "json") {
          try {
            const parsed = JSON.parse(text);
            setFetchedContent(JSON.stringify(parsed, null, 2));
          } catch {
            // Not valid JSON, use as-is
            setFetchedContent(text);
          }
        } else {
          setFetchedContent(text);
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to fetch content",
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, url, language]);

  // Use direct content or fetched content
  const displayContent = directContent ?? fetchedContent;
  const httpUrl = url ? convertIpfsUrl(url) : undefined;

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

          {!isLoading && !error && displayContent && (
            <CodeDisplay
              code={displayContent}
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
