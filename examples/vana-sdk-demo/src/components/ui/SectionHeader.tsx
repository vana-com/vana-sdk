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
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h2 className="text-2xl font-semibold">{title}</h2>
      </div>
      <div className="text-default-600">{description}</div>
    </div>
  );
};
