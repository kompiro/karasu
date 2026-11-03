import type { ReactNode } from "react";
import { Compass, GitCompareArrows, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "../../i18n/index.js";

export type WelcomeChoice = "design" | "understand" | "evolve" | "editor";

interface WelcomeDialogProps {
  open: boolean;
  /** Every way out is a choice; Esc and a click outside count as "editor". */
  onChoose: (choice: WelcomeChoice) => void;
}

/**
 * The first-run Welcome (#3565): what karasu is for, and three places to start.
 * Only Design a service split is a guided path; the other two open a sample
 * and leave the visitor in it (PRD #3573 §5).
 */
export function WelcomeDialog({ open, onChoose }: WelcomeDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onChoose("editor")}>
      <DialogContent className="first-run-welcome w-[92vw] max-w-[560px] gap-4" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug">{t("firstRun.welcome.title")}</DialogTitle>
          <DialogDescription>{t("firstRun.welcome.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[color:var(--text-secondary)]">
            {t("firstRun.welcome.question")}
          </p>
          <EntryCard
            icon={<Split aria-hidden className="size-4" />}
            title={t("firstRun.welcome.design.title")}
            description={t("firstRun.welcome.design.description")}
            badge={t("firstRun.welcome.design.badge")}
            onClick={() => onChoose("design")}
          />
          <EntryCard
            icon={<Compass aria-hidden className="size-4" />}
            title={t("firstRun.welcome.understand.title")}
            description={t("firstRun.welcome.understand.description")}
            onClick={() => onChoose("understand")}
          />
          <EntryCard
            icon={<GitCompareArrows aria-hidden className="size-4" />}
            title={t("firstRun.welcome.evolve.title")}
            description={t("firstRun.welcome.evolve.description")}
            onClick={() => onChoose("evolve")}
          />
        </div>
        <DialogFooter className="flex-col items-center gap-2 sm:flex-col">
          <Button size="md" onClick={() => onChoose("editor")}>
            {t("firstRun.welcome.openEditor")}
          </Button>
          <p className="text-center text-[11px] text-[color:var(--text-muted)]">
            {t("firstRun.welcome.footnote")}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="actionable"
      size="md"
      className="h-auto w-full items-start justify-start gap-3 py-3 text-left whitespace-normal"
      onClick={onClick}
    >
      <span className="mt-0.5 text-[color:var(--accent)]">{icon}</span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--text-primary)]">
          {title}
          {badge && (
            <span className="rounded-full border border-[color:var(--accent-border)] px-1.5 text-[10px] font-medium text-[color:var(--accent)]">
              {badge}
            </span>
          )}
        </span>
        <span className="text-xs font-normal text-[color:var(--text-secondary)]">
          {description}
        </span>
      </span>
    </Button>
  );
}
