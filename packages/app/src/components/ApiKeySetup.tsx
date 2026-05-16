import { useTranslation } from "../i18n/index.js";
import { Button } from "@/components/ui/button";

interface ApiKeySetupProps {
  onGoToSettings: () => void;
}

export function ApiKeySetup({ onGoToSettings }: ApiKeySetupProps) {
  const { t } = useTranslation();
  return (
    <div className="api-key-setup">
      <p className="api-key-setup__message">{t("chat.apiKeySetup.message")}</p>
      <Button variant="actionable" onClick={onGoToSettings}>
        {t("chat.apiKeySetup.goToSettings")}
      </Button>
    </div>
  );
}
