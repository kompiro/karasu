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
import { readSharedProjectFromHash } from "./utils/inline-share.js";
import { shareTargetToHash } from "./hooks/useHistoryNavigation.js";
import { useTranslation } from "./i18n/index.js";
import { Button } from "@/components/ui/button";

// Snapshot the entry hash at module load — *before* the deep-permalink
// normalization in the `useState` initializer can rewrite it. React StrictMode
// double-invokes lazy `useState` initializers in dev; reading live
// `window.location.hash` there would make the second run see the already
// rewritten `#krs-…` (no `#s=`) and lose the payload. Reading this stable
// snapshot keeps the initializer pure and idempotent.
const ENTRY_HASH = typeof window !== "undefined" ? window.location.hash : "";

export function App() {
  // A shared inline URL (`#s=…`, karasu-nest) is read once at mount. A valid
  // payload opens as an ephemeral in-memory view regardless of the visitor's
  // browser storage, so it never touches their local (OPFS) project. A present
  // but unrestorable payload falls back to the normal app with a warning.
  const [shared] = useState(() => {
    const result = readSharedProjectFromHash(ENTRY_HASH);
    // When the shared payload carries a deep permalink target (#1827),
    // normalize the URL to the canonical `#krs-<view>-<node>:highlight` anchor
    // *here* — before AppShell (and its `useHistoryNavigation`) mounts, since
    // child effects run before any parent effect. The history hook's existing
    // mount-time parse + deferred node-path resolution then drills/focuses with
    // no extra wiring. Mirrors how a plain `#s=` open is already rewritten to
    // `#krs-system-root` by that same hook.
    const target = result !== null && "payload" in result ? result.payload.target : undefined;
    if (target) {
      history.replaceState(null, "", shareTargetToHash(target));
    }
    return result;
  });
  const sharedPayload = shared !== null && "payload" in shared ? shared.payload : null;
  const restoreFailed = shared !== null && "error" in shared;

  const [mode, setMode] = useState<AppMode | null>(null);

  useEffect(() => {
    if (sharedPayload !== null) return;
    detectAppMode().then(setMode);
  }, [sharedPayload]);

  if (sharedPayload !== null) {
    return (
      <ModeWrapper mode="memory" sharedKrs={sharedPayload.krs} sharedStyle={sharedPayload.style} />
    );
  }
  if (mode === null) return null;
  return <ModeWrapper mode={mode} restoreFailed={restoreFailed} />;
}

function ModeWrapper({
  mode,
  sharedKrs,
  sharedStyle,
  restoreFailed,
}: {
  mode: AppMode;
  sharedKrs?: string;
  sharedStyle?: string;
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
          {mode === "memory" && <MemoryModeApp initialKrs={sharedKrs} initialStyle={sharedStyle} />}
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
      <Button className="shrink-0" onClick={() => setDismissed(true)}>
        ✕ {t("preview.share.dialog.close")}
      </Button>
    </div>
  );
}
