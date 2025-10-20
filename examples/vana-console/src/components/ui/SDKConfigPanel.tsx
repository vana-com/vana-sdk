"use client";

import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Button,
  Tooltip,
} from "@heroui/react";
import { Settings, X, Code2 } from "lucide-react";

interface SDKConfigPanelProps {
  addressOverride: string;
  onAddressChange: (address: string) => void;
  onApply: () => void;
  onClear: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function SDKConfigPanel({
  addressOverride,
  onAddressChange,
  onApply,
  onClear,
  isOpen,
  onToggle,
}: SDKConfigPanelProps) {
  if (!isOpen) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Tooltip content="SDK Configuration" placement="left">
          <Button
            isIconOnly
            variant="flat"
            onPress={onToggle}
            className="bg-content1 border border-divider"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-96">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="font-semibold">SDK Configuration</span>
            </div>
            <Button isIconOnly size="sm" variant="light" onPress={onToggle}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Input
              label="Read-Only Address Override"
              placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEd1"
              value={addressOverride}
              onChange={(e) => {
                onAddressChange(e.target.value);
              }}
              description="Explore any address without connecting a wallet"
              classNames={{
                input: "font-mono text-sm",
              }}
            />
          </div>

          <div className="bg-default-100 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <Code2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-xs text-default-600">
                <p className="font-medium mb-1">In code:</p>
                <code className="text-xs">
                  {`const vana = Vana({ address: '0x...' })`}
                </code>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              color="primary"
              onPress={onApply}
              isDisabled={!addressOverride.trim()}
              className="flex-1"
            >
              Apply
            </Button>
            <Button
              variant="flat"
              onPress={onClear}
              isDisabled={!addressOverride}
            >
              Clear
            </Button>
          </div>

          {addressOverride && (
            <div className="text-xs text-warning">
              ⚠️ Write operations will be disabled in read-only mode
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
