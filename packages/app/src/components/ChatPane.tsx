import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPaneProps {
  viewPath: string[];
  sessionResetKey: string | null;
}

export function ChatPane({ viewPath, sessionResetKey }: ChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset session when project changes
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [sessionResetKey]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  const scopeLabel = viewPath.length === 0 ? "Root" : viewPath.join(" > ");

  const handleNewSession = () => {
    setMessages([]);
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setInput("");
    // AI integration comes in Phase 2
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <span className="chat-scope-indicator">📍 {scopeLabel}</span>
        <button className="toolbar-btn toolbar-btn--new-session" onClick={handleNewSession}>
          ↺ New Session
        </button>
      </div>
      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">AI integration coming in Phase 2.</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-message--${msg.role}`}>
            <span className="chat-message-role">{msg.role === "user" ? "You" : "AI"}</span>
            <p className="chat-message-content">{msg.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={3}
          aria-label="Chat message input"
        />
        <button
          type="submit"
          className="toolbar-btn toolbar-btn--actionable toolbar-btn--send"
          disabled={!input.trim()}
        >
          ↑ Send
        </button>
      </form>
    </div>
  );
}
