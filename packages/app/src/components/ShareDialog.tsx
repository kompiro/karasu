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
import { useTranslation } from "../i18n/index.js";

interface ShareDialogProps {
  open: boolean;
  /** The share URL, or `null` while it is still being generated (flattening). */
  url: string | null;
  /** Whether the URL is currently on the clipboard (real result, owned by parent). */
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

/**
 * Share dialog for karasu-nest inline sharing (design:
 * docs/design/karasu-nest-hosted-preview.md, UI section).
 *
 * Shows the generated inline URL in a read-only field (selected on focus) with
 * a copy action. The Share button copies eagerly, but the dialog's Copy button
 * is the reliable cross-browser path (a fresh user gesture) and reflects the
 * real clipboard result via `copied`.
 */
export function ShareDialog({ open, url, copied, onCopy, onClose }: ShareDialogProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  // Select the URL once it's ready so a manual Cmd/Ctrl+C works too. setTimeout
  // lets Radix's focus-on-open settle first (dialog.md checklist).
  useEffect(() => {
    if (!open || url === null) return;
    const id = window.setTimeout(() => inputRef.current?.select(), 0);
    return () => window.clearTimeout(id);
  }, [open, url]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[90vw] max-w-[560px] gap-3" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{t("preview.share.dialog.title")}</DialogTitle>
          <DialogDescription>{t("preview.share.dialog.description")}</DialogDescription>
        </DialogHeader>
        {url === null ? (
          <p className="text-sm text-[color:var(--text-secondary)]">
            {t("preview.share.dialog.generating")}
          </p>
        ) : (
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
            <Button variant="actionable" onClick={onCopy} aria-live="polite">
              {copied ? t("preview.share.dialog.copied") : t("preview.share.dialog.copy")}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("preview.share.dialog.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
