/**
 * Role Badge Component
 * Displays role name with severity-based color coding
 */
"use client";

import { Chip, Button, Tooltip } from "@heroui/react";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../../lib/utils";

interface RoleBadgeProps {
  role: string;
  roleHash?: string; // Optional full role hash
  showCopy?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * Get color for role based on severity
 */
function getRoleColor(
  role: string
): "danger" | "warning" | "primary" | "default" {
  const roleLower = role.toLowerCase();

  // High severity: Admin roles
  if (roleLower.includes("admin")) return "danger";

  // Medium severity: Owner/Pauser roles
  if (roleLower.includes("owner") || roleLower.includes("pauser"))
    return "warning";

  // Standard roles
  if (
    roleLower.includes("minter") ||
    roleLower.includes("burner") ||
    roleLower.includes("validator") ||
    roleLower.includes("default")
  ) {
    return "primary";
  }

  // Unknown roles
  return "default";
}

/**
 * Check if role is an unknown hash (full bytes32 hex string)
 */
function isUnknownRole(role: string): boolean {
  return role.startsWith("0x") && role.length === 66; // 0x + 64 chars
}

/**
 * RoleBadge displays a role with icon and color coding
 */
export function RoleBadge({ role, roleHash, showCopy = false, size = "sm" }: RoleBadgeProps) {
  const [copied, setCopied] = useState(false);

  // Auto-enable copy for unknown roles (hashes)
  const unknownRole = isUnknownRole(role);
  const shouldShowCopy = showCopy || unknownRole;

  const color = getRoleColor(role);

  const handleCopy = async () => {
    const textToCopy = roleHash || role;
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // For unknown roles, show truncated hash in badge
  const displayRole = unknownRole
    ? `${role.slice(0, 6)}...${role.slice(-4)}`
    : role;

  const badge = (
    <Chip
      variant="flat"
      color={color}
      size={size}
      classNames={{
        base: "font-mono",
        content: "font-medium",
      }}
    >
      {displayRole}
    </Chip>
  );

  if (!shouldShowCopy) {
    // If role hash is provided OR unknown role, show full hash in tooltip
    if ((roleHash && roleHash !== role) || unknownRole) {
      return (
        <Tooltip content={roleHash || role}>
          <div className="inline-flex">{badge}</div>
        </Tooltip>
      );
    }
    return badge;
  }

  // With copy button
  return (
    <div className="flex items-center gap-2">
      {(roleHash && roleHash !== role) || unknownRole ? (
        <Tooltip content={roleHash || role}>
          <div className="inline-flex">{badge}</div>
        </Tooltip>
      ) : (
        badge
      )}

      <Tooltip content={copied ? "Copied!" : "Copy role hash"}>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onPress={handleCopy}
          className="min-w-unit-6 w-unit-6 h-unit-6"
          aria-label="Copy role hash"
        >
          {copied ? (
            <Check className="h-3 w-3 text-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </Tooltip>
    </div>
  );
}
