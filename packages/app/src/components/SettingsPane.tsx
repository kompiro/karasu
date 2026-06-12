import { useState } from "react";
import {
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  getPersistSetting,
  type PersistSetting,
} from "../utils/api-key-storage.js";
import { useTransientFlag } from "../hooks/useTransientFlag.js";
import { useTranslation } from "../i18n/index.js";
import type { Locale } from "../i18n/locale.js";
import { useTheme, type ThemePreference } from "../theme/index.js";
import { Button } from "@/components/ui/button";

interface SettingsPaneProps {
  onApiKeyChange: () => void;
}

export function SettingsPane({ onApiKeyChange }: SettingsPaneProps) {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [apiKey, setApiKey] = useState(() => getStoredApiKey() ?? "");
  const [persist, setPersist] = useState<PersistSetting>(() => getPersistSetting());
  // The "Saved" affordance auto-resets after 2s; useTransientFlag owns the
  // timer lifecycle (unmount cleanup + clean re-arm on rapid re-save, #1539).
  const [saved, markSaved] = useTransientFlag(2000);

  const handleSave = () => {
    if (!apiKey.trim()) return;
    setStoredApiKey(apiKey.trim(), persist);
    markSaved();
    onApiKeyChange();
  };

  const handleClear = () => {
    clearStoredApiKey();
    setApiKey("");
    setPersist("session");
    onApiKeyChange();
  };

  return (
    <div className="settings-pane">
      <section className="settings-section">
        <h2 className="settings-section__title">🌐 {t("languageSelector.label")}</h2>

        <div className="settings-field">
          <select
            id="settings-language"
            className="settings-field__input"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={t("languageSelector.label")}
          >
            <option value="en">{t("languageSelector.english")}</option>
            <option value="ja">{t("languageSelector.japanese")}</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">🎨 {t("theme.label")}</h2>

        <div className="settings-field">
          <select
            id="settings-theme"
            className="settings-field__input"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemePreference)}
            aria-label={t("theme.label")}
          >
            <option value="system">{t("theme.system")}</option>
            <option value="light">{t("theme.light")}</option>
            <option value="dark">{t("theme.dark")}</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">{t("settings.ai.title")}</h2>

        <div className="settings-security-notice">
          <p className="settings-security-notice__heading">{t("settings.security.heading")}</p>
          <p>{t("settings.security.bodyBrowser")}</p>
          <p>{t("settings.security.bodyXss")}</p>
          <a
            className="settings-security-notice__link"
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("settings.security.linkLabel")}
          </a>
        </div>

        <div className="settings-field">
          <label className="settings-field__label" htmlFor="settings-api-key">
            {t("settings.apiKey.label")}
          </label>
          <input
            id="settings-api-key"
            className="settings-field__input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            aria-label={t("settings.apiKey.label")}
          />
        </div>

        <div className="settings-field settings-field--checkbox">
          <label className="settings-field__label settings-field__label--checkbox">
            <input
              type="checkbox"
              checked={persist === "local"}
              onChange={(e) => setPersist(e.target.checked ? "local" : "session")}
              aria-label={t("settings.persist.label")}
            />
            {t("settings.persist.label")}
          </label>
          <p className="settings-field__hint">{t("settings.persist.hint")}</p>
        </div>

        <div className="settings-actions">
          <Button variant="actionable" onClick={handleSave} disabled={!apiKey.trim()}>
            {saved ? t("settings.save.saved") : t("settings.save.label")}
          </Button>
          {getStoredApiKey() && <Button onClick={handleClear}>{t("settings.clear.label")}</Button>}
        </div>
      </section>
    </div>
  );
}
