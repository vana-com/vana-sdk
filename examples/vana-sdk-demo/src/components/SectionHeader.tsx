import React from "react";

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  description,
}) => {
  return (
    <div className="flex-col items-start">
      <div className="flex items-center gap-2">
        {icon}
        {title}
      </div>
      <p className="text-small text-default-500 mt-1">{description}</p>
    </div>
  );
};
