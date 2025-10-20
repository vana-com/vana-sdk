/**
 * Stats Cards Component
 * Displays audit summary metrics in card grid
 */
import { Card, CardBody } from "@heroui/react";
import type { AuditStats } from "../../lib/types";
import { formatNumber } from "../../lib/utils";

interface StatsCardsProps {
  stats: AuditStats;
  isLoading?: boolean;
}

/**
 * StatsCards displays key metrics from audit
 */
export function StatsCards({ stats, isLoading = false }: StatsCardsProps) {
  const cards = [
    {
      value: stats.activePermissions,
      label: "Active Permissions",
      color: "text-primary",
    },
    {
      value: stats.historicalEvents,
      label: "Historical Events",
      color: "text-secondary",
    },
    {
      value: stats.uniqueRoles,
      label: "Unique Roles",
      color: "text-accent",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card, index) => (
        <Card
          key={index}
          className="border-divider/30 bg-content2/20"
        >
          <CardBody className="p-4">
            <div className="flex flex-col">
              <div className={`text-3xl font-bold ${card.color} tabular-nums`}>
                {isLoading ? (
                  <div className="h-9 w-16 bg-content2 animate-pulse rounded" />
                ) : (
                  formatNumber(card.value)
                )}
              </div>
              <div className="text-sm text-default-500 mt-1">
                {card.label}
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
