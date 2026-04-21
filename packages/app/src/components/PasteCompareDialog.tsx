import { useCallback, useEffect, useRef, useState } from "react";

interface PasteCompareDialogProps {
  /** Initial value in the textarea (e.g. when "View pasted" is used to re-open). */
  initialValue?: string;
  /** Read-only preview mode — hides confirm, relabels cancel to "Close". */
  readOnly?: boolean;
  onConfirm: (content: string) => void;
  onCancel: () => void;
}

export function PasteCompareDialog({
  initialValue = "",
  readOnly = false,
  onConfirm,
  onCancel,
}: PasteCompareDialogProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    if (!value.trim()) return;
    onConfirm(value);
  }, [value, onConfirm]);

  return (
    <div
      className="paste-compare-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-compare-dialog-title"
      onClick={onCancel}
    >
      <div className="paste-compare-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="paste-compare-dialog__header">
          <h2 id="paste-compare-dialog-title" className="paste-compare-dialog__title">
            {readOnly ? "⇄ Pasted .krs (preview)" : "⇄ Compare with pasted .krs"}
          </h2>
        </header>
        <p className="paste-compare-dialog__hint">
          {readOnly
            ? "The .krs text used as the before-side of the current diff."
            : "Paste a .krs snippet to use as the before-side of the diff."}
        </p>
        <textarea
          ref={textareaRef}
          className="paste-compare-dialog__textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="system Shop {&#10;  service Catalog&#10;}"
          spellCheck={false}
          readOnly={readOnly}
          aria-label="Pasted .krs content"
        />
        <footer className="paste-compare-dialog__footer">
          <button
            type="button"
            className="toolbar-btn"
            onClick={onCancel}
            aria-label={readOnly ? "Close" : "Cancel"}
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              type="button"
              className="toolbar-btn toolbar-btn--actionable toolbar-btn--paste-confirm"
              onClick={handleConfirm}
              disabled={!value.trim()}
              aria-label="Compare with pasted .krs"
            >
              ⇄ Compare
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
