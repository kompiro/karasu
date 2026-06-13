import { useCallback, useRef } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import { SerialQueue } from "../fs/serial-queue.js";

/**
 * How many recently-written values to remember for echo detection. The watcher
 * fires within milliseconds of a write, so a small window is plenty; the cap
 * keeps the set from growing unbounded as the user types.
 */
const RECENT_SELF_WRITES_CAP = 50;

interface SerializedFileWrite {
  /** Serialized write — commits in submission order so disk ends at the latest value. */
  write: (path: string, content: string) => Promise<void>;
  /** True when `content` (just read from disk) is a value this editor wrote. */
  isOwnWrite: (content: string) => boolean;
}

/**
 * Serializes the editor's auto-save writes and lets the external-refresh
 * watcher recognize them as echoes (#1535).
 *
 * Per-keystroke `writeFile` calls otherwise run concurrently: OPFS commits on
 * `close()`, so an older write can land *after* a newer one and leave stale
 * content on disk. Separately, the watcher's echo guard only suppresses a disk
 * read equal to the *current* buffer — an intermediate self-write read back
 * would revert the editor to older text.
 *
 * `write` chains writes through a {@link SerialQueue} (disk ends at the latest
 * value) and records each written value; `isOwnWrite` reports whether a value
 * just read from disk is one we wrote, so the watcher can skip our own echoes
 * (including intermediate ones) while still honoring genuine external writes.
 */
export function useSerializedFileWrite(fs: FileSystemProvider): SerializedFileWrite {
  const queueRef = useRef(new SerialQueue());
  const recentRef = useRef<Set<string>>(new Set());

  const write = useCallback(
    (path: string, content: string): Promise<void> => {
      const recent = recentRef.current;
      recent.add(content);
      if (recent.size > RECENT_SELF_WRITES_CAP) {
        const oldest = recent.values().next().value;
        if (oldest !== undefined) recent.delete(oldest);
      }
      return queueRef.current.run(() => fs.writeFile(path, content));
    },
    [fs],
  );

  const isOwnWrite = useCallback((content: string): boolean => recentRef.current.has(content), []);

  return { write, isOwnWrite };
}
