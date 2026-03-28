/**
 * ChatPanel — Right sidebar for chatting with agents.
 *
 * Pixel-art styled React component that overlays on the right side
 * of the Phaser scene. Shows chat history and allows sending messages.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import { useGatewayStore, type ChatMessage } from "../../stores/gatewayStore";
import { PIXEL_FONT, COLORS, pixelButton, pixelInput } from "../../styles/pixel-theme";

const PANEL_WIDTH = 320;

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

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
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
        width: PANEL_WIDTH,
        minWidth: PANEL_WIDTH,
        height: "100vh",
        background: COLORS.bg,
        borderLeft: `2px solid ${COLORS.borderDim}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        animation: "slideInRight 0.2s ease-out",
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
            fontSize: "8px",
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
            fontSize: "10px",
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
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.textDim, textAlign: "center", padding: 20 }}>
            Loading...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.textDim, textAlign: "center", padding: 20 }}>
            No messages yet
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {sending && (
          <div style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.warning, textAlign: "center", padding: 4 }}>
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
          fontSize: "6px",
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
        style={{
          fontFamily: PIXEL_FONT,
          fontSize: "7px",
          lineHeight: 1.8,
          padding: "6px 8px",
          borderRadius: 4,
          maxWidth: "90%",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          background: isUser
            ? COLORS.bgPanel
            : isSystem
              ? "rgba(255,255,255,0.05)"
              : COLORS.bgLight,
          color: isUser ? COLORS.textBright : COLORS.text,
          border: `1px solid ${isUser ? COLORS.borderDim : COLORS.inputBorder}`,
        }}
      >
        {truncateContent(message.content)}
      </div>

      {/* Model info for assistant messages */}
      {message.model && !isUser && (
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: "5px",
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
