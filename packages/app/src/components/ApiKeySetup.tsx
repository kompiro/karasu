import { useTranslation } from "../i18n/index.js";

interface ApiKeySetupProps {
  onGoToSettings: () => void;
}

export function ApiKeySetup({ onGoToSettings }: ApiKeySetupProps) {
  const { t } = useTranslation();
  return (
    <div className="api-key-setup">
      <p className="api-key-setup__message">{t("chat.apiKeySetup.message")}</p>
      <button
        className="toolbar-btn toolbar-btn--actionable toolbar-btn--go-to-settings"
        onClick={onGoToSettings}
      >
        {t("chat.apiKeySetup.goToSettings")}
      </button>
    </div>
  );
}
