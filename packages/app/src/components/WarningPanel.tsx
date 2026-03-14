import { useState, useCallback } from "react";
import type { Warning } from "@karasu/core";

interface WarningPanelProps {
  warnings: Warning[];
}

const WARNING_ICONS: Record<string, string> = {
  "domain-dispersal": "\u26A0",
  "style-conflict": "\u26A0",
  "missing-runtime": "\u2139",
  "missing-realizes": "\u2139",
};

export function WarningPanel({ warnings }: WarningPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  if (warnings.length === 0) return null;

  return (
    <div className="warning-panel">
      <div className="warning-panel-header" onClick={toggle}>
        <span>
          {collapsed ? "\u25B6" : "\u25BC"} Warnings ({warnings.length})
        </span>
      </div>
      {!collapsed && (
        <ul className="warning-list">
          {warnings.map((w, i) => (
            <li key={i} className="warning-item">
              <span className="warning-icon warning">
                {WARNING_ICONS[w.kind] ?? "\u26A0"}
              </span>
              {w.message}
              {w.details.length > 0 && (
                <div className="warning-details">
                  {w.details.map((d, j) => (
                    <div key={j}>{d}</div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
