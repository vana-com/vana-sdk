// src/components/ui/FormBuilder.tsx

"use client";

import React from "react";
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";

export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "url" | "number" | "textarea" | "select";
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  options?: { value: string; label: string }[];
}

interface FormBuilderProps {
  title: string;
  fields: FormField[];
  onSubmit: () => void;
  isSubmitting: boolean;
  submitText: string;
  submitIcon?: React.ReactNode;
  status?: string;
  statusType?: "success" | "error" | "info";
  className?: string;
}

export function FormBuilder({
  title,
  fields,
  onSubmit,
  isSubmitting,
  submitText,
  submitIcon,
  status,
  statusType = "info",
  className = "",
}: FormBuilderProps) {
  const requiredFields = fields.filter((field) => field.required);
  const isFormValid = requiredFields.every(
    (field) => field.value.trim() !== "",
  );

  const getStatusColor = () => {
    switch (statusType) {
      case "success":
        return "text-green-600";
      case "error":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const renderField = (field: FormField) => {
    const commonProps = {
      label: field.label,
      placeholder: field.placeholder,
      value: field.value,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => field.onChange(e.target.value),
      required: field.required,
    };

    switch (field.type) {
      case "textarea":
        return <Textarea key={field.name} {...commonProps} minRows={3} />;
      case "select":
        return (
          <Select
            key={field.name}
            label={field.label}
            aria-label={field.label}
            placeholder={field.placeholder}
            selectedKeys={field.value ? [field.value] : []}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0];
              field.onChange(selectedKey ? selectedKey.toString() : "");
            }}
          >
            {(field.options || []).map((option) => (
              <SelectItem key={option.value}>{option.label}</SelectItem>
            ))}
          </Select>
        );
      default:
        return <Input key={field.name} {...commonProps} type={field.type} />;
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(renderField)}
        </div>
      </div>

      <Button
        onPress={onSubmit}
        disabled={isSubmitting || !isFormValid}
        variant="solid"
        className="w-full"
      >
        {isSubmitting ? (
          <Spinner size="sm" className="mr-2" />
        ) : (
          submitIcon && <span className="mr-2">{submitIcon}</span>
        )}
        {isSubmitting ? "Processing..." : submitText}
      </Button>

      {status && <p className={`text-sm ${getStatusColor()}`}>{status}</p>}
    </div>
  );
}
