/**
 * Empty State Component
 * Shows placeholder when no data is available
 */
import { Card, CardBody, Button } from "@heroui/react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

/**
 * EmptyState displays a centered placeholder with icon and optional action
 */
export function EmptyState({
  Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Card className="border-divider/50">
      <CardBody className="p-12">
        <div className="flex flex-col items-center text-center">
          <Icon className="h-16 w-16 text-default-500 opacity-50 mb-4" />
          <h3 className="text-xl font-semibold mb-2 text-default-500">
            {title}
          </h3>
          <p className="text-default-500 mb-4">{description}</p>
          {action && (
            <Button onPress={action.onPress} variant="flat">
              {action.label}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
