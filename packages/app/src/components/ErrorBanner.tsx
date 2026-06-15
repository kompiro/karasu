import { Button } from "@/components/ui/button";
import { useTranslation } from "../i18n/index.js";

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

/**
 * Dismissible error banner for transient action failures. Reuses the
 * `.export-error*` styling first introduced for the preview export error
 * (#1532 asks to reuse that pattern) — visually a light error strip with a
 * dismiss control.
 */
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const { t } = useTranslation();
  return (
    <div className="export-error" role="alert">
      <span className="export-error-message">{message}</span>
      <Button
        className="export-error-dismiss"
        onClick={onDismiss}
        aria-label={t("project.error.dismiss")}
      >
        {t("project.error.dismiss")}
      </Button>
    </div>
  );
}
