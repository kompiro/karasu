import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClipboardCopy } from "../hooks/useClipboardCopy.js";
import { useTranslation } from "../i18n/index.js";

interface ShareDialogProps {
  open: boolean;
  url: string;
  onClose: () => void;
  /** Whether the URL was already copied when the dialog opened (Share click copies eagerly). */
  copiedOnOpen?: boolean;
}

/**
 * Share dialog for karasu-nest inline sharing (design:
 * docs/design/karasu-nest-hosted-preview.md, UI section).
 *
 * Shows the generated inline URL in a read-only field (selected on focus) with
 * a re-copy action. The Share button copies eagerly on click, so this dialog is
 * primarily for inspecting and re-copying the link.
 */
export function ShareDialog({ open, url, onClose, copiedOnOpen = false }: ShareDialogProps) {
  const { t } = useTranslation();
  const { copy, copied } = useClipboardCopy();
  const inputRef = useRef<HTMLInputElement>(null);

  // Select the URL when the dialog opens so a manual Cmd/Ctrl+C works too.
  // setTimeout lets Radix's focus-on-open settle first (dialog.md checklist).
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.select(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const showCopied = copied || copiedOnOpen;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[90vw] max-w-[560px] gap-3" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{t("preview.share.dialog.title")}</DialogTitle>
          <DialogDescription>{t("preview.share.dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            className="min-w-0 flex-1 rounded border border-[color:var(--border-strong)] bg-transparent px-2 py-1 font-mono text-xs text-[color:var(--text-primary)] outline-none"
            type="text"
            readOnly
            value={url}
            aria-label={t("preview.share.dialog.urlAriaLabel")}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="actionable" onClick={() => copy(url)} aria-live="polite">
            {showCopied ? t("preview.share.dialog.copied") : t("preview.share.dialog.copy")}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("preview.share.dialog.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
