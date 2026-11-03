import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../i18n/index.js";
import type { TourStep } from "./tour-steps.js";

interface TourPanelProps {
  step: TourStep;
  /** Zero-based. */
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  /** Ends the tour from any step: Skip, or Continue to editor on the last one. */
  onClose: () => void;
}

/**
 * The guided tour's panel (#3566): a small region, not a dialog. It holds no
 * focus and sits at the bottom left, over the file tree and the editor, which
 * the tour does not need; the diagram, the view tabs, the toolbar and the diff
 * banner below it stay in view.
 */
export function TourPanel({ step, index, total, onBack, onNext, onClose }: TourPanelProps) {
  const { t } = useTranslation();
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const forwardRef = useRef<HTMLButtonElement>(null);

  // Take focus when the panel appears with nothing else focused (right after
  // Welcome closes), so a keyboard user does not have to tab through the app.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) forwardRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <section
      aria-label={t("firstRun.tour.ariaLabel")}
      className="first-run-tour fixed bottom-12 left-4 z-[var(--z-floating-panel)] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--bg-overlay)] p-3 text-[color:var(--text-primary)] shadow-xl"
    >
      <div className="flex items-center justify-between text-[11px] text-[color:var(--text-secondary)]">
        <span>{t("firstRun.tour.heading")}</span>
        <span>{t("firstRun.tour.progress", { current: index + 1, total })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t("firstRun.tour.progressLabel")}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        className="h-1 overflow-hidden rounded-full bg-[color:var(--border-default)]"
      >
        <div
          className="h-full bg-[color:var(--accent)]"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t(step.title)}</h2>
        <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">{t(step.body)}</p>
        {step.notice && (
          <p className="border-l-2 border-[color:var(--accent)] pl-2 text-xs leading-relaxed">
            <strong>{t("firstRun.tour.notice")}:</strong> {t(step.notice)}
          </p>
        )}
        {step.questions && (
          <div className="text-xs leading-relaxed">
            <p className="font-medium">{t("firstRun.step.decision.questions")}</p>
            <ul className="list-disc pl-4 text-[color:var(--text-secondary)]">
              {step.questions.map((q) => (
                <li key={q}>{t(q)}</li>
              ))}
            </ul>
          </div>
        )}
        {step.done && <p className="text-xs leading-relaxed font-medium">{t(step.done)}</p>}
      </div>
      <div className="flex items-center gap-1 pt-1">
        {!isLast && <Button onClick={onClose}>{t("firstRun.tour.skip")}</Button>}
        <span className="flex-1" />
        {/* aria-disabled, not disabled: stepping back onto the first step would
            otherwise disable the focused button and drop focus to the page. */}
        <Button
          onClick={isFirst ? undefined : onBack}
          aria-disabled={isFirst}
          className={isFirst ? "opacity-50" : undefined}
        >
          {t("firstRun.tour.back")}
        </Button>
        <Button ref={forwardRef} variant="actionable" onClick={isLast ? onClose : onNext}>
          {isLast ? t("firstRun.tour.finish") : t("firstRun.tour.next")}
        </Button>
      </div>
    </section>
  );
}
