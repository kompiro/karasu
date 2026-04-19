import { useState, useEffect, useMemo } from "react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { MemoryModeApp } from "./MemoryModeApp.js";
import { ProjectModeApp } from "./ProjectModeApp.js";
import { ServeModeApp } from "./ServeModeApp.js";
import { AppProvider } from "./state/app-context.js";
import { OpfsFileSystemProvider } from "./fs/opfs-provider.js";
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
    if (mode === "opfs") return new OpfsFileSystemProvider();
    return new InMemoryFileSystemProvider();
  }, [mode]);

  return (
    <AppProvider fs={fs}>
      {mode === "serve" && <ServeModeApp />}
      {mode === "memory" && <MemoryModeApp />}
      {mode === "opfs" && <ProjectModeApp />}
    </AppProvider>
  );
}
