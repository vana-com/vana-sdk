import React from "react";
import { Card, CardBody, Button } from "@heroui/react";
import { FileText, Image, FileJson, Maximize2 } from "lucide-react";
import NextImage from "next/image";

interface FilePreviewProps {
  content: string;
  fileName?: string;
  className?: string;
  /** Callback to open full content modal */
  onViewFull?: () => void;
}

export function FilePreview({
  content,
  fileName,
  className,
  onViewFull,
}: FilePreviewProps) {
  // Determine file type based on content or filename
  const getFileType = () => {
    if (!content) return "unknown";

    // Check if it's JSON
    try {
      JSON.parse(content);
      return "json";
    } catch {
      // Not JSON
    }

    // Check if it's an image (base64)
    if (content.startsWith("data:image/")) {
      return "image";
    }

    // Check by file extension if filename is provided
    if (fileName) {
      const ext = fileName.split(".").pop()?.toLowerCase();
      if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext ?? "")) {
        return "image";
      }
      if (["json"].includes(ext ?? "")) {
        return "json";
      }
    }

    // Default to text
    return "text";
  };

  const fileType = getFileType();

  const renderPreview = () => {
    switch (fileType) {
      case "json":
        try {
          const parsed = JSON.parse(content);
          const jsonString = JSON.stringify(parsed, null, 2);
          const isTruncated = jsonString.length > 500;
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <FileJson className="h-4 w-4" />
                  <span>JSON Preview</span>
                </div>
                {isTruncated && onViewFull && (
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={onViewFull}
                    startContent={<Maximize2 className="h-3 w-3" />}
                  >
                    View Full
                  </Button>
                )}
              </div>
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-auto max-h-32">
                {jsonString.slice(0, 500)}
                {isTruncated && "..."}
              </pre>
            </div>
          );
        } catch {
          return renderTextPreview();
        }

      case "image":
        if (content.startsWith("data:image/")) {
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Image className="h-4 w-4" />
                <span>Image Preview</span>
              </div>
              <div className="relative w-full h-32">
                <NextImage
                  src={content}
                  alt="Preview"
                  fill
                  className="object-contain rounded"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Image className="h-4 w-4" />
            <span>Image file (preview not available)</span>
          </div>
        );

      default:
        return renderTextPreview();
    }
  };

  const renderTextPreview = () => {
    const preview = content.slice(0, 200);
    const truncated = content.length > 200;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <FileText className="h-4 w-4" />
          <span>Text Preview</span>
        </div>
        <div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded">
          <p className="whitespace-pre-wrap break-words">
            {preview}
            {truncated && "..."}
          </p>
        </div>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardBody className="p-3">{renderPreview()}</CardBody>
    </Card>
  );
}
