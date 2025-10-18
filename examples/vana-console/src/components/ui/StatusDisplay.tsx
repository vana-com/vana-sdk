// src/components/ui/StatusDisplay.tsx

"use client";

import React from "react";
import { Card, CardBody } from "@heroui/react";

interface StatusDisplayProps {
  status: string;
  variant?: "inline" | "card";
  className?: string;
}

export function StatusDisplay({
  status,
  variant = "inline",
  className = "",
}: StatusDisplayProps) {
  if (!status) return null;

  const getStatusType = () => {
    if (
      status.includes("❌") ||
      status.includes("Error") ||
      status.includes("Failed")
    ) {
      return "error";
    }
    if (
      status.includes("✅") ||
      status.includes("Success") ||
      status.includes("successful")
    ) {
      return "success";
    }
    return "info";
  };

  const statusType = getStatusType();

  const getColorClasses = () => {
    switch (statusType) {
      case "error":
        return "text-destructive";
      case "success":
        return "text-green-600";
      default:
        return "text-muted-foreground";
    }
  };

  const getCardColorClasses = () => {
    switch (statusType) {
      case "error":
        return "bg-destructive/10 border border-destructive/20";
      case "success":
        return "bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800";
      default:
        return "bg-muted/10 border border-muted/20";
    }
  };

  if (variant === "card") {
    return (
      <Card className={`${getCardColorClasses()} ${className}`}>
        <CardBody className="p-4">
          <p className={`text-sm ${getColorClasses()}`}>{status}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <p className={`text-sm ${getColorClasses()} ${className}`}>{status}</p>
  );
}
