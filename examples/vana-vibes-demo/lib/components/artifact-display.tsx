import { useState } from "react";
import type { Artifact } from "@opendatalabs/vana-sdk/browser";
import { Label } from "@/components/ui/label";

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
    const path = artifact.artifact_path;
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

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <div>
      <Label className="text-sm font-medium text-gray-700 mb-2 block">
        Generated Artifacts
      </Label>
      <div className="space-y-2">
        {artifacts.map((artifact, index) => (
          <div
            key={`${artifact.artifact_path}-${index}`}
            className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm"
          >
            <div className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-sm">{artifact.name}</div>
                  <div className="text-xs text-gray-500">
                    Size: {artifact.size.toLocaleString()} bytes
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleToggleArtifact(artifact)}
                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                    type="button"
                  >
                    {expandedArtifacts.has(artifact.artifact_path)
                      ? "Hide"
                      : "View"}
                  </button>
                  <button
                    onClick={() => onDownload(artifact)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    type="button"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>

            {expandedArtifacts.has(artifact.artifact_path) && (
              <div className="border-t border-gray-200 bg-gray-50 p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto bg-white p-3 rounded border border-gray-200">
                  {loadingContents.has(artifact.artifact_path)
                    ? "Loading..."
                    : artifactContents[artifact.artifact_path] || "Loading..."}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
