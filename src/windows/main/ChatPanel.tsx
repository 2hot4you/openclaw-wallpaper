/**
 * ChatPanel — Right sidebar for chatting with agents.
 *
 * Pixel-art styled React component that overlays on the right side
 * of the Phaser scene. Shows chat history and allows sending messages.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import Markdown from "react-markdown";
import { useAppStore } from "../../stores/appStore";
import { useGatewayStore, type ChatMessage } from "../../stores/gatewayStore";
import { PIXEL_FONT, COLORS, pixelButton, pixelInput } from "../../styles/pixel-theme";

const PANEL_WIDTH = 360;

/** Format timestamp to HH:MM */
function formatTime(ts: number | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Truncate long messages for display */
function truncateContent(text: string, maxLen = 2000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export const ChatPanel: React.FC = () => {
  const chatPanelOpen = useAppStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useAppStore((s) => s.setChatPanelOpen);
  const chatSessionKey = useAppStore((s) => s.chatSessionKey);
  const sessions = useGatewayStore((s) => s.sessions);
  const agents = useGatewayStore((s) => s.agents);
  const fetchChatHistory = useGatewayStore((s) => s.fetchChatHistory);
  const sendMessage = useGatewayStore((s) => s.sendMessage);
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get session info
  const session = chatSessionKey ? sessions.find((s) => s.key === chatSessionKey) : null;
  const agent = session?.agentId ? agents.find((a) => a.agentId === session.agentId) : null;
  const displayName = session?.label ?? agent?.name ?? chatSessionKey?.split(":").pop() ?? "Agent";

  // Load chat history when panel opens or session changes
  useEffect(() => {
    if (!chatPanelOpen || !chatSessionKey || connectionStatus !== "connected") {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchChatHistory(chatSessionKey, 30).then((msgs) => {
      if (!cancelled) {
        setMessages(msgs);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [chatPanelOpen, chatSessionKey, connectionStatus, fetchChatHistory]);

  // Track whether user is at the bottom of the scroll
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    // Consider "at bottom" if within 40px of the end
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  // Auto-scroll to bottom only if user was already at the bottom
  useEffect(() => {
    if (scrollRef.current && isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (chatPanelOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [chatPanelOpen]);

  // Refresh chat periodically while open
  useEffect(() => {
    if (!chatPanelOpen || !chatSessionKey || connectionStatus !== "connected") return;

    const timer = setInterval(() => {
      fetchChatHistory(chatSessionKey, 30).then(setMessages);
    }, 5000);

    return () => clearInterval(timer);
  }, [chatPanelOpen, chatSessionKey, connectionStatus, fetchChatHistory]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !chatSessionKey || sending) return;

    const text = inputText.trim();
    setInputText("");
    setSending(true);

    // Optimistic: add user message immediately
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: Date.now() },
    ]);

    try {
      await sendMessage(chatSessionKey, text);
      // Refresh to get the response after a short delay
      setTimeout(async () => {
        const updated = await fetchChatHistory(chatSessionKey, 30);
        setMessages(updated);
        setSending(false);
      }, 2000);
    } catch {
      setSending(false);
    }
  }, [inputText, chatSessionKey, sending, sendMessage, fetchChatHistory]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!chatPanelOpen) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: PANEL_WIDTH,
        height: "100vh",
        background: COLORS.bg,
        borderLeft: `2px solid ${COLORS.borderDim}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        animation: "slideInRight 0.2s ease-out",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: `2px solid ${COLORS.borderDim}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: COLORS.bgLight,
          minHeight: 40,
        }}
      >
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: "11px",
            color: COLORS.textBright,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          💬 {displayName}
        </div>
        <button
          onClick={() => setChatPanelOpen(false)}
          style={{
            ...pixelButton,
            padding: "4px 8px",
            background: "transparent",
            border: "none",
            boxShadow: "none",
            fontSize: "13px",
            cursor: "pointer",
          }}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {loading && (
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.textDim, textAlign: "center", padding: 20 }}>
            Loading...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.textDim, textAlign: "center", padding: 20 }}>
            No messages yet
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {sending && (
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.warning, textAlign: "center", padding: 4 }}>
            ⏳ Waiting for response...
          </div>
        )}
      </div>

      {/* Input */}
      <div
        style={{
          padding: "8px",
          borderTop: `2px solid ${COLORS.borderDim}`,
          background: COLORS.bgLight,
          display: "flex",
          gap: "6px",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={sending || connectionStatus !== "connected"}
          style={{
            ...pixelInput,
            flex: 1,
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !inputText.trim() || connectionStatus !== "connected"}
          style={{
            ...pixelButton,
            opacity: sending || !inputText.trim() ? 0.5 : 1,
          }}
        >
          ▶
        </button>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// ── Message Bubble ──────────────────────────────────────

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
      {/* Role label */}
      <div
        style={{
          fontFamily: PIXEL_FONT,
          fontSize: "12px",
          color: COLORS.textDim,
          marginBottom: 2,
          padding: "0 4px",
        }}
      >
        {isUser ? "You" : isSystem ? "System" : "🤖 Agent"}
        {message.timestamp && ` · ${formatTime(message.timestamp)}`}
      </div>

      {/* Bubble */}
      <div
        className="chat-bubble-md"
        style={{
          fontFamily: '"Segoe UI", "Noto Sans SC", sans-serif',
          fontSize: "13px",
          lineHeight: 1.6,
          padding: "8px 10px",
          borderRadius: 6,
          maxWidth: "90%",
          wordBreak: "break-word",
          background: isUser
            ? COLORS.bgPanel
            : isSystem
              ? "rgba(255,255,255,0.05)"
              : COLORS.bgLight,
          color: isUser ? COLORS.textBright : COLORS.text,
          border: `1px solid ${isUser ? COLORS.borderDim : COLORS.inputBorder}`,
        }}
      >
        {isUser ? (
          <span style={{ whiteSpace: "pre-wrap" }}>{truncateContent(message.content)}</span>
        ) : (
          <Markdown
            components={{
              p: ({ children }) => <p style={{ margin: "4px 0" }}>{children}</p>,
              h1: ({ children }) => <h1 style={{ fontSize: "16px", fontWeight: "bold", margin: "8px 0 4px", color: COLORS.textBright }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: "15px", fontWeight: "bold", margin: "8px 0 4px", color: COLORS.textBright }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: "14px", fontWeight: "bold", margin: "6px 0 3px", color: COLORS.textBright }}>{children}</h3>,
              ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: "16px" }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: "16px" }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
              strong: ({ children }) => <strong style={{ color: COLORS.textBright, fontWeight: "bold" }}>{children}</strong>,
              em: ({ children }) => <em style={{ color: COLORS.warning }}>{children}</em>,
              code: ({ children, className }) => {
                const isBlock = className?.includes("language-");
                if (isBlock) {
                  return (
                    <pre style={{
                      background: "rgba(0,0,0,0.4)",
                      border: `1px solid ${COLORS.borderDim}`,
                      borderRadius: 4,
                      padding: "8px",
                      margin: "6px 0",
                      overflowX: "auto",
                      fontSize: "12px",
                      fontFamily: '"Fira Code", "Consolas", monospace',
                      lineHeight: 1.4,
                    }}>
                      <code style={{ color: COLORS.success }}>{children}</code>
                    </pre>
                  );
                }
                return (
                  <code style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: "1px 4px",
                    borderRadius: 3,
                    fontSize: "12px",
                    fontFamily: '"Fira Code", "Consolas", monospace',
                    color: COLORS.warning,
                  }}>
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => <>{children}</>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer" style={{ color: COLORS.accent, textDecoration: "underline" }}>
                  {children}
                </a>
              ),
              blockquote: ({ children }) => (
                <blockquote style={{
                  borderLeft: `3px solid ${COLORS.warning}`,
                  margin: "6px 0",
                  padding: "4px 10px",
                  background: "rgba(255,255,255,0.03)",
                  color: COLORS.textDim,
                }}>
                  {children}
                </blockquote>
              ),
              hr: () => <hr style={{ border: "none", borderTop: `1px solid ${COLORS.borderDim}`, margin: "8px 0" }} />,
              table: ({ children }) => (
                <div style={{ overflowX: "auto", margin: "6px 0" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: "12px", width: "100%" }}>{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th style={{ border: `1px solid ${COLORS.borderDim}`, padding: "4px 8px", background: "rgba(255,255,255,0.05)", fontWeight: "bold", textAlign: "left" }}>{children}</th>
              ),
              td: ({ children }) => (
                <td style={{ border: `1px solid ${COLORS.borderDim}`, padding: "4px 8px" }}>{children}</td>
              ),
            }}
          >
            {truncateContent(message.content)}
          </Markdown>
        )}
      </div>

      {/* Model info for assistant messages */}
      {message.model && !isUser && (
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: "11px",
            color: COLORS.textDim,
            padding: "1px 4px",
            marginTop: 1,
          }}
        >
          🧠 {message.model}
        </div>
      )}
    </div>
  );
};
