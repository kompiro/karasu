import { useState, useCallback } from "react";
import type { Warning } from "@karasu-tools/core";
import { warningSeverity } from "@karasu-tools/core";
import { useFormattedWarning } from "../i18n/format-warning.js";

interface WarningPanelProps {
  warnings: Warning[];
}

const SEVERITY_ICON = {
  warning: "\u26A0",
  info: "\u2139",
} as const;

export function WarningPanel({ warnings }: WarningPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const formatWarning = useFormattedWarning();

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
            const severity = warningSeverity(w.kind);
            return (
              <li
                key={`${w.kind}:${message}${locKey}`}
                className={`warning-item warning-item--${severity}`}
              >
                <span className={`warning-icon ${severity}`}>{SEVERITY_ICON[severity]}</span>
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
