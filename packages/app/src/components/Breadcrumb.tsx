import { useCallback } from "react";

interface BreadcrumbItem {
  id: string;
  label: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (path: string[]) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  const handleClick = useCallback(
    (index: number) => {
      // Clicking system (index 0) goes to [], clicking service (index 1) goes to [items[1].id], etc.
      const newPath = items.slice(1, index + 1).map((item) => item.id);
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
              <button
                className="breadcrumb-link"
                onClick={() => handleClick(index)}
              >
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
