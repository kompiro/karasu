import { useState } from "react";
import type { ActiveView } from "../state/app-reducer.js";
import { ReferenceContent } from "./ReferenceContent.js";

const VIEW_OPTIONS: { value: ActiveView; label: string }[] = [
  { value: "system", label: "System" },
  { value: "deploy", label: "Deploy" },
  { value: "org", label: "Org" },
];

/**
 * Full-window reference, rendered when the app is loaded in `?reference` mode
 * (the pop-out target of {@link openReferenceWindow}). It runs in its own
 * browser window so the user can keep it open beside the editor — a modal in
 * the main window would trap focus and block typing. A view selector keeps the
 * window self-contained (the `view` query param seeds the initial choice).
 */
export function ReferenceWindow() {
  const initial = new URLSearchParams(window.location.search).get("view");
  const [view, setView] = useState<ActiveView>(
    VIEW_OPTIONS.some((o) => o.value === initial) ? (initial as ActiveView) : "system",
  );

  return (
    <div className="reference-window">
      <header className="reference-window-header">
        <span className="reference-window-title">karasu Reference</span>
        <label className="reference-window-view">
          View
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ActiveView)}
            aria-label="Diagram view"
          >
            {VIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <ReferenceContent activeView={view} />
    </div>
  );
}
