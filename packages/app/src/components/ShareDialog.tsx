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
  /**
   * The private `#s=` URL (never sent to the server), or `null` while it is
   * still being generated (flattening).
   */
  fragmentUrl: string | null;
  /**
   * The server-visible `/s?s=` URL that unfurls with the diagram (OGP), or
   * `null` when the payload is too large for a query URL (oversize fallback).
   * Only meaningful once `fragmentUrl` is non-null (generation finished).
   */
  unfurlUrl: string | null;
  /** Which URL currently shows the "copied" feedback (owned by parent). */
  copiedUrl: string | null;
  onCopy: (url: string) => void;
  onClose: () => void;
}

/**
 * Share dialog for karasu-nest inline sharing (design:
 * docs/design/karasu-nest-ogp-share-page.md → ADR follow-up of
 * ADR-20260626-01, Issue #1801).
 *
 * Offers two links and spells out the trade-off so the user chooses
 * deliberately:
 * - **Private** (`#s=`): never reaches the server, but no link preview.
 * - **Preview** (`/s?s=`): unfurls with the diagram in Slack/X/etc., at the
 *   cost of the shared content being server-visible.
 *
 * When the project is too large to fit a query URL, the preview link is
 * dropped (`unfurlUrl === null`) and an oversize note is shown — the private
 * link still works.
 */
export function ShareDialog({
  open,
  fragmentUrl,
  unfurlUrl,
  copiedUrl,
  onCopy,
  onClose,
}: ShareDialogProps) {
  const { t } = useTranslation();
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Select the first URL once it's ready so a manual Cmd/Ctrl+C works too.
  // setTimeout lets Radix's focus-on-open settle first (dialog.md checklist).
  useEffect(() => {
    if (!open || fragmentUrl === null) return;
    const id = window.setTimeout(() => firstInputRef.current?.select(), 0);
    return () => window.clearTimeout(id);
  }, [open, fragmentUrl]);

  function renderField(
    url: string,
    label: string,
    hint: string,
    ariaLabel: string,
    ref?: React.Ref<HTMLInputElement>,
  ) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[color:var(--text-primary)]">{label}</span>
        <div className="flex items-center gap-2">
          <input
            ref={ref}
            className="min-w-0 flex-1 rounded border border-[color:var(--border-strong)] bg-transparent px-2 py-1 font-mono text-xs text-[color:var(--text-primary)] outline-none"
            type="text"
            readOnly
            value={url}
            aria-label={ariaLabel}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="actionable" onClick={() => onCopy(url)} aria-live="polite">
            {copiedUrl === url ? t("preview.share.dialog.copied") : t("preview.share.dialog.copy")}
          </Button>
        </div>
        <span className="text-xs text-[color:var(--text-secondary)]">{hint}</span>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[90vw] max-w-[560px] gap-3" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{t("preview.share.dialog.title")}</DialogTitle>
          <DialogDescription>{t("preview.share.dialog.description")}</DialogDescription>
        </DialogHeader>
        {fragmentUrl === null ? (
          <p className="text-sm text-[color:var(--text-secondary)]">
            {t("preview.share.dialog.generating")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {renderField(
              fragmentUrl,
              t("preview.share.dialog.privateLabel"),
              t("preview.share.dialog.privateHint"),
              t("preview.share.dialog.privateUrlAriaLabel"),
              firstInputRef,
            )}
            {unfurlUrl === null ? (
              <p className="text-xs text-[color:var(--text-secondary)]">
                {t("preview.share.dialog.oversizeWarning")}
              </p>
            ) : (
              renderField(
                unfurlUrl,
                t("preview.share.dialog.unfurlLabel"),
                t("preview.share.dialog.unfurlHint"),
                t("preview.share.dialog.unfurlUrlAriaLabel"),
              )
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("preview.share.dialog.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
