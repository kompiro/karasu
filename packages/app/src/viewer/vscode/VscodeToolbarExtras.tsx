import { Button } from "@/components/ui/button";
import { useAppContext } from "../../state/app-context.js";
import { useTranslation } from "../../i18n/index.js";

/**
 * What the VS Code preview adds to the viewer's toolbar (#3312).
 *
 * - The Icon Mode toggle, which VS Code keeps while the app moved it to its
 *   settings (ADR-299, ADR-2906). The display mode now lives in the webview,
 *   so the toggle switches it there without asking the extension.
 * - The hint that Cmd/Ctrl+click jumps to the source (AT-0038): the gesture
 *   is not discoverable, and the extension is where the editor is.
 *
 * No theme or language switch: the preview follows VS Code's (#2996).
 */
export function VscodeToolbarExtras() {
  const { state, dispatch } = useAppContext();
  const { t } = useTranslation();
  const iconMode = state.displayMode === "icon";
  return (
    <>
      <Button
        variant="actionable"
        aria-pressed={iconMode}
        aria-label={t("vscodePreview.iconMode.ariaLabel")}
        onClick={() =>
          dispatch({ type: "SET_DISPLAY_MODE", displayMode: iconMode ? "shape" : "icon" })
        }
      >
        {t("vscodePreview.iconMode.label")}
      </Button>
      <span className="vscode-jump-hint text-[11px] opacity-70" data-testid="vscode-jump-hint">
        {t("vscodePreview.jumpHint")}
      </span>
    </>
  );
}
