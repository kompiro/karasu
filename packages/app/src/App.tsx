import { MemoryModeApp } from "./MemoryModeApp.js";
import { ProjectModeApp } from "./ProjectModeApp.js";
import { AppProvider } from "./state/app-context.js";
import { OpfsFileSystemProvider } from "./fs/opfs-provider.js";
import { detectStorageMode } from "./fs/detect-storage-mode.js";
import { useMemo } from "react";

export function App() {
  const mode = useMemo(() => detectStorageMode(), []);

  if (mode === "memory") {
    return <MemoryModeApp />;
  }

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
