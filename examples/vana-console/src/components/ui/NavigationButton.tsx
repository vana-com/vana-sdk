import React from "react";

interface NavigationButtonProps {
  icon: React.ReactNode;
  label: string;
  targetId: string;
  className?: string;
}

export const NavigationButton: React.FC<NavigationButtonProps> = ({
  icon,
  label,
  targetId,
  className = "",
}) => {
  const handleClick = () => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left cursor-pointer ${className}`}
    >
      {icon}
      {label}
    </button>
  );
};
