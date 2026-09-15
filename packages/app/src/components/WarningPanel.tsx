import { useState, useCallback } from "react";
import type { Warning } from "@karasu-tools/core";
import { warningSeverity } from "@karasu-tools/core";
import { useFormattedWarning } from "../i18n/format-warning.js";
import { useTranslation } from "../i18n/index.js";
import { diagnosticLocationLabel, findingKeys } from "../utils/diagnostic-location.js";

interface WarningPanelProps {
  warnings: Warning[];
  /**
   * The open document and the directory other files are shown relative to. A
   * warning decided on the merged model can sit in an imported file, and
   * `Line N` alone would read it as the open document's (#2715). Required, like
   * the banner's, so a new mount point cannot leave them out silently.
   */
  currentFilePath: string | null;
  displayRoot: string | null;
}

const SEVERITY_ICON = {
  warning: "\u26A0",
  info: "\u2139",
} as const;

export function WarningPanel({ warnings, currentFilePath, displayRoot }: WarningPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const formatWarning = useFormattedWarning();
  const { t } = useTranslation();

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  if (warnings.length === 0) return null;

  const formatted = warnings.map((w) => formatWarning(w));
  const keys = findingKeys(
    warnings,
    formatted.map(({ message }, i) => `${warnings[i].kind}:${message}`),
  );

  return (
    <div className="warning-panel">
      <div className="warning-panel-header" onClick={toggle}>
        <span>
          {collapsed ? "\u25B6" : "\u25BC"} Warnings ({warnings.length})
        </span>
      </div>
      {!collapsed && (
        <ul className="warning-list">
          {warnings.map((w, i) => {
            const { message, details } = formatted[i];
            const location = diagnosticLocationLabel(
              w.loc,
              { currentFilePath, displayRoot },
              (line) => t("preview.location.line", { line }),
            );
            const severity = warningSeverity(w.kind);
            return (
              <li key={keys[i]} className={`warning-item warning-item--${severity}`}>
                <span className={`warning-icon ${severity}`}>{SEVERITY_ICON[severity]}</span>
                {location ? `${location}: ${message}` : message}
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
