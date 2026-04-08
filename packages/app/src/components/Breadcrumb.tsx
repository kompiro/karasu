import { useCallback } from "react";

export interface BreadcrumbItem {
  id: string;
  label: string;
  /**
   * Explicit ViewPath to navigate to when this item is clicked.
   * When provided, used directly instead of the default slice-based computation.
   * Default: items.slice(1, index + 1).map(item => item.id)
   */
  navigatePath?: string[];
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (path: string[]) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  const handleClick = useCallback(
    (index: number) => {
      const item = items[index];
      if (item.navigatePath !== undefined) {
        onNavigate(item.navigatePath);
        return;
      }
      // Default: clicking item at index 0 goes to [], index 1 goes to [items[1].id], etc.
      const newPath = items.slice(1, index + 1).map((i) => i.id);
      onNavigate(newPath);
    },
    [items, onNavigate],
  );

  if (items.length === 0) return null;

  return (
    <div className="breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.id}>
            {index > 0 && <span className="breadcrumb-separator">&gt;</span>}
            {isLast ? (
              <span className="breadcrumb-current">{item.label}</span>
            ) : (
              <button className="breadcrumb-link" onClick={() => handleClick(index)}>
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
