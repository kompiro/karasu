import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PasteCompareDialogProps = {
  /** Initial value in the textarea (e.g. when "View pasted" is used to re-open). */
  initialValue?: string;
  onCancel: () => void;
} & (
  | { readOnly?: false; onConfirm: (content: string) => void }
  | { readOnly: true; onConfirm?: never }
);

/**
 * Migrated to shadcn/ui `Dialog` (Issue #1368).
 *
 * Behavioural contract preserved:
 * - Esc closes (Radix's built-in `onEscapeKeyDown`).
 * - Outside-pointer-down closes (Radix's `onPointerDownOutside`).
 * - Focus the textarea on open (still done with a ref + effect).
 * - Compare button stays disabled while textarea is whitespace-only.
 */
export function PasteCompareDialog(props: PasteCompareDialogProps) {
  const { initialValue = "", onCancel } = props;
  const readOnly = props.readOnly === true;
  const onConfirm = readOnly ? undefined : props.onConfirm;
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Radix focuses Content first; defer to next tick so our explicit
    // textarea focus wins.
    const id = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!value.trim() || !onConfirm) return;
    onConfirm(value);
  }, [value, onConfirm]);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        hideCloseButton
        className="gap-3"
        style={{ maxWidth: 640, width: "90vw" }}
        aria-labelledby="paste-compare-dialog-title"
      >
        <DialogHeader>
          <DialogTitle id="paste-compare-dialog-title">
            {readOnly ? "⇄ Pasted .krs (preview)" : "⇄ Compare with pasted .krs"}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "The .krs text used as the before-side of the current diff."
              : "Paste a .krs snippet to use as the before-side of the diff."}
          </DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
