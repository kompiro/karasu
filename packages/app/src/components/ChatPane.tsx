import { useEffect, useRef, useState } from "react";
import { ApiKeySetup } from "./ApiKeySetup.js";
import { useChatSession, type PatchProposal } from "../hooks/useChatSession.js";

interface ChatPaneProps {
  scopeLabel: string;
  sessionResetKey: string | null;
  fileContent: string;
  currentFilePath: string | null;
  apiKey: string | null;
  onNavigateViewPath: (path: string[]) => void;
  onEditorChange: (value: string) => void;
  onNavigateToSettings: () => void;
}

export function ChatPane({
  scopeLabel,
  sessionResetKey,
  fileContent,
  currentFilePath,
  apiKey,
  onNavigateViewPath,
  onEditorChange,
  onNavigateToSettings,
}: ChatPaneProps) {
  const { messages, phase, sendMessage, retryMessage, applyPatch, rejectPatch, resetSession } =
    useChatSession({
      fileContent,
      currentFilePath,
      scopeLabel,
      apiKey,
      onNavigateViewPath,
      onEditorChange,
      sessionResetKey,
    });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  const isPending = phase.kind === "pending_confirmation";
  const isLoading = phase.kind === "loading" || phase.kind === "awaiting_followup";
  const inputDisabled = isLoading || isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || inputDisabled) return;
    setInputValue("");
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!apiKey) {
    return (
      <div className="chat-pane">
        <div className="chat-header">
          <span className="chat-scope-indicator">📍 {scopeLabel}</span>
        </div>
        <ApiKeySetup onGoToSettings={onNavigateToSettings} />
      </div>
    );
  }

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <span className="chat-scope-indicator">📍 {scopeLabel}</span>
        <button
          className="toolbar-btn toolbar-btn--new-session"
          onClick={resetSession}
          disabled={isLoading}
        >
          ↺ New Session
        </button>
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">メッセージを入力してください。</p>}
        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="chat-message chat-message--user">
                <span className="chat-message-role">You</span>
                <p className="chat-message-content">{msg.content}</p>
              </div>
            );
          }
          if (msg.role === "assistant") {
            return (
              <div key={msg.id} className="chat-message chat-message--assistant">
                <span className="chat-message-role">AI</span>
                {msg.content && <p className="chat-message-content">{msg.content}</p>}
                {msg.patch && (
                  <PatchConfirmation
                    patch={msg.patch}
                    isActive={isPending}
                    onApply={applyPatch}
                    onReject={rejectPatch}
                  />
                )}
              </div>
            );
          }
          // error
          return (
            <div key={msg.id} className="chat-message chat-message--error">
              <p className="chat-message-content">{msg.content}</p>
              {msg.errorType !== "auth" && msg.retryMessageId && (
                <button
                  className="toolbar-btn toolbar-btn--actionable toolbar-btn--retry"
                  onClick={() => retryMessage(msg.retryMessageId!)}
                >
                  ↺ 再試行
                </button>
              )}
              {msg.errorType === "auth" && (
                <button
                  className="toolbar-btn toolbar-btn--go-to-settings"
                  onClick={onNavigateToSettings}
                >
                  ⚙ Settings を開く
                </button>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="chat-message chat-message--loading" aria-live="polite">
            <span className="chat-loading-indicator">AI が考えています…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isPending
              ? "パッチを確認してから送信してください"
              : "Type a message… (Cmd+Enter or Ctrl+Enter to send)"
          }
          rows={3}
          aria-label="Chat message input"
          disabled={inputDisabled}
        />
        <button
          type="submit"
          className="toolbar-btn toolbar-btn--actionable toolbar-btn--send"
          disabled={inputDisabled || !inputValue.trim()}
        >
          ↑ Send
        </button>
      </form>
    </div>
  );
}

// ── PatchConfirmation ─────────────────────────────────────────────────────────

interface PatchConfirmationProps {
  patch: PatchProposal;
  isActive: boolean;
  onApply: (proposal: PatchProposal) => Promise<void>;
  onReject: (proposal: PatchProposal) => Promise<void>;
}

function PatchConfirmation({ patch, isActive, onApply, onReject }: PatchConfirmationProps) {
  return (
    <div className="chat-patch-proposal">
      <p className="chat-patch-proposal__description">📝 {patch.description}</p>
      <pre className="chat-patch-proposal__code">{patch.content}</pre>
      {isActive && (
        <div className="chat-patch-proposal__actions">
          <button
            className="toolbar-btn toolbar-btn--actionable toolbar-btn--apply-patch"
            onClick={() => onApply(patch)}
          >
            ✓ Apply
          </button>
          <button className="toolbar-btn toolbar-btn--reject-patch" onClick={() => onReject(patch)}>
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
}
