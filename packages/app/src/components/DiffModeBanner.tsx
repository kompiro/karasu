import { useEffect, useState, type ReactNode } from "react";
import type { CompareSource } from "../fs/compare-source.js";
import type { SnapshotManager, SnapshotRecord } from "../fs/snapshot-manager.js";
import { Button } from "@/components/ui/button";

interface DiffModeBannerProps {
  source: CompareSource;
  snapshotManager: SnapshotManager | null;
  currentPath: string | null;
  /** When true, the compare side is rendered as the after-side (Issue #765). */
  swapped?: boolean;
  onExit: () => void;
  /** Fires when the user clicks "⇄ Swap" to flip the diff direction (Issue #765). */
  onSwap?: () => void;
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
  swapped = false,
  onExit,
  onSwap,
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

  const compareLabel: ReactNode = isPasted ? (
    <span className="diff-mode-banner__pasted">pasted</span>
  ) : source.kind === "snapshot" ? (
    <span>
      {snapshotRecord ? formatSnapshotLabel(snapshotRecord) : `${baseName(source.filePath)} @ ...`}
    </span>
  ) : (
    <span>{baseName(source.path)}</span>
  );
  const currentLabel: ReactNode = <span>{currentPath ? baseName(currentPath) : "(current)"}</span>;

  const before = swapped ? currentLabel : compareLabel;
  const after = swapped ? compareLabel : currentLabel;

  return (
    <div className="diff-mode-banner" role="status" aria-label="Diff mode active">
      <span className="diff-mode-banner__label">
        ⇄ Diff:&nbsp;
        <span className="diff-mode-banner__before">{before}</span>
        &nbsp;→&nbsp;
        <span className="diff-mode-banner__after">{after}</span>
      </span>
      <div className="diff-mode-banner__actions">
        {onSwap && (
          <Button onClick={onSwap} aria-label="Swap diff direction" aria-pressed={swapped}>
            ⇄ Swap
          </Button>
        )}
        {isPasted && onViewPasted && (
          <Button onClick={onViewPasted} aria-label="View pasted .krs">
            👁 View pasted
          </Button>
        )}
        <Button onClick={onExit} aria-label="Exit diff mode">
          ✕ Exit diff
        </Button>
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
