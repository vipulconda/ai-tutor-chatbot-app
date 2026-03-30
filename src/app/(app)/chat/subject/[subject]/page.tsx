"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface SubjectChatHubPageProps {
  params: Promise<{ subject: string }>;
}

interface ConversationSummary {
  id: string;
  subject: string;
  topic: string | null;
  updatedAt: string;
}

const chatTimestampFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const SUBJECT_META: Record<string, { icon: string; color: string }> = {
  Mathematics: { icon: "📐", color: "var(--color-math)" },
  Science: { icon: "🔬", color: "var(--color-science)" },
  "Social Science": { icon: "🌍", color: "var(--color-social)" },
  English: { icon: "📖", color: "var(--color-english)" },
  Hindi: { icon: "🇮🇳", color: "var(--color-hindi)" },
};

export default function SubjectChatHubPage({ params }: SubjectChatHubPageProps) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    params.then(({ subject: rawSubject }) => {
      const decodedSubject = decodeURIComponent(rawSubject);
      setSubject(decodedSubject);
    });
  }, [params]);

  useEffect(() => {
    if (!subject) {
      return;
    }

    async function loadConversations() {
      try {
        const res = await fetch(`/api/conversations?subject=${encodeURIComponent(subject)}`);
        const data = await res.json();
        setConversations(data.conversations || []);
      } catch (err) {
        console.error("Failed to load subject conversations:", err);
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    loadConversations();
  }, [subject]);

  const meta = useMemo(
    () => SUBJECT_META[subject] || { icon: "📚", color: "var(--color-primary)" },
    [subject]
  );

  const startNewChat = async () => {
    if (!subject || creating) {
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic: topic.trim() || null,
        }),
      });
      const data = await res.json();
      router.push(`/chat/${data.conversation.id}`);
    } catch (err) {
      console.error("Failed to start new chat:", err);
      alert("Failed to start chat");
      setCreating(false);
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete conversation");
      }

      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      alert("Failed to delete chat");
    }
  };

  return (
    <div className="page-content">
      <div className="top-bar">
        <button className="back-btn" onClick={() => router.push("/chat")}>
          ←
        </button>
        <h1 className="heading-2">Subject Chats</h1>
      </div>

      <div
        className="card mb-6"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          borderColor: `${meta.color}55`,
        }}
      >
        <div
          className="subject-icon"
          style={{
            background: `${meta.color}22`,
            border: `1.5px solid ${meta.color}44`,
          }}
        >
          {meta.icon}
        </div>
        <div>
          <div className="heading-3">{subject}</div>
          <div className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
            Continue a previous conversation or start a new topic
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="heading-3 mb-3">Start New Chat</div>
        <p className="text-secondary mb-4" style={{ fontSize: "var(--text-sm)" }}>
          Add a topic when you want a fresh thread for a new chapter, doubt, or homework set.
        </p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={`Example: ${subject} - Algebra revision`}
          style={{
            width: "100%",
            minHeight: 48,
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-bg-input)",
            border: "1.5px solid var(--color-border)",
            borderRadius: "var(--radius-xl)",
            color: "var(--color-text)",
            fontSize: "var(--text-base)",
            marginBottom: "var(--space-3)",
          }}
        />
        <button
          className="btn btn-primary btn-full"
          onClick={startNewChat}
          disabled={creating}
        >
          {creating ? "Starting..." : topic.trim() ? "Start New Topic Chat" : "Start New Chat"}
        </button>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="heading-3">Recent {subject} Chats</h2>
          <span className="badge badge-primary">{conversations.length}</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="skeleton" style={{ height: 76 }} />
            <div className="skeleton" style={{ height: 76 }} />
          </div>
        ) : conversations.length === 0 ? (
          <div className="card text-center">
            <div style={{ fontSize: "2rem", marginBottom: "var(--space-2)" }}>{meta.icon}</div>
            <div className="heading-3 mb-2">No chats yet</div>
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              Start your first {subject} conversation above.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-4)",
                  textAlign: "left",
                }}
              >
                <button
                  onClick={() => router.push(`/chat/${conversation.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "var(--radius-full)",
                    background: `${meta.color}22`,
                    border: `1px solid ${meta.color}44`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem",
                    flexShrink: 0,
                  }}
                >
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: "var(--weight-semibold)",
                      fontSize: "var(--text-sm)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {conversation.topic || `${subject} chat`}
                  </div>
                  <div className="text-secondary" style={{ fontSize: "var(--text-xs)" }}>
                    Updated{" "}
                    {chatTimestampFormatter.format(new Date(conversation.updatedAt))}
                  </div>
                </div>
                <span style={{ color: "var(--color-text-muted)" }}>→</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteConversation(conversation.id);
                  }}
                  aria-label={`Delete ${conversation.topic || `${subject} chat`}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-full)",
                    border: "1px solid var(--color-border)",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--color-text-muted)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
