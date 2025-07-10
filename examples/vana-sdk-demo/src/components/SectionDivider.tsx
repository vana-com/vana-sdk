import React from "react";
import { Divider } from "@heroui/react";

interface SectionDividerProps {
  text: string;
  className?: string;
}

export const SectionDivider: React.FC<SectionDividerProps> = ({
  text,
  className = "",
}) => {
  return (
    <div className={`flex items-center gap-4 my-8 ${className}`}>
      <Divider className="flex-1" />
      <div className="px-4 py-2 bg-primary/10 rounded-full">
        <span className="text-sm font-medium text-primary">{text}</span>
      </div>
      <Divider className="flex-1" />
    </div>
  );
};
