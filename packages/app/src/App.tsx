import { useState, useEffect, useMemo } from "react";
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
  if (mode === "serve") return <ServeModeApp />;
  if (mode === "memory") return <MemoryModeApp />;
  return <OpfsApp />;
}

function OpfsApp() {
  const fs = useMemo(() => new OpfsFileSystemProvider(), []);

  return (
    <AppProvider fs={fs}>
      <ProjectModeApp />
    </AppProvider>
  );
}
