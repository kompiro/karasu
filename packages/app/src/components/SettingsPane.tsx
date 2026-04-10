import { useState } from "react";
import {
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  getPersistSetting,
  type PersistSetting,
} from "../utils/api-key-storage.js";

interface SettingsPaneProps {
  onApiKeyChange: () => void;
}

export function SettingsPane({ onApiKeyChange }: SettingsPaneProps) {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey() ?? "");
  const [persist, setPersist] = useState<PersistSetting>(() => getPersistSetting());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!apiKey.trim()) return;
    setStoredApiKey(apiKey.trim(), persist);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        <h2 className="settings-section__title">⚙ AI 設定</h2>

        <div className="settings-security-notice">
          <p className="settings-security-notice__heading">⚠ セキュリティについて</p>
          <p>
            このツールは Claude API キーをブラウザ上で直接使用します。
            API キーはこのブラウザ内にのみ保存され、外部サーバーには送信されません。
          </p>
          <p>
            ただし、XSS 攻撃を受けた場合にキーが漏洩するリスクがあります。
            Anthropic コンソールで karasu 専用の制限付きキーを発行することを推奨します。
          </p>
          <a
            className="settings-security-notice__link"
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            → console.anthropic.com でキーを管理
          </a>
        </div>

        <div className="settings-field">
          <label className="settings-field__label" htmlFor="settings-api-key">
            Claude API キー
          </label>
          <input
            id="settings-api-key"
            className="settings-field__input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            aria-label="Claude API key"
          />
        </div>

        <div className="settings-field settings-field--checkbox">
          <label className="settings-field__label settings-field__label--checkbox">
            <input
              type="checkbox"
              checked={persist === "local"}
              onChange={(e) => setPersist(e.target.checked ? "local" : "session")}
              aria-label="Persist API key across sessions"
            />
            セッションをまたいで保存する（localStorage に保存）
          </label>
          <p className="settings-field__hint">
            オフの場合、タブを閉じると API キーは削除されます（推奨）。
          </p>
        </div>

        <div className="settings-actions">
          <button
            className="toolbar-btn toolbar-btn--actionable toolbar-btn--save-key"
            onClick={handleSave}
            disabled={!apiKey.trim()}
          >
            {saved ? "✓ 保存しました" : "💾 保存する"}
          </button>
          {getStoredApiKey() && (
            <button className="toolbar-btn toolbar-btn--clear-key" onClick={handleClear}>
              🗑 削除する
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
