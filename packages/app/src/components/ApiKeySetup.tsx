interface ApiKeySetupProps {
  onGoToSettings: () => void;
}

export function ApiKeySetup({ onGoToSettings }: ApiKeySetupProps) {
  return (
    <div className="api-key-setup">
      <p className="api-key-setup__message">
        AI 機能を使うには Claude API キーが必要です。
      </p>
      <button
        className="toolbar-btn toolbar-btn--actionable toolbar-btn--go-to-settings"
        onClick={onGoToSettings}
      >
        ⚙ Settings で設定する
      </button>
    </div>
  );
}
