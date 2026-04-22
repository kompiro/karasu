import { useEffect, useState } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import { resolveCompareSource, compareSourceKey, type CompareSource } from "../fs/compare-source";
import type { SnapshotManager } from "../fs/snapshot-manager";

interface ResolvedCompare {
  /** Path to pass as `beforeEntryPath` to compile*Diff. `null` disables diff mode. */
  compareEntryPath: string | null;
  /** Effective FS — an overlay when the source is a snapshot, the base otherwise. */
  compareFs: FileSystemProvider | null;
}

/**
 * Resolves a `CompareSource` into the shape the three diff view hooks consume.
 * Returns `{ compareEntryPath: null, compareFs: null }` while resolution is pending
 * or when there is no source.
 */
export function useResolvedCompareSource(
  source: CompareSource | null,
  fs: FileSystemProvider | null,
  snapshots: SnapshotManager | null,
  projectRoot: string | null,
): ResolvedCompare {
  const [resolved, setResolved] = useState<ResolvedCompare>({
    compareEntryPath: null,
    compareFs: null,
  });

  const key = compareSourceKey(source);

  useEffect(() => {
    if (!source || !fs) {
      setResolved({ compareEntryPath: null, compareFs: null });
      return;
    }

    if (source.kind === "file") {
      setResolved({ compareEntryPath: source.path, compareFs: fs });
      return;
    }

    if (!snapshots || !projectRoot) {
      setResolved({ compareEntryPath: null, compareFs: null });
      return;
    }

    let cancelled = false;
    resolveCompareSource(source, fs, snapshots, projectRoot)
      .then((r) => {
        if (cancelled) return;
        setResolved({ compareEntryPath: r.entryPath, compareFs: r.fs });
      })
      .catch(() => {
        if (cancelled) return;
        setResolved({ compareEntryPath: null, compareFs: null });
      });
    return () => {
      cancelled = true;
    };
    // `key` captures all meaningful identity changes of `source`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fs, snapshots, projectRoot]);

  return resolved;
}
