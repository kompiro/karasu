import "./monaco-setup.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { LocaleProvider } from "./i18n/index.js";
import { ThemeProvider } from "./theme/index.js";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
