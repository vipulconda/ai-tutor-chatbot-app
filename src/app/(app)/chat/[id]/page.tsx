"use client";

import Image from "next/image";
import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Message } from "@/types";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { SUMMARY_PREFIX } from "@/lib/ai/retrieval";
import type { ChatModelPreference } from "@/lib/llm";
import type { SourceCitation } from "@/types";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

interface PendingAudio {
  fileName: string;
  objectUrl: string;
}

const MODEL_PREFERENCE_STORAGE_KEY = "chat-model-preference";

const MODEL_OPTIONS: Array<{ value: ChatModelPreference; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "premium", label: "Premium" },
];

function normalizeInlineText(text: string) {
  return text
    .replace(/(\$[^$\n]+\$)\*/g, "$1")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
}

function normalizeMathContent(content: string) {
  return content
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\text\{([^{}]+)\}/g, "$1")
    .replace(/\\,/g, " ")
    .replace(/\\ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderInlineFormatting(text: string) {
  const normalizedText = normalizeInlineText(text);
  const segments = normalizedText.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\$[^$\n]+\$)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
      return <strong key={`segment-${index}`}>{segment.slice(2, -2)}</strong>;
    }

    if (
      segment.startsWith("*") &&
      segment.endsWith("*") &&
      segment.length > 2 &&
      !(segment.startsWith("**") && segment.endsWith("**"))
    ) {
      return <em key={`segment-${index}`}>{segment.slice(1, -1)}</em>;
    }

    if (segment.startsWith("$") && segment.endsWith("$") && segment.length > 2) {
      return (
        <span
          key={`segment-${index}`}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.95em",
          }}
        >
          {normalizeMathContent(segment.slice(1, -1))}
        </span>
      );
    }

    return <Fragment key={`segment-${index}`}>{segment}</Fragment>;
  });
}

function renderMessageContent(content: string) {
  const blocks = content.split(/\n\s*\n/);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const isNumberedList =
      lines.length > 1 && lines.every((line) => /^\d+\.\s+/.test(line.trim()));

    if (isNumberedList) {
      return (
        <ol
          key={`block-${blockIndex}`}
          style={{
            margin: 0,
            paddingLeft: "1.25rem",
            display: "grid",
            gap: 6,
          }}
        >
          {lines.map((line, lineIndex) => (
            <li key={`line-${lineIndex}`}>{renderInlineFormatting(line.replace(/^\d+\.\s+/, ""))}</li>
          ))}
        </ol>
      );
    }

    return (
      <p
        key={`block-${blockIndex}`}
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
        }}
      >
        {lines.map((line, lineIndex) => (
          <Fragment key={`line-${lineIndex}`}>
            {lineIndex > 0 ? <br /> : null}
            {renderInlineFormatting(line)}
          </Fragment>
        ))}
      </p>
    );
  });
}

