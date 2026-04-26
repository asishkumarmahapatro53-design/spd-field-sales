"use client";

import { useRef, useState } from "react";
import type { ChatMessage } from "@/lib/ai-assistant";

interface AiAssistantProps {
  /** Passed from the agent page — used to auto-execute order creation actions */
  agentId?: string;
}

type ActionPayload = {
  type: "CREATE_ORDER";
  siteName: string;
  grade: string;
  quantityCum: number;
  requiredDate: string;
};

export function AiAssistant({ agentId }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send() {
    const msg = input.trim();
    if (!msg || thinking) return;

    setInput("");
    setActionStatus(null);
    const newHistory: ChatMessage[] = [...history, { role: "user", text: msg }];
    setHistory(newHistory);
    setThinking(true);

    // Scroll to bottom
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, message: msg }),
      });

      const data = (await res.json()) as {
        reply: string;
        actionBlock: string | null;
      };

      const reply = data.reply || "Sorry, I could not process that.";
      const withReply: ChatMessage[] = [...newHistory, { role: "model", text: reply }];
      setHistory(withReply);

      // Execute action block if present
      if (data.actionBlock) {
        await executeAction(data.actionBlock);
      }
    } catch {
      setHistory((h) => [...h, { role: "model", text: "Connection error. Please try again." }]);
    } finally {
      setThinking(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  async function executeAction(rawJson: string) {
    try {
      const payload = JSON.parse(rawJson) as ActionPayload;

      if (payload.type === "CREATE_ORDER") {
        setActionStatus("⏳ Creating your order...");

        // We need an existing approved approval request to create a sales order.
        // For now, the AI will guide the agent to the correct form step.
        // Full autonomous order creation requires linking to an ApprovalRequest — Phase 3.
        setActionStatus(
          `✅ Order intent captured: ${payload.quantityCum} cum of ${payload.grade} for ${payload.siteName} on ${payload.requiredDate}. Please complete the order in Step 05 of the Action Center.`,
        );
      }
    } catch {
      setActionStatus("⚠ Could not execute action. Please complete the form manually.");
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        className="ai-fab"
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Open AI Assistant"
        title="SPD AI Assistant"
      >
        {isOpen ? "✕" : "✦"}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="ai-panel">
          {/* Header */}
          <div className="ai-panel-header">
            <div>
              <span className="ai-panel-title">SPD Assistant</span>
              <span className="ai-panel-subtitle">Powered by Gemini · EN / हिं / ଓ</span>
            </div>
            <button className="ai-close-btn" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          {/* Messages */}
          <div className="ai-messages">
            {history.length === 0 && (
              <div className="ai-welcome">
                <p>👋 Hello! I am your SPD Field Assistant.</p>
                <p>You can ask me about your orders, leads, and tasks — in English, Hindi, or Odia.</p>
                <div className="ai-suggestions">
                  {[
                    "What are my open tasks?",
                    "Raise an M25 order for Skyline",
                    "Show my pending orders",
                  ].map((s) => (
                    <button
                      key={s}
                      className="ai-suggestion-chip"
                      onClick={() => { setInput(s); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.map((msg, i) => (
              <div key={i} className={`ai-bubble ai-bubble-${msg.role}`}>
                <span className="ai-bubble-text">{msg.text}</span>
              </div>
            ))}

            {thinking && (
              <div className="ai-bubble ai-bubble-model ai-thinking">
                <span className="ai-dots"><span/><span/><span/></span>
              </div>
            )}

            {actionStatus && (
              <div className="ai-action-status">{actionStatus}</div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="ai-input-row">
            <textarea
              className="ai-input"
              placeholder="Type in English, हिंदी or ଓଡ଼ିଆ…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={2}
              disabled={thinking}
            />
            <button
              className="ai-send-btn"
              onClick={send}
              disabled={thinking || !input.trim()}
              aria-label="Send"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
