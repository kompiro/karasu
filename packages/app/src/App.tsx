import { useState, useEffect, useMemo } from "react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { MemoryModeApp } from "./MemoryModeApp.js";
import { ProjectModeApp } from "./ProjectModeApp.js";
import { ServeModeApp } from "./ServeModeApp.js";
import { AppProvider } from "./state/app-context.js";
import { CommandProvider } from "./keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "./keyboard/KeyboardShortcutDispatcher.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { TranslateProvider } from "./components/TranslateProvider.js";
import { OpfsFileSystemProvider } from "./fs/opfs-provider.js";
import { ObservableFileSystemProvider } from "./fs/observable-provider.js";
import { detectAppMode, type AppMode } from "./fs/detect-storage-mode.js";
import { readSharedKrsFromHash } from "./utils/inline-share.js";
import { useTranslation } from "./i18n/index.js";

export function App() {
  // A shared inline URL (`#s=…`, karasu-nest) is read once at mount. A valid
  // payload opens as an ephemeral in-memory view regardless of the visitor's
  // browser storage, so it never touches their local (OPFS) project. A present
  // but unrestorable payload falls back to the normal app with a warning.
  const [shared] = useState(() => readSharedKrsFromHash(window.location.hash));
  const sharedSource = shared !== null && "source" in shared ? shared.source : null;
  const restoreFailed = shared !== null && "error" in shared;

  const [mode, setMode] = useState<AppMode | null>(null);

  useEffect(() => {
    if (sharedSource !== null) return;
    detectAppMode().then(setMode);
  }, [sharedSource]);

  if (sharedSource !== null) {
    return <ModeWrapper mode="memory" sharedKrs={sharedSource} />;
  }
  if (mode === null) return null;
  return <ModeWrapper mode={mode} restoreFailed={restoreFailed} />;
}

function ModeWrapper({
  mode,
  sharedKrs,
  restoreFailed,
}: {
  mode: AppMode;
  sharedKrs?: string;
  restoreFailed?: boolean;
}) {
  const fs = useMemo(() => {
    const delegate =
      mode === "opfs" ? new OpfsFileSystemProvider() : new InMemoryFileSystemProvider();
    return new ObservableFileSystemProvider(delegate);
  }, [mode]);

  return (
    <AppProvider fs={fs}>
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <CommandPalette />
        <TranslateProvider>
          {restoreFailed && <RestoreFailedBanner />}
          {mode === "serve" && <ServeModeApp />}
          {mode === "memory" && <MemoryModeApp initialKrs={sharedKrs} />}
          {mode === "opfs" && <ProjectModeApp />}
        </TranslateProvider>
      </CommandProvider>
    </AppProvider>
  );
}

/** Dismissible warning shown when a shared inline URL could not be restored. */
function RestoreFailedBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 bg-[color:var(--warning-bg,#5c4a00)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
    >
      <span>{t("preview.share.restoreFailed")}</span>
      <button
        type="button"
        className="shrink-0 opacity-70 hover:opacity-100"
        onClick={() => setDismissed(true)}
        aria-label={t("preview.share.dialog.close")}
      >
        ✕
      </button>
    </div>
  );
}
