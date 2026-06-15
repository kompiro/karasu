import "./monaco-setup.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ReferenceWindow } from "./components/ReferenceWindow.js";
import { LocaleProvider } from "./i18n/index.js";
import { ThemeProvider } from "./theme/index.js";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/index.css";

// `?reference` mode: the app was opened as the pop-out reference window
// (openReferenceWindow). Render just the reference — no editor / project boot.
const isReferenceWindow = new URLSearchParams(window.location.search).has("reference");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          {isReferenceWindow ? <ReferenceWindow /> : <App />}
        </TooltipProvider>
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
