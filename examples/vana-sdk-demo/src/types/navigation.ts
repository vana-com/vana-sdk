import type { ReactNode } from "react";

export interface NavigationItem {
  id: string;
  label: string;
  icon: ReactNode;
  targetId: string;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

export interface NavigationConfig {
  sections: NavigationSection[];
}
