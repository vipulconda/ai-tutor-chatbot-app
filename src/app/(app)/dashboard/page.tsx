"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { StudentProfileData } from "@/types";
import {
  readQuizAttemptHistory,
  type QuizAttemptRecord,
} from "@/lib/progress-storage";
import { computeLearningScore } from "@/lib/learning-score";

const SUBJECT_META: Record<string, { icon: string; color: string }> = {
  Mathematics: { icon: "📐", color: "var(--color-math)" },
  Science: { icon: "🔬", color: "var(--color-science)" },
  "Social Science": { icon: "🌍", color: "var(--color-social)" },
  English: { icon: "📖", color: "var(--color-english)" },
  Hindi: { icon: "🇮🇳", color: "var(--color-hindi)" },
};

interface ConvoSummary {
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

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [conversations, setConversations] = useState<ConvoSummary[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(showLoadingState = false) {
      if (showLoadingState) {
        setLoading(true);
      }

      try {
        const [profileRes, convosRes] = await Promise.all([
          fetch("/api/profiles", { cache: "no-store" }),
          fetch("/api/conversations", { cache: "no-store" }),
        ]);
        const profileData = await profileRes.json();
        const convosData = await convosRes.json();

        if (!profileData.profile) {
          router.push("/onboarding");
          return;
        }

        if (cancelled) {
          return;
        }

        setProfile(profileData.profile);
        setConversations(convosData.conversations || []);
        setQuizAttempts(readQuizAttemptHistory());
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const handleWindowFocus = () => {
      void load();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    void load(true);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  const learningScore = useMemo(
    () =>
      profile
        ? computeLearningScore(profile, quizAttempts, conversations)
        : {
            score: 50,
            averageAbility: 50,
            recentQuizAverage: null,
            subjectCoverage: 0,
            consistencyScore: 0,
          },
    [conversations, profile, quizAttempts]
  );

  if (loading) {
    return (
      <div className="page-content">
        <div className="flex flex-col gap-4 mt-8">
          <div className="skeleton" style={{ height: "40px", width: "200px" }} />
          <div className="skeleton" style={{ height: "80px" }} />
          <div className="skeleton" style={{ height: "80px" }} />
          <div className="skeleton" style={{ height: "80px" }} />
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const recentBySubject = conversations
    .filter(
      (convo, index, self) =>
        index === self.findIndex((candidate) => candidate.subject === convo.subject)
    )
    .slice(0, 5);

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
  const displayName = isMounted ? session?.user?.name || "Student" : "Student";
  const profileInitial = displayName[0]?.toUpperCase() || "S";

  return (
    <div className="page-content">
      {/* Header */}
      <div className="top-bar">
        <div>
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
            Welcome back 👋
          </p>
          <h1 className="heading-2">
            {displayName}
          </h1>
        </div>
        <button
          onClick={() => router.push("/profile")}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "var(--radius-full)",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.2rem",
            fontWeight: "var(--weight-bold)",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
          title="Go to Settings"
        >
          {profileInitial}
        </button>
      </div>

      {/* Stats Card */}
      <div
        className="card mb-6"
        style={{
          background: "var(--gradient-primary)",
          borderColor: "transparent",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-5)",
        }}
      >
        {/* Progress Ring */}
        <div className="progress-ring">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle
              className="progress-ring-track"
              cx="36"
              cy="36"
              r="30"
              strokeWidth="6"
              style={{ stroke: "rgba(255,255,255,0.2)" }}
            />
            <circle
              className="progress-ring-fill"
              cx="36"
              cy="36"
              r="30"
              strokeWidth="6"
              stroke="white"
              strokeDasharray={`${(learningScore.score / 100) * 188.5} 188.5`}
            />
          </svg>
          <span
            className="progress-ring-text"
            style={{ color: "white", fontSize: "var(--text-base)" }}
          >
            {learningScore.score.toFixed(1)}
          </span>
        </div>
        <div>
          <div
            style={{
              fontWeight: "var(--weight-semibold)",
              fontSize: "var(--text-lg)",
              color: "white",
            }}
          >
            Learning Score
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "var(--text-sm)" }}>
            Grade {profile.grade} • {profile.board}
          </div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "var(--text-xs)", marginTop: "2px" }}>
            Ability {learningScore.averageAbility.toFixed(1)} • Recent quiz {learningScore.recentQuizAverage !== null ? `${learningScore.recentQuizAverage.toFixed(1)}%` : "n/a"} • Coverage {learningScore.subjectCoverage.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Subjects */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="heading-3">Your Subjects</h2>
          <span className="badge badge-primary">
            {profile.subjects.length} active
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {profile.subjects.map((subject) => {
            const meta = SUBJECT_META[subject] || {
              icon: "📚",
              color: "var(--color-primary)",
            };
            const score = profile.abilityScores[subject.toLowerCase()] ?? 50;
            return (
              <button
                key={subject}
                className="subject-card"
                onClick={() => router.push(`/chat/subject/${encodeURIComponent(subject)}`)}
                id={`subject-${subject.toLowerCase().replace(/\s/g, "-")}`}
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
                  <div className="subject-progress">
                    Score: {score.toFixed(1)}/100
                  </div>
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
                    fontSize: "var(--text-lg)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  →
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Conversations */}
      {recentBySubject.length > 0 && (
        <div>
          <h2 className="heading-3 mb-4">Recent Chats</h2>
          <div className="flex flex-col gap-2">
            {recentBySubject.map((convo) => (
              <div
                key={convo.id}
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
                  onClick={() => router.push(`/chat/${convo.id}`)}
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
                <span style={{ fontSize: "1.2rem" }}>
                  {SUBJECT_META[convo.subject]?.icon || "💬"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: "var(--weight-medium)",
                      fontSize: "var(--text-sm)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {convo.subject}
                    {convo.topic ? ` — ${convo.topic}` : ""}
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: "var(--text-xs)" }}
                  >
                    {chatTimestampFormatter.format(new Date(convo.updatedAt))}
                  </div>
                </div>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  →
                </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteConversation(convo.id);
                  }}
                  aria-label={`Delete recent ${convo.subject} chat`}
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
        </div>
      )}
    </div>
  );
}
