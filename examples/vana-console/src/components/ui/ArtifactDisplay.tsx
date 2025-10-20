import { useState } from "react";
import type { Artifact } from "@opendatalabs/vana-sdk/browser";
import { Card, CardBody, CardHeader, Button } from "@heroui/react";
import { ExternalLink, ChevronDown, ChevronUp, Download } from "lucide-react";

interface ArtifactDisplayProps {
  artifacts: Artifact[];
  operationId?: string;
  onDownload: (artifact: Artifact) => Promise<void>;
  onFetchContent: (artifact: Artifact) => Promise<string>;
}

export function ArtifactDisplay({
  artifacts,
  onDownload,
  onFetchContent,
}: ArtifactDisplayProps) {
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(
    new Set(),
  );
  const [artifactContents, setArtifactContents] = useState<
    Record<string, string>
  >({});
  const [loadingContents, setLoadingContents] = useState<Set<string>>(
    new Set(),
  );

  const handleToggleArtifact = async (artifact: Artifact) => {
    const path = artifact.path;
    const isExpanded = expandedArtifacts.has(path);

    if (isExpanded) {
      // Remove from expanded
      setExpandedArtifacts((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      // Add to expanded
      setExpandedArtifacts((prev) => new Set(prev).add(path));

      // Fetch content if not cached
      if (!artifactContents[path] && !loadingContents.has(path)) {
        setLoadingContents((prev) => new Set(prev).add(path));
        try {
          const content = await onFetchContent(artifact);
          setArtifactContents((prev) => ({
            ...prev,
            [path]: content,
          }));
        } catch (error) {
          console.error("Error fetching artifact content:", error);
          setArtifactContents((prev) => ({
            ...prev,
            [path]: "Error loading artifact content",
          }));
        } finally {
          setLoadingContents((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }
    }
  };

  const handleOpenInNewTab = async (artifact: Artifact) => {
    const path = artifact.path;
    let content = artifactContents[path];

    // Fetch content if not cached
    if (!content) {
      try {
        content = await onFetchContent(artifact);
        setArtifactContents((prev) => ({
          ...prev,
          [path]: content,
        }));
      } catch (error) {
        console.error("Error fetching artifact content:", error);
        return;
      }
    }

    // Open content in new tab
    const newWindow = window.open("", "_blank");
    if (newWindow) {
      newWindow.document.write(content);
      newWindow.document.close();
    }
  };

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Generated Artifacts</h3>
      </CardHeader>
      <CardBody className="space-y-3">
        {artifacts.map((artifact, index) => {
          const isExpanded = expandedArtifacts.has(artifact.path);
          const isLoading = loadingContents.has(artifact.path);
          const artifactName = artifact.path.split("/").pop() ?? artifact.path;
          const isHtml =
            (artifact.content_type?.includes("html") ?? false) ||
            artifactName.toLowerCase().endsWith(".html");

          return (
            <Card
              key={`${artifact.path}-${index}`}
              className="border border-default-200"
            >
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {artifactName}
                      </span>
                      {isHtml && (
                        <span className="px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-full">
                          HTML
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-default-500 mt-1">
                      Size: {artifact.size.toLocaleString()} bytes
                      {artifact.content_type && ` • ${artifact.content_type}`}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {isHtml && (
                      <Button
                        size="sm"
                        variant="flat"
                        color="secondary"
                        onPress={() => {
                          void handleOpenInNewTab(artifact);
                        }}
                        startContent={<ExternalLink className="h-3 w-3" />}
                      >
                        Open
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        void handleToggleArtifact(artifact);
                      }}
                      startContent={
                        isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      }
                      isLoading={isLoading}
                    >
                      {isExpanded ? "Hide" : isHtml ? "Preview" : "View"}
                    </Button>
                    <Button
                      size="sm"
                      color="primary"
                      onPress={() => {
                        void onDownload(artifact);
                      }}
                      startContent={<Download className="h-3 w-3" />}
                    >
                      Download
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-default-200 pt-3">
                    {isLoading ? (
                      <div className="text-sm text-default-500">Loading...</div>
                    ) : isHtml ? (
                      // Render HTML artifacts in an iframe
                      <iframe
                        srcDoc={artifactContents[artifact.path] || ""}
                        className="w-full min-h-96 max-h-[600px] bg-background rounded border border-default-200"
                        sandbox="allow-scripts allow-same-origin"
                        title={artifactName}
                      />
                    ) : (
                      // Render non-HTML artifacts as plain text
                      <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto bg-default-50 p-3 rounded border border-default-200">
                        {artifactContents[artifact.path] || "Loading..."}
                      </pre>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </CardBody>
    </Card>
  );
}
