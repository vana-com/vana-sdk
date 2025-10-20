/**
 * Anomaly Alert Component
 * Warning banner that displays detected security anomalies
 */
"use client";

import { Card, CardBody, Button, Chip } from "@heroui/react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { Anomaly } from "../../lib/types";
import { AddressDisplay } from "../ui/AddressDisplay";
import { ContractDisplay } from "../ui/ContractDisplay";
import { RoleBadge } from "../ui/RoleBadge";

interface AnomalyAlertProps {
  anomalies: Anomaly[];
  network: "mainnet" | "moksha";
  onViewInTable?: () => void;
}

/**
 * Get color for severity
 */
function getSeverityColor(
  severity: Anomaly["severity"]
): "danger" | "warning" | "default" {
  switch (severity) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
      return "default";
  }
}

/**
 * AnomalyAlert displays security warnings
 */
export function AnomalyAlert({
  anomalies,
  network,
  onViewInTable,
}: AnomalyAlertProps) {
  const [expanded, setExpanded] = useState(false);

  if (anomalies.length === 0) {
    return null;
  }

  const displayedAnomalies = expanded ? anomalies : anomalies.slice(0, 3);
  const hasMore = anomalies.length > 3;

  // Count by severity
  const severityCounts = anomalies.reduce(
    (acc, a) => {
      acc[a.severity]++;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  return (
    <Card className="border-warning bg-warning/10 animate-fade-in">
      <CardBody className="p-6">
        <div className="flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-warning flex-shrink-0 mt-1" />

          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-warning">
                Security Anomalies Detected
              </h3>
              <div className="flex gap-2">
                {severityCounts.high > 0 && (
                  <Chip size="sm" color="danger" variant="flat">
                    {severityCounts.high} High
                  </Chip>
                )}
                {severityCounts.medium > 0 && (
                  <Chip size="sm" color="warning" variant="flat">
                    {severityCounts.medium} Medium
                  </Chip>
                )}
                {severityCounts.low > 0 && (
                  <Chip size="sm" color="default" variant="flat">
                    {severityCounts.low} Low
                  </Chip>
                )}
              </div>
            </div>

            <p className="text-sm text-foreground/80 mb-4">
              {anomalies.length} anomal{anomalies.length === 1 ? "y" : "ies"}{" "}
              found during audit. Review and verify these unexpected
              permissions.
            </p>

            <div className="space-y-3">
              {displayedAnomalies.map((anomaly, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-divider/30"
                >
                  <Chip
                    size="sm"
                    color={getSeverityColor(anomaly.severity)}
                    variant="flat"
                    className="mt-0.5"
                  >
                    {anomaly.severity}
                  </Chip>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <AddressDisplay
                        address={anomaly.address}
                        label={anomaly.label}
                        network={network}
                        showExplorer={false}
                        compact
                      />
                      <span className="text-sm text-default-500">•</span>
                      <RoleBadge
                        role={anomaly.role}
                        roleHash={anomaly.roleHash}
                        size="sm"
                      />
                      <span className="text-sm text-default-500">on</span>
                      <ContractDisplay
                        name={anomaly.contract}
                        address={anomaly.contractAddress}
                        network={network}
                        showIcon={false}
                      />
                    </div>
                    <p className="text-sm text-default-500">
                      {anomaly.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => setExpanded(!expanded)}
                  endContent={
                    expanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )
                  }
                >
                  {expanded
                    ? "Show Less"
                    : `Show ${anomalies.length - 3} More`}
                </Button>
              </div>
            )}

            {onViewInTable && (
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  color="warning"
                  variant="flat"
                  onPress={onViewInTable}
                >
                  View in Current State Table
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
