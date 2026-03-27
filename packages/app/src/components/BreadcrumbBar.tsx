import { Breadcrumb } from "./Breadcrumb.js";

interface BreadcrumbBarProps {
  items: { id: string; label: string }[];
  onNavigate: (path: string[]) => void;
}

export function BreadcrumbBar({ items, onNavigate }: BreadcrumbBarProps) {
  return <Breadcrumb items={items} onNavigate={onNavigate} />;
}
