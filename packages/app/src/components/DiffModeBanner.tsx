import { useEffect, useState } from "react";
import type { CompareSource } from "../fs/compare-source.js";
import type { SnapshotManager, SnapshotRecord } from "../fs/snapshot-manager.js";

interface DiffModeBannerProps {
  source: CompareSource;
  snapshotManager: SnapshotManager | null;
  currentPath: string | null;
  onExit: () => void;
  /**
   * Invoked when the user clicks "View pasted" — only rendered for the pasted
   * source (Issue #739).
   */
  onViewPasted?: () => void;
}

export function DiffModeBanner({
  source,
  snapshotManager,
  currentPath,
  onExit,
  onViewPasted,
}: DiffModeBannerProps) {
  const baseName = (p: string) => p.split("/").pop() ?? p;
  const [snapshotRecord, setSnapshotRecord] = useState<SnapshotRecord | null>(null);

  useEffect(() => {
    if (source.kind !== "snapshot" || !snapshotManager) {
      setSnapshotRecord(null);
      return;
    }
    let cancelled = false;
    snapshotManager.list(source.filePath).then((records) => {
      if (cancelled) return;
      setSnapshotRecord(records.find((r) => r.id === source.snapshotId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [source, snapshotManager]);

  const isPasted = source.kind === "pasted";

  return (
    <div className="diff-mode-banner" role="status" aria-label="Diff mode active">
      <span className="diff-mode-banner__label">
        ⇄ Diff:&nbsp;
        {isPasted ? (
          <span className="diff-mode-banner__pasted">pasted</span>
        ) : source.kind === "snapshot" ? (
          <span className="diff-mode-banner__before">
            {snapshotRecord
              ? formatSnapshotLabel(snapshotRecord)
              : `${baseName(source.filePath)} @ ...`}
          </span>
        ) : (
          <span className="diff-mode-banner__before">{baseName(source.path)}</span>
        )}
        &nbsp;→&nbsp;
        <span className="diff-mode-banner__after">
          {currentPath ? baseName(currentPath) : "(current)"}
        </span>
      </span>
      <div className="diff-mode-banner__actions">
        {isPasted && onViewPasted && (
          <button
            type="button"
            className="toolbar-btn toolbar-btn--diff-view-pasted"
            onClick={onViewPasted}
            aria-label="View pasted .krs"
          >
            👁 View pasted
          </button>
        )}
        <button
          type="button"
          className="toolbar-btn toolbar-btn--diff-exit"
          onClick={onExit}
          aria-label="Exit diff mode"
        >
          ✕ Exit diff
        </button>
      </div>
    </div>
  );
}

function formatSnapshotLabel(record: SnapshotRecord): string {
  const base = record.filePath.split("/").pop() ?? record.filePath;
  const when = new Date(record.createdAt).toLocaleString();
  const tag = record.label ? ` "${record.label}"` : record.trigger === "auto" ? " (auto)" : "";
  return `${base} @ ${when}${tag}`;
}
