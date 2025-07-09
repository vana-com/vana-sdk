// src/components/ui/FileUpload.tsx

"use client";

import React from "react";
import { Upload } from "lucide-react";

interface FileUploadProps {
  id: string;
  label: string;
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function FileUpload({
  id,
  label,
  accept,
  file,
  onFileChange,
  disabled = false,
  placeholder = "Click to select file",
  className = "",
}: FileUploadProps) {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    onFileChange(selectedFile);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="border-2 border-dashed border-input rounded-lg p-6">
        <input
          id={id}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />
        <label
          htmlFor={id}
          className={`cursor-pointer flex flex-col items-center gap-2 text-center ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">
            {file ? file.name : placeholder}
          </span>
          {file && (
            <span className="text-xs text-muted-foreground">
              Size: {(file.size / 1024).toFixed(1)} KB | Type:{" "}
              {file.type || "unknown"}
            </span>
          )}
        </label>
      </div>
    </div>
  );
}