export default function ChatDetailPage({ params }: ChatPageProps) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [modelPreference, setModelPreference] = useState<ChatModelPreference>("auto");
  const [isStreaming, setIsStreaming] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSavingMessages, setIsSavingMessages] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const setPendingAudioFile = useCallback((file: File) => {
    setPendingAudio((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev.objectUrl);
      }

      return {
        fileName: file.name,
        objectUrl: URL.createObjectURL(file),
      };
    });
  }, []);

  const { state: voiceState, toggleRecording } = useVoiceRecorder(
    (text) => {
      setInput((prev) => (prev ? `${prev} ${text}` : text).trim());
      setUploadError(null);

      if (textareaRef.current) {
        textareaRef.current.style.height = "44px";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      }
    },
    setPendingAudioFile
  );
  const isRecording = voiceState.isRecording;
  const isAudioProcessing = voiceState.isProcessing;

  useEffect(() => {
    params.then(({ id }) => {
      setConversationId(id);
      loadConversation(id);
    });
  }, [params]);

  useEffect(() => {
    const storedPreference = window.localStorage.getItem(MODEL_PREFERENCE_STORAGE_KEY);

    if (storedPreference === "auto" || storedPreference === "premium") {
      setModelPreference(storedPreference);
      return;
    }

    if (storedPreference === "gemini" || storedPreference === "local") {
      setModelPreference("auto");
      window.localStorage.setItem(MODEL_PREFERENCE_STORAGE_KEY, "auto");
    }
  }, []);

  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSubject(data.conversation.subject);
        setMessages(
          JSON.parse(data.conversation.messages || "[]").filter(
            (message: Message) =>
              !(message.role === "system" && message.content.startsWith(SUMMARY_PREFIX))
          )
        );
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  };

  const persistMessages = useCallback(
    async (nextMessages: Message[]) => {
      if (!conversationId) {
        return;
      }

      setIsSavingMessages(true);

      try {
        await fetch(`/api/conversations/${conversationId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: JSON.stringify(nextMessages),
          }),
        });
      } catch (err) {
        console.error("Failed to save messages:", err);
      } finally {
        setIsSavingMessages(false);
      }
    },
    [conversationId]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const streamAssistantText = useCallback(
    async (content: string, options?: { sources?: SourceCitation[] }) => {
      const assistantMsgId = (Date.now() + 1).toString();
      const baseMessage = {
        id: assistantMsgId,
        role: "assistant" as const,
        content: "",
        modality: "text" as const,
        sources: options?.sources,
        tokenCount: 0,
        hintUsed: false,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, baseMessage]);

      const parts = content.match(/\S+\s*/g) || [content];
      let builtContent = "";

      for (const part of parts) {
        builtContent += part;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMsgId ? { ...message, content: builtContent } : message
          )
        );
        await new Promise((resolve) => window.setTimeout(resolve, 35));
      }

      setMessages((prev) => {
        const nextMessages = prev.map((message) =>
          message.id === assistantMsgId ? { ...message, content } : message
        );
        void persistMessages(nextMessages);
        return nextMessages;
      });
    },
    [persistMessages]
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      e.target.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadError("Images must be smaller than 8 MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setImageBase64(reader.result);
        setUploadError(null);
      } else {
        setUploadError("Failed to read the selected image.");
      }
      e.target.value = "";
    };
    reader.onerror = () => {
      setUploadError("Failed to read the selected image.");
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (isStreaming || isRecording || isAudioProcessing) return;

    const activeImage = imageBase64;
    const activeAudio = pendingAudio;
    const userMessage = input.trim();
    if (!userMessage && !activeImage && !activeAudio) return;

    setInput("");
    setIsStreaming(true);
    setImageBase64(null);
    setPendingAudio(null);
    setUploadError(null);
    setSelectedMessageId(null);

    // Add user message immediately
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content:
        userMessage ||
        (activeImage
          ? ""
          : activeAudio
            ? "Please help me with this audio."
            : "Please help me with this image."),
      modality: activeImage ? "image" : activeAudio ? "voice" : "text",
      mediaUrl: activeImage ?? activeAudio?.objectUrl,
      tokenCount: 0,
      hintUsed: false,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: userMessage,
          subject,
          imageBase64: activeImage,
          modelPreference,
        }),
      });

      if (res.status === 429) {
        setQuotaExceeded(true);
        setIsStreaming(false);
        return;
      }

      if (!res.ok) {
        let errorMessage = "Sorry, something went wrong. Please try again.";

        try {
          const data = await res.json();
          if (typeof data?.error === "string" && data.error.trim()) {
            errorMessage = data.error;
          }
        } catch {
          // Ignore non-JSON error bodies.
        }

        const errorMsg: Message = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: errorMessage,
          modality: "text",
          tokenCount: 0,
          hintUsed: false,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setIsStreaming(false);
        return;
      }

      // Check for safety response (non-streaming)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.safetyResponse) {
          await streamAssistantText(data.safetyResponse);
          setIsStreaming(false);
          return;
        }
        if (data.assistantResponse) {
          await streamAssistantText(data.assistantResponse);
          setIsStreaming(false);
          return;
        }
        if (data.groundedResponse) {
          await streamAssistantText(data.groundedResponse, {
            sources: Array.isArray(data.sources) ? data.sources : [],
          });
          setIsStreaming(false);
          return;
        }
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setIsStreaming(false);
        return;
      }

      // Add empty assistant message
      const assistantMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          modality: "text",
          tokenCount: 0,
          hintUsed: false,
          timestamp: new Date().toISOString(),
        },
      ]);

      let fullText = "";
      let streamBuffer = "";
      let streamMode: "unknown" | "structured" | "plain" = "unknown";

      const updateAssistantContent = (content: string) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content } : m))
        );
      };

      const appendAssistantText = (text: string) => {
        if (!text) {
          return;
        }

        fullText += text;
        updateAssistantContent(fullText);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streamBuffer += decoder.decode();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) {
          continue;
        }

        if (
          streamMode === "unknown" &&
          (chunk.startsWith("0:") || chunk.includes("\n0:"))
        ) {
          streamMode = "structured";
        } else if (streamMode === "unknown") {
          streamMode = "plain";
        }

        if (streamMode === "plain") {
          appendAssistantText(chunk);
          continue;
        }

        streamBuffer += chunk;

        while (true) {
          const newlineIndex = streamBuffer.indexOf("\n");
          if (newlineIndex === -1) {
            break;
          }

          const line = streamBuffer.slice(0, newlineIndex).trim();
          streamBuffer = streamBuffer.slice(newlineIndex + 1);

          if (!line || !line.startsWith("0:")) {
            continue;
          }

          try {
            const text = JSON.parse(line.slice(2));
            if (typeof text === "string") {
              appendAssistantText(text);
            }
          } catch {
            // Ignore malformed protocol lines and keep reading.
          }
        }
      }

      if (streamMode === "structured" && streamBuffer.trim().startsWith("0:")) {
        try {
          const text = JSON.parse(streamBuffer.trim().slice(2));
          if (typeof text === "string") {
            appendAssistantText(text);
          }
        } catch {
          // Ignore incomplete trailing protocol data.
        }
      } else if (streamMode !== "structured" && streamBuffer) {
        appendAssistantText(streamBuffer);
      }

      if (!fullText.trim()) {
        updateAssistantContent(
          "I couldn't finish that answer properly. Please send it once more."
        );
      }

      const finalizedMessages = messages
        .concat(userMsg)
        .concat({
          id: assistantMsgId,
          role: "assistant" as const,
          content: fullText.trim()
            ? fullText
            : "I couldn't finish that answer properly. Please send it once more.",
          modality: "text" as const,
          tokenCount: 0,
          hintUsed: false,
          timestamp: new Date().toISOString(),
        });
      void persistMessages(finalizedMessages);
    } catch (err) {
      console.error("Chat error:", err);
      const errorMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again! 🙏",
        modality: "text",
        tokenCount: 0,
        hintUsed: false,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage) {
      return;
    }

    setSelectedMessageId(null);
    setEditingMessageId(messageId);
    setEditDraft(targetMessage.content);
  };

  const handleSaveEditedMessage = async () => {
    if (!editingMessageId) {
      return;
    }

    const targetMessage = messages.find((message) => message.id === editingMessageId);
    if (!targetMessage) {
      return;
    }

    const trimmedContent = editDraft.trim();
    if (!trimmedContent && !targetMessage.mediaUrl) {
      return;
    }

    const nextMessages = messages.map((message) =>
      message.id === editingMessageId ? { ...message, content: trimmedContent } : message
    );

    setMessages(nextMessages);
    setEditingMessageId(null);
    setEditDraft("");
    await persistMessages(nextMessages);
  };

  const handleDeleteMessage = async (messageId: string) => {
    const nextMessages = messages.filter((message) => message.id !== messageId);
    setMessages(nextMessages);
    setSelectedMessageId(null);
    await persistMessages(nextMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "44px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        position: "relative",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          background: "rgba(15, 14, 23, 0.9)",
          backdropFilter: "blur(20px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button className="back-btn" onClick={() => router.push("/dashboard")} id="chat-back-btn">
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "var(--weight-semibold)", fontSize: "var(--text-base)" }}>
            {subject || "Chat"}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
            EduBot AI Tutor
          </div>
        </div>

        <select
          value={modelPreference}
          onChange={(e) => {
            const nextPreference = e.target.value as ChatModelPreference;
            setModelPreference(nextPreference);
            window.localStorage.setItem(MODEL_PREFERENCE_STORAGE_KEY, nextPreference);
          }}
          style={{
            fontSize: "0.78rem",
            padding: "8px 12px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            cursor: "pointer",
            fontWeight: 600,
            marginRight: "4px",
            outline: "none",
          }}
          disabled={isStreaming || isRecording || isAudioProcessing}
          aria-label="Select chat model"
        >
          {MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-full)",
            background: "var(--gradient-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.9rem",
          }}
        >
          🧠
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--space-4)",
        }}
      >
        {messages.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "var(--space-16)" }}>
            <div className="empty-state-icon animate-float">🧠</div>
            <h3 className="heading-3">Hi there! I&apos;m EduBot</h3>
            <p className="text-secondary" style={{ maxWidth: "280px" }}>
              Ask me anything about {subject || "your subjects"}. I&apos;m here to help
              you learn, not just give answers!
            </p>
            <div className="flex flex-col gap-2 w-full mt-4">
              {[
                `Explain the basics of ${subject || "this topic"}`,
                "I need help with my homework",
                "Give me a practice problem",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  className="card"
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    fontSize: "var(--text-sm)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setInput(suggestion);
                    textareaRef.current?.focus();
                  }}
                >
                  💡 {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-container">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-bubble ${
                  msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"
                }`}
                style={{
                  position: "relative",
                  cursor: msg.role === "user" ? "pointer" : "default",
                }}
                onClick={() => {
                  if (msg.role === "user") {
                    setSelectedMessageId(msg.id);
                  }
                }}
              >
                {msg.mediaUrl && msg.modality === "image" && (
                  <div
                    style={{ marginBottom: "var(--space-2)" }}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Image
                      src={msg.mediaUrl}
                      alt="Uploaded study image"
                      width={240}
                      height={160}
                      unoptimized
                      style={{
                        width: "100%",
                        maxWidth: 240,
                        height: "auto",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                )}
                {msg.mediaUrl && msg.modality === "voice" && (
                  <div
                    style={{
                      marginBottom: "var(--space-2)",
                      padding: "12px",
                      borderRadius: "var(--radius-xl)",
                      background:
                        msg.role === "user"
                          ? "rgba(255,255,255,0.16)"
                          : "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "var(--text-xs)",
                            opacity: 0.8,
                            marginBottom: 6,
                          }}
                        >
                          Voice note
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(16, 1fr)",
                            gap: 3,
                            alignItems: "end",
                            height: 18,
                          }}
                        >
                          {[8, 12, 6, 14, 10, 16, 7, 13, 5, 15, 11, 9, 16, 8, 12, 6].map(
                            (height, index) => (
                              <span
                                key={`${msg.id}-bar-${index}`}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  height,
                                  borderRadius: 999,
                                  background:
                                    msg.role === "user"
                                      ? "rgba(255,255,255,0.7)"
                                      : "rgba(167, 169, 190, 0.8)",
                                }}
                              />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                    <audio
                      controls
                      preload="metadata"
                      src={msg.mediaUrl}
                      style={{ width: "100%", minWidth: 220, display: "block" }}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                {msg.role === "assistant" && msg.content === "" && isStreaming ? (
                  <div className="streaming-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : (
                  <div
                    style={{
                      wordBreak: "break-word",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {renderMessageContent(msg.content)}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quota Exceeded Overlay */}
      {quotaExceeded && (
        <div className="paywall-overlay" onClick={() => setQuotaExceeded(false)}>
          <div className="paywall-card" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div style={{ fontSize: "3rem", marginBottom: "var(--space-3)" }}>⚡</div>
              <h2 className="heading-2">Daily Limit Reached</h2>
              <p className="text-secondary mt-2">
                You&apos;ve used all your free questions for today. Upgrade for unlimited learning!
              </p>
            </div>

            <div className="flex flex-col gap-3 mb-6">
              <div className="tier-card recommended">
                <div className="flex justify-between items-center mb-2">
                  <span className="badge badge-primary">RECOMMENDED</span>
                  <span className="badge badge-success">Popular</span>
                </div>
                <div className="tier-price">
                  ₹149<span>/month</span>
                </div>
                <div className="text-secondary mt-1" style={{ fontSize: "var(--text-sm)" }}>
                  50 questions/day • All subjects • Voice input
                </div>
              </div>

              <div className="tier-card">
                <div className="tier-price">
                  ₹499<span>/month</span>
                </div>
                <div className="text-secondary mt-1" style={{ fontSize: "var(--text-sm)" }}>
                  Unlimited • Photo solve • Adaptive tests • Parent dashboard
                </div>
              </div>
            </div>

            <button className="btn btn-primary btn-lg btn-full" id="upgrade-btn" onClick={() => router.push("/subscribe")}>
              Upgrade Now
            </button>
            <button
              className="btn btn-ghost btn-full mt-2"
              onClick={() => setQuotaExceeded(false)}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {selectedMessageId && (
        <div
          className="paywall-overlay"
          onClick={() => setSelectedMessageId(null)}
          style={{ zIndex: 120 }}
        >
          <div
            className="paywall-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 320, padding: "var(--space-4)" }}
          >
            <div className="heading-3" style={{ marginBottom: "var(--space-3)" }}>
              Message Options
            </div>
            <div className="flex flex-col gap-2">
              <button
                className="btn btn-secondary btn-full"
                onClick={() => void handleEditMessage(selectedMessageId)}
                disabled={isSavingMessages}
              >
                Edit Message
              </button>
              <button
                className="btn btn-secondary btn-full"
                onClick={() => void handleDeleteMessage(selectedMessageId)}
                disabled={isSavingMessages}
              >
                Delete Message
              </button>
              <button
                className="btn btn-ghost btn-full"
                onClick={() => setSelectedMessageId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingMessageId && (
        <div
          className="paywall-overlay"
          onClick={() => {
            setEditingMessageId(null);
            setEditDraft("");
          }}
          style={{ zIndex: 121 }}
        >
          <div
            className="paywall-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 360, padding: "var(--space-4)" }}
          >
            <div className="heading-3" style={{ marginBottom: "var(--space-3)" }}>
              Edit Message
            </div>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                minHeight: 120,
                padding: "var(--space-3)",
                background: "var(--color-bg-input)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                color: "var(--color-text)",
                resize: "vertical",
                marginBottom: "var(--space-3)",
              }}
            />
            <div className="flex flex-col gap-2">
              <button
                className="btn btn-primary btn-full"
                onClick={() => void handleSaveEditedMessage()}
                disabled={isSavingMessages}
              >
                Save Changes
              </button>
              <button
                className="btn btn-ghost btn-full"
                onClick={() => {
                  setEditingMessageId(null);
                  setEditDraft("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
        {(uploadError || voiceState.error) && (
          <div
            style={{
              marginBottom: 8,
              color: "var(--color-error)",
              fontSize: "var(--text-sm)",
            }}
          >
            {uploadError || voiceState.error}
          </div>
        )}
        {imageBase64 && (
          <div
            style={{
              position: "fixed",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: "92px",
              width: "min(calc(100% - 32px), var(--max-width))",
              zIndex: 101,
              display: "flex",
              justifyContent: "flex-start",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: 10,
                maxWidth: 220,
                borderRadius: "var(--radius-xl)",
                background: "rgba(15, 14, 23, 0.96)",
                border: "1px solid var(--color-border)",
                boxShadow: "var(--shadow-lg)",
                pointerEvents: "auto",
              }}
            >
            <Image
              src={imageBase64}
              alt="Preview"
              width={140}
              height={140}
              unoptimized
              style={{
                height: 140,
                width: 140,
                borderRadius: "var(--radius-md)",
                objectFit: "cover",
                border: "1px solid var(--color-border)",
              }}
            />
            <button
              onClick={() => setImageBase64(null)}
              aria-label="Remove selected image"
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid var(--color-border)",
                color: "white",
                width: 32,
                height: 32,
                borderRadius: "var(--radius-full)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
            </div>
          </div>
        )}
        {pendingAudio && (
          <div
            style={{
              position: "fixed",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: imageBase64 ? "258px" : "92px",
              width: "min(calc(100% - 32px), var(--max-width))",
              zIndex: 101,
              display: "flex",
              justifyContent: "flex-start",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 14,
                width: "min(100%, 360px)",
                borderRadius: "var(--radius-xl)",
                background: "rgba(15, 14, 23, 0.96)",
                border: "1px solid var(--color-border)",
                boxShadow: "var(--shadow-lg)",
                pointerEvents: "auto",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "var(--radius-full)",
                  background: "var(--gradient-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "1rem",
                }}
              >
                🎤
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--weight-semibold)",
                    marginBottom: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pendingAudio.fileName}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Voice note ready to send
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={pendingAudio.objectUrl}
                  style={{ width: "100%" }}
                />
              </div>
              <button
                onClick={() => {
                  URL.revokeObjectURL(pendingAudio.objectUrl);
                  setPendingAudio(null);
                }}
                aria-label="Remove selected audio"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid var(--color-border)",
                  color: "white",
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-full)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <div className="chat-input-bar">
          <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageSelect} hidden />
          <button className="chat-action-btn" onClick={() => imageInputRef.current?.click()} disabled={isStreaming || isAudioProcessing} title="Upload Image">📷</button>
          <button className="chat-action-btn" onClick={toggleRecording} disabled={isStreaming || isAudioProcessing} style={{ color: isRecording ? "var(--color-error)" : "inherit" }} title="Record Voice">
            {isRecording ? "⏹️" : isAudioProcessing ? "…" : "🎤"}
          </button>
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={isRecording ? "Listening..." : isAudioProcessing ? "Transcribing..." : "Ask EduBot anything..."}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            rows={1}
            id="chat-input"
            disabled={isRecording || isAudioProcessing}
          />
          <button
            className="chat-action-btn chat-send-btn"
            onClick={handleSend}
            disabled={(!input.trim() && !imageBase64 && !pendingAudio) || isStreaming || isRecording || isAudioProcessing}
            id="chat-send-btn"
          >
            {isStreaming ? "..." : "↑"}
          </button>
        </div>
      </div>
    </div>
  );
}
