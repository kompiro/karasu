interface DiffModeBannerProps {
  comparePath: string;
  compareSource: "file" | "pasted" | null;
  currentPath: string | null;
  /** When true, the compare side is rendered as the after-side (Issue #765). */
  swapped?: boolean;
  onExit: () => void;
  /** Fires when the user clicks "⇄ Swap" to flip the diff direction (Issue #765). */
  onSwap?: () => void;
  /** Invoked when the user clicks "View pasted" — only rendered for pasted source (Issue #739). */
  onViewPasted?: () => void;
}

export function DiffModeBanner({
  comparePath,
  compareSource,
  currentPath,
  swapped = false,
  onExit,
  onSwap,
  onViewPasted,
}: DiffModeBannerProps) {
  const baseName = (p: string) => p.split("/").pop() ?? p;
  const isPasted = compareSource === "pasted";

  const compareLabel = isPasted ? (
    <span className="diff-mode-banner__pasted">pasted</span>
  ) : (
    <span>{baseName(comparePath)}</span>
  );
  const currentLabel = <span>{currentPath ? baseName(currentPath) : "(current)"}</span>;

  const beforeClass = "diff-mode-banner__before";
  const afterClass = "diff-mode-banner__after";
  const before = swapped ? currentLabel : compareLabel;
  const after = swapped ? compareLabel : currentLabel;

  return (
    <div className="diff-mode-banner" role="status" aria-label="Diff mode active">
      <span className="diff-mode-banner__label">
        ⇄ Diff:&nbsp;
        <span className={beforeClass}>{before}</span>
        &nbsp;→&nbsp;
        <span className={afterClass}>{after}</span>
      </span>
      <div className="diff-mode-banner__actions">
        {onSwap && (
          <button
            type="button"
            className="toolbar-btn toolbar-btn--diff-swap"
            onClick={onSwap}
            aria-label="Swap diff direction"
            aria-pressed={swapped}
          >
            ⇄ Swap
          </button>
        )}
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
