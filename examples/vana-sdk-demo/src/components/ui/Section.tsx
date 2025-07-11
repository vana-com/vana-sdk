import React from "react";

interface SectionProps {
  /**
   * Content to display in the section
   */
  children: React.ReactNode;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * HTML ID for anchor navigation
   */
  id?: string;
  /**
   * Whether this is the first section (no top padding)
   * @default false
   */
  isFirst?: boolean;
  /**
   * Whether this is the last section (no bottom padding)
   * @default false
   */
  isLast?: boolean;
}

/**
 * Section component following Stripe's design principles
 * Provides generous vertical spacing for clear visual separation
 */
export const Section: React.FC<SectionProps> = ({
  children,
  className = "",
  id,
  isFirst = false,
  isLast = false,
}) => {
  const paddingClasses = `${isFirst ? "pt-0" : "pt-32"} ${
    isLast ? "pb-0" : "pb-32"
  }`;

  return (
    <section id={id} className={`${paddingClasses} ${className}`}>
      {children}
    </section>
  );
};

/**
 * SectionDivider component for subtle visual separation
 * Uses Stripe-like minimal styling with generous spacing
 */
export const SectionDivider: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  return (
    <div className={`py-16 ${className}`}>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-default-200/60" />
        </div>
      </div>
    </div>
  );
};
