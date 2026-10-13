import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ReferenceWindow } from "./components/ReferenceWindow.js";
import type { AppMode } from "./fs/detect-storage-mode.js";
import { LocaleProvider } from "./i18n/index.js";
import { ThemeProvider } from "./theme/index.js";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/web-fonts.css";
import "./styles/index.css";

export interface MountAppOptions {
  /**
   * The mode, fixed at build time by the entry. Omitted, the app detects it
   * at runtime (`detectAppMode`). The `karasu serve` build fixes it to
   * `"serve"` so it can leave Monaco out (#3138).
   */
  mode?: AppMode;
}

/**
 * Render the app into `#root`. Shared by both entries — `main.tsx` (Pages,
 * and `karasu serve` in the monorepo) and `serve-main.tsx` (the `karasu`
 * npm package) — so the serve screen is the same from either (TPL-1983).
 */
export function mountApp({ mode }: MountAppOptions = {}): void {
  // `?reference` mode: the app was opened as the pop-out reference window
  // (openReferenceWindow). Render just the reference — no editor / project boot.
  const isReferenceWindow = new URLSearchParams(window.location.search).has("reference");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <LocaleProvider>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {isReferenceWindow ? <ReferenceWindow /> : <App mode={mode} />}
          </TooltipProvider>
        </ThemeProvider>
      </LocaleProvider>
    </StrictMode>,
  );
}
