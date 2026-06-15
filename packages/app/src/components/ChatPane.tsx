import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { SystemNode, OrganizationBlock } from "@karasu-tools/core";
import { ApiKeySetup } from "./ApiKeySetup.js";
import { useChatSession, type PatchProposal } from "../hooks/useChatSession.js";
import { useTranslation } from "../i18n/index.js";
import { Button } from "@/components/ui/button";

interface ChatPaneProps {
  scopeLabel: string;
  viewPath: string[];
  sessionResetKey: string | null;
  fileContent: string;
  currentFilePath: string | null;
  resolvedSystems: SystemNode[];
  organizations: OrganizationBlock[];
  ownerIndex: Map<string, string>;
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
  organizations,
  ownerIndex,
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
    organizations,
    ownerIndex,
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
        <Button onClick={resetSession} disabled={isLoading}>
          {t("chat.newSession.button")}
        </Button>
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {isEmpty && (
          <div className="chat-empty-state">
            <div className="chat-empty-state__actions">
              <Button variant="actionable" size="md" onClick={() => void startInterview()}>
                {t("chat.startInterview.button")}
              </Button>
              <Button variant="actionable" size="md" onClick={() => void startReview()}>
                {t("chat.startReview.button")}
              </Button>
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
                <Button variant="actionable" onClick={() => retryMessage(msg.retryMessageId!)}>
                  {t("chat.retry.button")}
                </Button>
              )}
              {msg.errorType === "auth" && (
                <Button onClick={onNavigateToSettings}>{t("chat.openSettings.button")}</Button>
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
        <Button type="submit" variant="actionable" disabled={inputDisabled || !inputValue.trim()}>
          {t("chat.send.button")}
        </Button>
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
          <Button variant="actionable" onClick={() => onApply(patch)}>
            {t("chat.patch.apply.button")}
          </Button>
          <Button onClick={() => onReject(patch)}>{t("chat.patch.reject.button")}</Button>
        </div>
      )}
    </div>
  );
}
