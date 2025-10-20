import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Address } from "viem";

interface UserFile {
  id: number;
  url: string;
  ownerAddress: Address;
  addedAtBlock: bigint;
  schemaId?: number;
  schemaName?: string;
  addedAtTimestamp?: bigint;
  transactionHash?: Address;
  dlpIds?: number[];
  dlpNames?: string[];
}

interface FileSelectorProps {
  files: UserFile[];
  selectedFileIds: number[];
  onSelectionChange: (ids: number[]) => void;
  isProcessing?: boolean;
}

export function FileSelector({
  files,
  selectedFileIds,
  onSelectionChange,
  isProcessing = false,
}: FileSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;

    const query = searchQuery.toLowerCase();
    return files.filter((file) => {
      const searchableText = [
        `file #${file.id}`,
        file.schemaName ?? "",
        file.dlpNames?.join(" ") ?? "",
        file.addedAtTimestamp
          ? new Date(Number(file.addedAtTimestamp) * 1000).toLocaleDateString()
          : "",
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [files, searchQuery]);

  const handleToggleFile = (fileId: number) => {
    if (selectedFileIds.includes(fileId)) {
      onSelectionChange(selectedFileIds.filter((id) => id !== fileId));
    } else {
      onSelectionChange([...selectedFileIds, fileId]);
    }
  };

  const handleSelectAll = () => {
    const visibleFileIds = filteredFiles.map((f) => f.id);
    const allVisible = visibleFileIds.every((id) =>
      selectedFileIds.includes(id),
    );

    if (allVisible) {
      // Deselect all visible files
      onSelectionChange(
        selectedFileIds.filter((id) => !visibleFileIds.includes(id)),
      );
    } else {
      // Select all visible files (merge with existing selection)
      const newSelection = new Set([...selectedFileIds, ...visibleFileIds]);
      onSelectionChange(Array.from(newSelection));
    }
  };

  const visibleSelectedCount = filteredFiles.filter((f) =>
    selectedFileIds.includes(f.id),
  ).length;
  const allVisibleSelected =
    visibleSelectedCount === filteredFiles.length && filteredFiles.length > 0;

  if (files.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-gray-500">No files found in your account</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium text-gray-700">
            Select Files to Process
          </Label>
          {selectedFileIds.length > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {selectedFileIds.length} file
              {selectedFileIds.length !== 1 ? "s" : ""} selected
            </span>
          )}
        </div>

        {/* Search box */}
        {files.length > 5 && (
          <div className="mb-3">
            <Input
              type="text"
              placeholder="Search by file ID, schema, DLP, or date..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setSearchQuery(e.target.value);
              }}
              className="text-sm"
              disabled={isProcessing}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleSelectAll}
            className="text-xs px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition-colors"
            type="button"
            disabled={isProcessing || filteredFiles.length === 0}
          >
            {allVisibleSelected ? "Deselect Visible" : "Select All Visible"}
          </button>
          {selectedFileIds.length > 0 && (
            <button
              onClick={() => {
                onSelectionChange([]);
              }}
              className="text-xs px-3 py-1 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded transition-colors"
              type="button"
              disabled={isProcessing}
            >
              Clear All
            </button>
          )}
          {searchQuery && (
            <span className="text-xs text-gray-500 py-1">
              Showing {filteredFiles.length} of {files.length} files
            </span>
          )}
        </div>

        {/* File list with checkboxes */}
        <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
          {filteredFiles.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No files match your search
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredFiles.map((file) => {
                const isSelected = selectedFileIds.includes(file.id);
                const date = file.addedAtTimestamp
                  ? new Date(
                      Number(file.addedAtTimestamp) * 1000,
                    ).toLocaleDateString()
                  : "Unknown date";

                return (
                  <label
                    key={file.id}
                    className={`flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        handleToggleFile(file.id);
                      }}
                      disabled={isProcessing}
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          File #{file.id}
                        </span>
                        <span className="text-xs text-gray-500">{date}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {file.schemaName && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            Schema: {file.schemaName}
                          </span>
                        )}
                        {file.dlpNames &&
                          file.dlpNames.length > 0 &&
                          file.dlpNames.map((dlpName, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"
                            >
                              DLP: {dlpName}
                            </span>
                          ))}
                        {!file.schemaName &&
                          (!file.dlpNames || file.dlpNames.length === 0) && (
                            <span className="text-xs text-gray-400 italic">
                              No metadata
                            </span>
                          )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {filteredFiles.length > 10 && (
          <div className="mt-2 text-xs text-gray-500 text-center">
            Scroll to see more files
          </div>
        )}
      </div>
    </Card>
  );
}
