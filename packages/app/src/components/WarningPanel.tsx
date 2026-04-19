import { useState, useCallback } from "react";
import { formatWarning, type Warning } from "@karasu-tools/core";

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
          {warnings.map((w) => {
            const { message, details } = formatWarning(w);
            const locKey = w.loc ? `:${w.loc.start.offset}` : "";
            return (
              <li key={`${w.kind}:${message}${locKey}`} className="warning-item">
                <span className="warning-icon warning">{WARNING_ICONS[w.kind] ?? "\u26A0"}</span>
                {w.loc ? `Line ${w.loc.start.line}: ${message}` : message}
                {details.length > 0 && (
                  <div className="warning-details">
                    {details.map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
