import { Fragment, useCallback } from "react";
import {
  Breadcrumb as UIBreadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

/**
 * Migrated to shadcn/ui `Breadcrumb` (Issue #1368).
 *
 * Legacy class names (`breadcrumb-link`, `breadcrumb-current`, `breadcrumb-separator`)
 * are preserved via `className` passthrough so existing tests and any
 * cross-package CSS continue to work. The visual baseline now comes from
 * the shadcn primitives (focus ring, gap, separator icon).
 */
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
    <UIBreadcrumb className="breadcrumb">
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={item.id}>
              {index > 0 && (
                <BreadcrumbSeparator className="breadcrumb-separator">&gt;</BreadcrumbSeparator>
              )}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="breadcrumb-current">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink className="breadcrumb-link" onClick={() => handleClick(index)}>
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </UIBreadcrumb>
  );
}
