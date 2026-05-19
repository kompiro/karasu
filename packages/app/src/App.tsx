import { useState, useEffect, useMemo } from "react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { MemoryModeApp } from "./MemoryModeApp.js";
import { ProjectModeApp } from "./ProjectModeApp.js";
import { ServeModeApp } from "./ServeModeApp.js";
import { AppProvider } from "./state/app-context.js";
import { CommandProvider } from "./keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "./keyboard/KeyboardShortcutDispatcher.js";
import { OpfsFileSystemProvider } from "./fs/opfs-provider.js";
import { ObservableFileSystemProvider } from "./fs/observable-provider.js";
import { detectAppMode, type AppMode } from "./fs/detect-storage-mode.js";

export function App() {
  const [mode, setMode] = useState<AppMode | null>(null);

  useEffect(() => {
    detectAppMode().then(setMode);
  }, []);

  if (mode === null) return null;
  if (mode === "serve") return <ModeWrapper mode="serve" />;
  if (mode === "memory") return <ModeWrapper mode="memory" />;
  return <ModeWrapper mode="opfs" />;
}

function ModeWrapper({ mode }: { mode: AppMode }) {
  const fs = useMemo(() => {
    const delegate =
      mode === "opfs" ? new OpfsFileSystemProvider() : new InMemoryFileSystemProvider();
    return new ObservableFileSystemProvider(delegate);
  }, [mode]);

  return (
    <AppProvider fs={fs}>
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        {mode === "serve" && <ServeModeApp />}
        {mode === "memory" && <MemoryModeApp />}
        {mode === "opfs" && <ProjectModeApp />}
      </CommandProvider>
    </AppProvider>
  );
}
