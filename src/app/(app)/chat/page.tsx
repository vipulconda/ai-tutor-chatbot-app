"use client";

import { useRouter } from "next/navigation";
import { SUBJECTS } from "@/types";

const SUBJECT_META: Record<string, { icon: string; color: string }> = {
  Mathematics: { icon: "📐", color: "var(--color-math)" },
  Science: { icon: "🔬", color: "var(--color-science)" },
  "Social Science": { icon: "🌍", color: "var(--color-social)" },
  English: { icon: "📖", color: "var(--color-english)" },
  Hindi: { icon: "🇮🇳", color: "var(--color-hindi)" },
};

export default function ChatListPage() {
  const router = useRouter();

  return (
    <div className="page-content">
      <div className="top-bar">
        <h1 className="heading-2">Chats</h1>
      </div>

      <p className="text-secondary mb-6">
        Choose a subject to continue a recent chat or start a new topic with EduBot
      </p>

      <div className="flex flex-col gap-3">
        {SUBJECTS.map((subject) => {
          const meta = SUBJECT_META[subject] || { icon: "📚", color: "var(--color-primary)" };
          return (
            <button
              key={subject}
              className="subject-card"
              onClick={() => router.push(`/chat/subject/${encodeURIComponent(subject)}`)}
              id={`chat-start-${subject.toLowerCase().replace(/\s/g, "-")}`}
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
              <div className="subject-info">
                <div className="subject-name">{subject}</div>
                <div className="subject-progress">View recent chats or start a new one</div>
              </div>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-bg-input)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.2rem",
                }}
              >
                💬
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
