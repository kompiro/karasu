import { useEffect, useState, type ReactNode } from "react";
import type { CompareSource } from "../fs/compare-source.js";
import type { SnapshotManager, SnapshotRecord } from "../fs/snapshot-manager.js";
import { Button } from "@/components/ui/button";

/**
 * Amber tint that marks the diff-mode action buttons as belonging to the
 * "you are in diff mode" banner context. Restores the visual signal the
 * legacy `.toolbar-btn--diff-*` classes carried before the shadcn Button
 * migration. The `aria-pressed:` rules give the Swap toggle its deeper
 * amber active state.
 */
const DIFF_BTN_CLASS =
  "border-[rgba(245,158,11,0.4)] text-[color:var(--text-primary)] " +
  "hover:border-[rgba(245,158,11,0.4)] hover:bg-[rgba(245,158,11,0.15)] hover:text-[color:var(--text-primary)] " +
  "aria-pressed:border-[rgba(245,158,11,0.7)] aria-pressed:bg-[rgba(245,158,11,0.25)] aria-pressed:text-[color:var(--text-primary)]";

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
          <Button
            className={DIFF_BTN_CLASS}
            onClick={onSwap}
            aria-label="Swap diff direction"
            aria-pressed={swapped}
          >
            ⇄ Swap
          </Button>
        )}
        {isPasted && onViewPasted && (
          <Button className={DIFF_BTN_CLASS} onClick={onViewPasted} aria-label="View pasted .krs">
            👁 View pasted
          </Button>
        )}
        <Button className={DIFF_BTN_CLASS} onClick={onExit} aria-label="Exit diff mode">
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
