interface DiffModeBannerProps {
  comparePath: string;
  compareSource: "file" | "pasted" | null;
  currentPath: string | null;
  onExit: () => void;
  /** Invoked when the user clicks "View pasted" — only rendered for pasted source (Issue #739). */
  onViewPasted?: () => void;
}

export function DiffModeBanner({
  comparePath,
  compareSource,
  currentPath,
  onExit,
  onViewPasted,
}: DiffModeBannerProps) {
  const baseName = (p: string) => p.split("/").pop() ?? p;
  const isPasted = compareSource === "pasted";
  return (
    <div className="diff-mode-banner" role="status" aria-label="Diff mode active">
      <span className="diff-mode-banner__label">
        ⇄ Diff:&nbsp;
        {isPasted ? (
          <span className="diff-mode-banner__pasted">pasted</span>
        ) : (
          <span className="diff-mode-banner__before">{baseName(comparePath)}</span>
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
