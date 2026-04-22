import { useCallback, useEffect, useRef, useState } from "react";

type PasteCompareDialogProps = {
  /** Initial value in the textarea (e.g. when "View pasted" is used to re-open). */
  initialValue?: string;
  onCancel: () => void;
} & (
  | { readOnly?: false; onConfirm: (content: string) => void }
  | { readOnly: true; onConfirm?: never }
);

export function PasteCompareDialog(props: PasteCompareDialogProps) {
  const { initialValue = "", onCancel } = props;
  const readOnly = props.readOnly === true;
  const onConfirm = readOnly ? undefined : props.onConfirm;
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
    if (!value.trim() || !onConfirm) return;
    onConfirm(value);
  }, [value, onConfirm]);

  return (
    <div
      className="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-compare-dialog-title"
      onClick={onCancel}
    >
      <div className="dialog dialog--paste-compare" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="paste-compare-dialog-title" className="dialog__title">
            {readOnly ? "⇄ Pasted .krs (preview)" : "⇄ Compare with pasted .krs"}
          </h2>
        </header>
        <p className="dialog__subtitle">
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
        <footer className="dialog__footer">
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
