import React from "react";
import { Button, Card, CardBody } from "@heroui/react";
import { AlertCircle, X } from "lucide-react";

interface ErrorMessageProps {
  error: string | null;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  onDismiss,
  className = "",
}) => {
  if (!error) return null;

  return (
    <Card className={`border-danger-200 bg-danger-50 ${className}`}>
      <CardBody className="flex flex-row items-start gap-3 p-4">
        <AlertCircle className="h-5 w-5 text-danger-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-danger-700 text-sm break-words">{error}</p>
        </div>
        {onDismiss && (
          <Button
            size="sm"
            variant="light"
            isIconOnly
            onPress={onDismiss}
            className="text-danger-500 hover:text-danger-700"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardBody>
    </Card>
  );
};
