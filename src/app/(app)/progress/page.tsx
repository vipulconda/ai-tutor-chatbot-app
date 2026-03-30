"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { StudentProfileData } from "@/types";
import { getAbilityBand } from "@/lib/ai/prompt-builder";
import {
  readQuizAttemptHistory,
  type QuizAttemptRecord,
} from "@/lib/progress-storage";
import { createProgressReportHtml } from "@/lib/progress-report";

const BAND_COLORS: Record<string, string> = {
  Beginner: "var(--color-error)",
  Developing: "var(--color-warning)",
  Proficient: "var(--color-info)",
  Advanced: "var(--color-success)",
};

interface ConversationSummary {
  id: string;
  subject: string;
  topic: string | null;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

type ActivityItem =
  | {
      id: string;
      type: "quiz";
      title: string;
      subtitle: string;
      timestamp: string;
      score?: number;
    }
  | {
      id: string;
      type: "chat";
      title: string;
      subtitle: string;
      timestamp: string;
    };

function formatActivityTime(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function buildLast7DaysSeries(
  quizAttempts: QuizAttemptRecord[],
  conversations: ConversationSummary[]
) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  return days.map((day) => {
    const key = day.toISOString().slice(0, 10);
    const quizCount = quizAttempts.filter((attempt) => attempt.createdAt.slice(0, 10) === key).length;
    const chatCount = conversations.filter(
      (conversation) => conversation.updatedAt.slice(0, 10) === key
    ).length;

    return {
      label: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(day),
      total: quizCount + chatCount,
      quizCount,
      chatCount,
    };
  });
}

function calculateStreak(activityDates: string[]) {
  const uniqueDays = new Set(activityDates.map((date) => date.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (uniqueDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function buildRecommendedTopics(
  profile: StudentProfileData | null,
  quizAttempts: QuizAttemptRecord[],
  subjectStats: Array<{
    subject: string;
    avgAccuracy: number | null;
  }>
) {
  const lowScoringAttemptTopics = quizAttempts
    .filter((attempt) => attempt.scorePercent < 60)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .flatMap((attempt) => attempt.topics);

  const lowAccuracySubjectTopics = subjectStats
    .filter((entry) => entry.avgAccuracy !== null && entry.avgAccuracy < 60)
    .map((entry) => `${entry.subject} revision`);

  return [
    ...lowScoringAttemptTopics,
    ...(profile?.weakTopics || []),
    ...lowAccuracySubjectTopics,
  ]
    .map((topic) => topic.trim())
    .filter(Boolean)
    .filter((topic, index, array) => array.indexOf(topic) === index)
    .slice(0, 5);
}

export default function ProgressPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllSnapshot, setShowAllSnapshot] = useState(false);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Reset state when user changes to prevent cross-account data bleed
  useEffect(() => {
    setProfile(null);
    setConversations([]);
    setQuizAttempts([]);
    setLoading(true);
    setShowAllActivity(false);
    setShowAllSnapshot(false);
    setReportHtml(null);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    async function load(showLoadingState = false) {
      if (showLoadingState) {
        setLoading(true);
      }

      try {
        const [profileRes, conversationsRes] = await Promise.all([
          fetch("/api/profiles", { cache: "no-store" }),
          fetch("/api/conversations", { cache: "no-store" }),
        ]);
        const profileData = await profileRes.json();
        const conversationsData = await conversationsRes.json();

        if (cancelled) {
          return;
        }

        setProfile(profileData.profile);
        setConversations(
          Array.isArray(conversationsData.conversations)
            ? conversationsData.conversations
            : []
        );
        setQuizAttempts(readQuizAttemptHistory(userId));
      } catch {
        // keep previous UI state if refresh fails
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
  }, [userId]);

  const analytics = useMemo(() => {
    const overallAccuracy =
      quizAttempts.length > 0
        ? Math.round(
            quizAttempts.reduce((sum, attempt) => sum + attempt.scorePercent, 0) /
              quizAttempts.length
          )
        : null;

    const subjectStats = (profile?.subjects || []).map((subject) => {
      const subjectKey = subject.toLowerCase();
      const abilityScore = profile?.abilityScores?.[subjectKey] ?? 50;
      const subjectQuizAttempts = quizAttempts.filter((attempt) => attempt.subject === subject);
      const avgAccuracy =
        subjectQuizAttempts.length > 0
          ? Math.round(
              subjectQuizAttempts.reduce((sum, attempt) => sum + attempt.scorePercent, 0) /
                subjectQuizAttempts.length
            )
          : null;
      const chatSessions = conversations.filter((conversation) => conversation.subject === subject).length;

      return {
        subject,
        abilityScore,
        band: getAbilityBand(abilityScore),
        quizAttempts: subjectQuizAttempts.length,
        avgAccuracy,
        chatSessions,
        totalAttempts: subjectQuizAttempts.length + chatSessions,
      };
    });

    const activityItems: ActivityItem[] = [
      ...quizAttempts.map((attempt) => ({
        id: attempt.id,
        type: "quiz" as const,
        title: `${attempt.subject} quiz completed`,
        subtitle: `${attempt.correctAnswers}/${attempt.questionCount} correct`,
        timestamp: attempt.createdAt,
        score: attempt.scorePercent,
      })),
      ...conversations.map((conversation) => ({
        id: conversation.id,
        type: "chat" as const,
        title: `${conversation.subject} chat session`,
        subtitle: conversation.topic || "General discussion",
        timestamp: conversation.updatedAt,
      })),
    ]
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, 8);

    const activityDates = [
      ...quizAttempts.map((attempt) => attempt.createdAt),
      ...conversations.map((conversation) => conversation.updatedAt),
    ];

    const recommendedTopics = buildRecommendedTopics(
      profile,
      quizAttempts,
      subjectStats
    );

    return {
      overallAccuracy,
      subjectStats,
      activityItems,
      streak: calculateStreak(activityDates),
      series: buildLast7DaysSeries(quizAttempts, conversations),
      totalPracticeAttempts:
        quizAttempts.length + conversations.length,
      recommendedTopics,
    };
  }, [conversations, profile, quizAttempts]);

  const visibleActivityItems = showAllActivity
    ? analytics.activityItems
    : analytics.activityItems.slice(0, 4);
  const snapshotTopics = profile
    ? [
        ...profile.strongTopics.map((topic) => ({
          tone: "success" as const,
          label: `Mastered: ${topic}`,
        })),
        ...profile.weakTopics.map((topic) => ({
          tone: "error" as const,
          label: `Revise: ${topic}`,
        })),
      ]
    : [];
  const visibleSnapshotTopics = showAllSnapshot
    ? snapshotTopics
    : snapshotTopics.slice(0, 6);

  const handleCreateReport = () => {
    if (!profile || isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);

    try {
      const nextReportHtml = createProgressReportHtml({
        profile,
        overallAccuracy: analytics.overallAccuracy,
        totalPracticeAttempts: analytics.totalPracticeAttempts,
        streak: analytics.streak,
        subjectStats: analytics.subjectStats,
        recommendedTopics: analytics.recommendedTopics,
        strongTopics: profile.strongTopics,
        weakTopics: profile.weakTopics,
        recentActivity: analytics.activityItems,
        generatedAt: new Date().toISOString(),
        quizAttempts,
        totalChatSessions: conversations.length,
        totalQuizAttempts: quizAttempts.length,
        totalChatTokens: conversations.reduce((sum, conversation) => sum + conversation.tokenCount, 0),
        bestQuizScore:
          quizAttempts.length > 0
            ? Math.max(...quizAttempts.map((attempt) => attempt.scorePercent))
            : null,
        lowestQuizScore:
          quizAttempts.length > 0
            ? Math.min(...quizAttempts.map((attempt) => attempt.scorePercent))
            : null,
        recentQuizAverage:
          quizAttempts.length > 0
            ? Math.round(
                quizAttempts
                  .slice(0, 5)
                  .reduce((sum, attempt) => sum + attempt.scorePercent, 0) /
                  Math.min(quizAttempts.length, 5)
              )
            : null,
        weeklyActivity: analytics.series,
      });
      setReportHtml(nextReportHtml);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadReport = () => {
    if (!reportHtml) {
      return;
    }

    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `progress-report-grade-${profile?.grade ?? "student"}.html`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handlePrintReport = () => {
    if (!reportHtml) {
      return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=820");

    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(reportHtml);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  if (loading) {
    return (
      <div className="page-content">
        <div className="top-bar">
          <h1 className="heading-2">Progress</h1>
        </div>
        <div className="flex flex-col gap-4">
          <div className="skeleton" style={{ height: "120px" }} />
          <div className="skeleton" style={{ height: "160px" }} />
          <div className="skeleton" style={{ height: "240px" }} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3 className="heading-3">No Progress Yet</h3>
          <p className="text-secondary">Complete your profile to start tracking progress</p>
        </div>
      </div>
    );
  }

  const maxSeriesValue = Math.max(...analytics.series.map((entry) => entry.total), 1);
  const subtleActionStyle: React.CSSProperties = {
    padding: "6px 10px",
    minHeight: "auto",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--color-text-secondary)",
    fontSize: "var(--text-xs)",
    fontWeight: "var(--weight-medium)",
    lineHeight: 1.2,
  };
  const primaryActionStyle: React.CSSProperties = {
    whiteSpace: "nowrap",
    borderColor: "rgba(108, 92, 231, 0.24)",
    boxShadow: "none",
  };

  return (
    <div className="page-content">
      <div className="top-bar">
        <h1 className="heading-2">Progress</h1>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary">Grade {profile.grade}</span>
          <button
            className="btn btn-secondary"
            onClick={handleCreateReport}
            disabled={isGeneratingReport}
            style={primaryActionStyle}
          >
            {isGeneratingReport ? "Creating..." : "Create Progress Report"}
          </button>
        </div>
      </div>

      <div
        className="card mb-6"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <div>
          <div className="heading-2" style={{ color: "var(--color-primary-light)" }}>
            {analytics.overallAccuracy !== null ? `${analytics.overallAccuracy}%` : "--"}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
            Quiz Accuracy
          </div>
        </div>
        <div>
          <div className="heading-2" style={{ color: "var(--color-accent)" }}>
            {analytics.totalPracticeAttempts}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
            Attempts
          </div>
        </div>
        <div>
          <div className="heading-2" style={{ color: "var(--color-success)" }}>
            {analytics.streak}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
            Day Streak
          </div>
        </div>
        <div>
          <div className="heading-2" style={{ color: "var(--color-info)" }}>
            {analytics.recommendedTopics.length}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
            Next Topics
          </div>
        </div>
      </div>

      <div className="card mb-6" style={{ padding: "var(--space-4)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="heading-3">Progress Over Time</h3>
          <span className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
            Last 7 days
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            alignItems: "end",
            gap: "var(--space-3)",
            minHeight: 180,
          }}
        >
          {analytics.series.map((entry) => (
            <div
              key={entry.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                {entry.total}
              </div>
              <div
                style={{
                  width: "100%",
                  maxWidth: 28,
                  height: `${Math.max((entry.total / maxSeriesValue) * 120, 8)}px`,
                  borderRadius: "999px",
                  background:
                    entry.total > 0
                      ? "linear-gradient(180deg, var(--color-primary-light), var(--color-accent))"
                      : "var(--color-bg-input)",
                  transition: "height 0.4s ease",
                }}
              />
              <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                {entry.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h3 className="heading-3 mb-4">Subject-wise Attempts</h3>
      <div className="flex flex-col gap-3 mb-6">
        {analytics.subjectStats.map((entry) => (
          <div key={entry.subject} className="card" style={{ padding: "var(--space-4)" }}>
            <div className="flex justify-between items-center mb-3">
              <span style={{ fontWeight: "var(--weight-semibold)" }}>{entry.subject}</span>
              <span
                className="badge"
                style={{
                  background: `${BAND_COLORS[entry.band]}15`,
                  color: BAND_COLORS[entry.band],
                  border: `1px solid ${BAND_COLORS[entry.band]}30`,
                  textTransform: "none",
                }}
              >
                {entry.band}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                gap: "var(--space-3)",
                fontSize: "var(--text-sm)",
              }}
            >
              <div>
                <div className="text-muted">Ability Score</div>
                <div style={{ fontWeight: "var(--weight-semibold)" }}>
                  {Math.round(entry.abilityScore)}/100
                </div>
              </div>
              <div>
                <div className="text-muted">Quiz Attempts</div>
                <div style={{ fontWeight: "var(--weight-semibold)" }}>{entry.quizAttempts}</div>
              </div>
              <div>
                <div className="text-muted">Chat Sessions</div>
                <div style={{ fontWeight: "var(--weight-semibold)" }}>{entry.chatSessions}</div>
              </div>
            </div>
            <div className="text-muted mt-3" style={{ fontSize: "var(--text-xs)" }}>
              Average quiz accuracy: {entry.avgAccuracy !== null ? `${entry.avgAccuracy}%` : "No quiz data yet"}
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-6" style={{ padding: "var(--space-4)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="heading-3">Recent Activity</h3>
          {analytics.activityItems.length > 4 ? (
            <button
              type="button"
              onClick={() => setShowAllActivity((prev) => !prev)}
              style={subtleActionStyle}
            >
              {showAllActivity ? "View less" : "View more"}
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          {visibleActivityItems.length > 0 ? (
            visibleActivityItems.map((activity) => (
              <div
                key={activity.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  paddingBottom: "var(--space-3)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div>
                  <div style={{ fontWeight: "var(--weight-semibold)" }}>{activity.title}</div>
                  <div className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
                    {activity.subtitle}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {activity.type === "quiz" && typeof activity.score === "number" ? (
                    <div className="badge badge-success" style={{ marginBottom: 6 }}>
                      {activity.score}%
                    </div>
                  ) : null}
                  <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                    {formatActivityTime(activity.timestamp)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-secondary">No recent activity yet.</div>
          )}
        </div>
      </div>

      <div className="card mb-6" style={{ padding: "var(--space-4)" }}>
        <h3 className="heading-3 mb-4">Recommended Next Topics</h3>
        {analytics.recommendedTopics.length > 0 ? (
          <div className="chip-group">
            {analytics.recommendedTopics.map((topic) => (
              <span key={topic} className="badge badge-warning">
                {topic}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-secondary">Keep practicing to unlock recommendations.</div>
        )}
      </div>

      <div className="card" style={{ padding: "var(--space-4)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="heading-3">Learning Snapshot</h3>
          {snapshotTopics.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAllSnapshot((prev) => !prev)}
              style={subtleActionStyle}
            >
              {showAllSnapshot ? "View less" : "View more"}
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <div className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
            Profile created for {profile.board} Grade {profile.grade}
          </div>
          <div className="chip-group">
            {visibleSnapshotTopics.map((topic) => (
              <span
                key={topic.label}
                className={topic.tone === "success" ? "badge badge-success" : "badge badge-error"}
              >
                {topic.label}
              </span>
            ))}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
            Based on stored profile data, recent chats, and quiz attempts saved on this device.
          </div>
        </div>
      </div>

      {reportHtml && (
        <div
          className="paywall-overlay"
          onClick={() => setReportHtml(null)}
        >
          <div
            className="paywall-card"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              height: "85vh",
              borderRadius: "var(--radius-2xl)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div className="flex justify-between items-center gap-3">
              <div>
                <div className="heading-3">Progress Report</div>
                <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                  View in app or download as PDF
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary"
                  onClick={handleDownloadReport}
                  style={{
                    width: 42,
                    minWidth: 42,
                    paddingInline: 0,
                    justifyContent: "center",
                    borderColor: "rgba(108, 92, 231, 0.24)",
                    boxShadow: "none",
                    fontSize: "1.15rem",
                  }}
                  title="Download report"
                  aria-label="Download report"
                >
                  ↓
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handlePrintReport}
                  style={{ borderColor: "rgba(108, 92, 231, 0.24)", boxShadow: "none" }}
                >
                  Save as PDF
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setReportHtml(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              srcDoc={reportHtml}
              title="Progress report preview"
              style={{
                width: "100%",
                flex: 1,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xl)",
                background: "#f4f5f7",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
