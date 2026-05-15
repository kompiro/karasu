import type { EditTab } from "./EditTabBar.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface EditPaneToolbarProps {
  activeTab: EditTab;
  onFormat?: () => void;
  onTidyStyle?: () => void;
  hasParseErrors?: boolean;
}

/**
 * Migrated to shadcn/ui `Tooltip` (Issue #1368).
 *
 * The `title` attribute is replaced with a Radix-backed Tooltip so screen
 * readers receive the hint via `aria-describedby` and the tooltip is
 * keyboard-accessible (focus + hover). A `TooltipProvider` is mounted in
 * `main.tsx` so all consumers share one provider.
 */
export function EditPaneToolbar({
  activeTab,
  onFormat,
  onTidyStyle,
  hasParseErrors,
}: EditPaneToolbarProps) {
  if (activeTab !== "editor") return null;
  if (!onFormat && !onTidyStyle) return null;

  return (
    <div className="edit-pane-toolbar">
      {onFormat && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="toolbar-btn toolbar-btn--actionable toolbar-btn--format"
              onClick={onFormat}
              disabled={hasParseErrors}
            >
              ⌥ Format
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {hasParseErrors
              ? "Cannot format: source has parse errors"
              : "Format document (Shift+Alt+F)"}
          </TooltipContent>
        </Tooltip>
      )}
      {onTidyStyle && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="toolbar-btn toolbar-btn--actionable toolbar-btn--tidy-style"
              onClick={onTidyStyle}
            >
              ✨ Tidy
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Tidy this .krs.style file (merge duplicates, group properties by axis)
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
