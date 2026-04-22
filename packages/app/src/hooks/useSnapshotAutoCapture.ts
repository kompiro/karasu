import { useEffect, useRef } from "react";
import type { SnapshotManager } from "../fs/snapshot-manager";

/**
 * Auto-capture the current file as an OPFS snapshot after a period of idle editing.
 *
 * Behavior:
 * - Waits `debounceMs` after the last `content` change before writing.
 * - Duplicate-skip is handled inside `SnapshotManager` (content-hash against the
 *   most recent record), so this hook can fire without worrying about identical
 *   consecutive captures.
 * - `beforeunload` flushes any pending capture so a tab close doesn't lose the
 *   last few minutes of work.
 */
export function useSnapshotAutoCapture(
  snapshots: SnapshotManager | null,
  projectRoot: string | null,
  filePath: string | null,
  content: string,
  debounceMs = 5 * 60 * 1000,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ content, filePath, relPath: "" });

  useEffect(() => {
    if (!snapshots || !projectRoot || !filePath) return;
    if (!filePath.startsWith(`${projectRoot}/`)) return;

    const relPath = filePath.slice(projectRoot.length + 1);
    latestRef.current = { content, filePath, relPath };

    const fire = () => {
      const { content: c, relPath: rp } = latestRef.current;
      void snapshots.capture(rp, c, { trigger: "auto" });
    };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fire, debounceMs);

    const onUnload = () => fire();
    window.addEventListener("beforeunload", onUnload);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [snapshots, projectRoot, filePath, content, debounceMs]);
}
