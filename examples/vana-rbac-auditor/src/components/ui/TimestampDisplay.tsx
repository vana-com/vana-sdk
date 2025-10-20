/**
 * Timestamp Display Component
 * Shows timestamps with formatted date and relative time
 */
"use client";

import { Tooltip } from "@heroui/react";
import { formatDate, getRelativeTime } from "../../lib/utils";

interface TimestampDisplayProps {
  timestamp: number; // Unix timestamp (seconds)
  showDate?: boolean;
  showRelative?: boolean;
  format?: "short" | "long";
}

/**
 * TimestampDisplay shows when events occurred
 */
export function TimestampDisplay({
  timestamp,
  showDate = true,
  showRelative = true,
  format = "short",
}: TimestampDisplayProps) {
  const date = new Date(timestamp * 1000);

  const formattedDate = format === "long"
    ? date.toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : formatDate(timestamp);

  const relativeTime = getRelativeTime(timestamp);
  const isoTimestamp = date.toISOString();

  // If showing both, stack them vertically
  if (showDate && showRelative) {
    return (
      <Tooltip content={isoTimestamp}>
        <div
          className="flex flex-col"
          aria-label={`${formattedDate}, ${relativeTime}`}
        >
          <span className="text-sm text-foreground">{formattedDate}</span>
          <span className="text-xs text-default-500">{relativeTime}</span>
        </div>
      </Tooltip>
    );
  }

  // Show only one
  const displayText = showDate ? formattedDate : relativeTime;

  return (
    <Tooltip content={isoTimestamp}>
      <span
        className="text-sm text-foreground cursor-help"
        aria-label={formattedDate}
      >
        {displayText}
      </span>
    </Tooltip>
  );
}
