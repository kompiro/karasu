import { useState } from "react";
import { Breadcrumb } from "./Breadcrumb.js";
import { ReferencePanel } from "./ReferencePanel.js";

interface BreadcrumbBarProps {
  items: { id: string; label: string }[];
  onNavigate: (path: string[]) => void;
}

export function BreadcrumbBar({ items, onNavigate }: BreadcrumbBarProps) {
  const [refOpen, setRefOpen] = useState(false);

  return (
    <>
      <div className="preview-toolbar">
        <button
          className="reference-trigger-btn"
          onClick={() => setRefOpen(true)}
          aria-label="Open reference"
          title="Reference"
        >
          ?
        </button>
      </div>
      <Breadcrumb items={items} onNavigate={onNavigate} />
      <ReferencePanel isOpen={refOpen} onClose={() => setRefOpen(false)} />
    </>
  );
}
