import { useEffect, useId, useRef, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "../../i18n/index.js";
import { FEEDBACK_DISCUSSION_URL } from "../../utils/feedback-discussions.js";
import type { TourStep } from "./tour-steps.js";

interface TourPanelProps {
  /** The guide's name. */
  heading: string;
  step: TourStep;
  /** Zero-based. */
  index: number;
  total: number;
  /** The visitor did what the step asks (#3599). */
  done?: boolean;
  /**
   * The step's scene has landed, so what the visitor does now counts toward
   * its ask. Exposed as `data-scene-landed` for the e2e to wait on.
   */
  landed?: boolean;
  onBack: () => void;
  onNext: () => void;
  /** Ends the tour from any step: Skip, or Continue to editor on the last one. */
  onClose: () => void;
  /** The offer to walk the guide on the other subject (#3601), when this step has it. */
  switchLabel?: string;
  onSwitch?: () => void;
  /** A switch is resolving its project: every button waits for it. */
  switching?: boolean;
}

/**
 * The guided tour's panel (#3566): a small region, not a dialog. It does not
 * trap focus and sits at the bottom left, over the file tree and the editor, which
 * the tour does not need; the diagram, the view tabs, the toolbar and the diff
 * banner below it stay in view.
 */
export function TourPanel({
  heading,
  step,
  index,
  total,
  done = false,
  landed = false,
  onBack,
  onNext,
  onClose,
  switchLabel,
  onSwitch,
  switching = false,
}: TourPanelProps) {
  const { t } = useTranslation();
  const doneId = useId();
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const forwardRef = useRef<HTMLButtonElement>(null);
  // aria-disabled, not disabled: a button that disables itself under the focus
  // would drop focus to the page.
  const unlessSwitching = <T,>(handler: T) => (switching ? undefined : handler);
  const lockClass = switching ? "opacity-50" : undefined;

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
      data-scene-landed={landed}
      className="first-run-tour fixed bottom-12 left-4 z-[var(--z-floating-panel)] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--bg-overlay)] p-3 text-[color:var(--text-primary)] shadow-xl"
    >
      <div className="flex items-center justify-between text-[11px] text-[color:var(--text-secondary)]">
        <span>{heading}</span>
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
        {done && (
          <p id={doneId} className="text-xs leading-relaxed text-[color:var(--accent)]">
            {t("firstRun.tour.stepDone")}
          </p>
        )}
        {step.done && <p className="text-xs leading-relaxed font-medium">{t(step.done)}</p>}
        {isLast && (
          // Every guide ends here, so this is where a first-time visitor is
          // asked what they thought (#3689).
          <a
            href={FEEDBACK_DISCUSSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs leading-relaxed text-[color:var(--text-link)] underline"
          >
            {t("firstRun.tour.feedback")}
          </a>
        )}
      </div>
      {switchLabel && (
        <Button
          className={cn("self-start", lockClass)}
          aria-disabled={switching}
          // The way back appears under the pointer, so the second click of a
          // double-click would undo the switch it just made.
          onClick={unlessSwitching((event: MouseEvent) => {
            if (event.detail <= 1) onSwitch?.();
          })}
        >
          {switchLabel}
        </Button>
      )}
      <div className="flex items-center gap-1 pt-1">
        {!isLast && (
          <Button
            className={lockClass}
            aria-disabled={switching}
            onClick={unlessSwitching(onClose)}
          >
            {t("firstRun.tour.skip")}
          </Button>
        )}
        <span className="flex-1" />
        {/* aria-disabled, not disabled: stepping back onto the first step would
            otherwise disable the focused button and drop focus to the page. */}
        <Button
          onClick={isFirst ? undefined : unlessSwitching(onBack)}
          aria-disabled={isFirst || switching}
          className={isFirst ? "opacity-50" : lockClass}
        >
          {t("firstRun.tour.back")}
        </Button>
        <Button
          ref={forwardRef}
          variant="actionable"
          aria-describedby={done ? doneId : undefined}
          aria-disabled={switching}
          className={lockClass}
          onClick={unlessSwitching(isLast ? onClose : onNext)}
        >
          {isLast ? t("firstRun.tour.finish") : t("firstRun.tour.next")}
        </Button>
      </div>
    </section>
  );
}
