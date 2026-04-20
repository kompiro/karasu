import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { SystemNode } from "@karasu-tools/core";
import { ApiKeySetup } from "./ApiKeySetup.js";
import { useChatSession, type PatchProposal } from "../hooks/useChatSession.js";
import { useTranslation } from "../i18n/index.js";

interface ChatPaneProps {
  scopeLabel: string;
  viewPath: string[];
  sessionResetKey: string | null;
  fileContent: string;
  currentFilePath: string | null;
  resolvedSystems: SystemNode[];
  apiKey: string | null;
  onNavigateViewPath: (path: string[]) => void;
  onEditorChange: (value: string) => void;
  onNavigateToSettings: () => void;
}

export function ChatPane({
  scopeLabel,
  viewPath,
  sessionResetKey,
  fileContent,
  currentFilePath,
  resolvedSystems,
  apiKey,
  onNavigateViewPath,
  onEditorChange,
  onNavigateToSettings,
}: ChatPaneProps) {
  const { t } = useTranslation();
  const {
    messages,
    phase,
    sendMessage,
    retryMessage,
    applyPatch,
    rejectPatch,
    resetSession,
    startReview,
    startInterview,
  } = useChatSession({
    fileContent,
    currentFilePath,
    scopeLabel,
    viewPath,
    resolvedSystems,
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
  const isEmpty = messages.length === 0 && !isLoading;

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
          {t("chat.newSession.button")}
        </button>
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {isEmpty && (
          <div className="chat-empty-state">
            <div className="chat-empty-state__actions">
              <button
                className="toolbar-btn toolbar-btn--actionable toolbar-btn--start-interview"
                onClick={() => void startInterview()}
              >
                {t("chat.startInterview.button")}
              </button>
              <button
                className="toolbar-btn toolbar-btn--actionable toolbar-btn--start-review"
                onClick={() => void startReview()}
              >
                {t("chat.startReview.button")}
              </button>
            </div>
            <p className="chat-empty-state__hint">{t("chat.emptyState.hint")}</p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="chat-message chat-message--user">
                <span className="chat-message-role">{t("chat.message.userRole")}</span>
                <p className="chat-message-content">{msg.content}</p>
              </div>
            );
          }
          if (msg.role === "assistant") {
            return (
              <div key={msg.id} className="chat-message chat-message--assistant">
                <span className="chat-message-role">AI</span>
                {msg.content && <MarkdownContent content={msg.content} />}
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
                  {t("chat.retry.button")}
                </button>
              )}
              {msg.errorType === "auth" && (
                <button
                  className="toolbar-btn toolbar-btn--go-to-settings"
                  onClick={onNavigateToSettings}
                >
                  {t("chat.openSettings.button")}
                </button>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="chat-message chat-message--loading" aria-live="polite">
            <span className="chat-loading-indicator">{t("chat.loading")}</span>
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
            isPending ? t("chat.input.placeholderPending") : t("chat.input.placeholderDefault")
          }
          rows={3}
          aria-label={t("chat.input.ariaLabel")}
          disabled={inputDisabled}
        />
        <button
          type="submit"
          className="toolbar-btn toolbar-btn--actionable toolbar-btn--send"
          disabled={inputDisabled || !inputValue.trim()}
        >
          {t("chat.send.button")}
        </button>
      </form>
    </div>
  );
}

// ── MarkdownContent ──────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);
  return (
    <div
      className="chat-message-content chat-message-content--markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
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
  const { t } = useTranslation();
  return (
    <div className="chat-patch-proposal">
      <p className="chat-patch-proposal__description">📝 {patch.description}</p>
      {patch.content && <pre className="chat-patch-proposal__code">{patch.content}</pre>}
      {isActive && (
        <div className="chat-patch-proposal__actions">
          <button
            className="toolbar-btn toolbar-btn--actionable toolbar-btn--apply-patch"
            onClick={() => onApply(patch)}
          >
            {t("chat.patch.apply.button")}
          </button>
          <button className="toolbar-btn toolbar-btn--reject-patch" onClick={() => onReject(patch)}>
            {t("chat.patch.reject.button")}
          </button>
        </div>
      )}
    </div>
  );
}
