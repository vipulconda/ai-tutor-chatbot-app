"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { StudentProfileData } from "@/types";
import type { QuizQuestion } from "@/lib/ai/quiz-generator";
import { saveQuizAttempt } from "@/lib/progress-storage";

const SUBJECT_META: Record<string, { icon: string; color: string }> = {
  Mathematics: { icon: "📐", color: "var(--color-math)" },
  Science: { icon: "🔬", color: "var(--color-science)" },
  "Social Science": { icon: "🌍", color: "var(--color-social)" },
  English: { icon: "📖", color: "var(--color-english)" },
  Hindi: { icon: "🇮🇳", color: "var(--color-hindi)" },
};

type QuizState = "select" | "loading" | "active" | "results";

export default function QuizPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [quizState, setQuizState] = useState<QuizState>("select");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [quizError, setQuizError] = useState<string | null>(null);
  const hasSavedAttemptRef = useRef(false);
  const hasSyncedProgressRef = useRef(false);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => {
        if (!data.profile) {
          router.push("/onboarding");
          return;
        }
        setProfile(data.profile);
        setProfileLoading(false);
      })
      .catch(() => setProfileLoading(false));
  }, [router]);

  const startQuiz = async (subject: string) => {
    if (quizState === "loading") {
      return;
    }

    setSelectedSubject(subject);
    setQuizState("loading");
    setAnswers([]);
    setCurrentQ(0);
    setShowExplanation(false);
    setQuizError(null);
    hasSavedAttemptRef.current = false;
    hasSyncedProgressRef.current = false;

    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          questionCount: 5,
        }),
      });

      const data = await res.json();

      const nextQuestions = Array.isArray(data.questions) ? data.questions : [];

      if (!res.ok || nextQuestions.length === 0) {
        throw new Error(data.error || "Quiz generation failed");
      }

      setQuestions(nextQuestions);
      setAnswers(new Array(nextQuestions.length).fill(null));
      if (data.error) {
        setQuizError("We had trouble generating a full quiz, so a fallback quiz was loaded.");
      }
      setQuizState("active");
    } catch (err) {
      console.error("Failed to start quiz:", err);
      setQuizError("We couldn't generate your quiz right now. Please try again.");
      setQuizState("select");
    }
  };

  const handleAnswer = (optionIndex: number) => {
    if (answers[currentQ] !== null) return; // Already answered
    const newAnswers = [...answers];
    newAnswers[currentQ] = optionIndex;
    setAnswers(newAnswers);
    setShowExplanation(true);
  };

  const nextQuestion = () => {
    setShowExplanation(false);
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setQuizState("results");
    }
  };

  const score = answers.reduce<number>((acc, ans, idx) => {
    if (ans === questions[idx]?.correctIndex) return acc + 1;
    return acc;
  }, 0);

  const scorePercent =
    questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  useEffect(() => {
    if (quizState !== "results" || questions.length === 0 || hasSavedAttemptRef.current) {
      return;
    }

    saveQuizAttempt({
      id: `quiz-${Date.now()}`,
      subject: selectedSubject,
      scorePercent,
      correctAnswers: score,
      questionCount: questions.length,
      topics: Array.from(new Set(questions.map((question) => question.topic).filter(Boolean))),
      createdAt: new Date().toISOString(),
    });

    hasSavedAttemptRef.current = true;
  }, [questions, quizState, score, scorePercent, selectedSubject]);

  useEffect(() => {
    if (
      quizState !== "results" ||
      questions.length === 0 ||
      !profile ||
      hasSyncedProgressRef.current
    ) {
      return;
    }

    const topicPerformanceMap = new Map<string, { correct: number; total: number }>();

    questions.forEach((question, index) => {
      const topic = question.topic?.trim();

      if (!topic) {
        return;
      }

      const existing = topicPerformanceMap.get(topic) ?? { correct: 0, total: 0 };
      existing.total += 1;

      if (answers[index] === question.correctIndex) {
        existing.correct += 1;
      }

      topicPerformanceMap.set(topic, existing);
    });

    const topicPerformance = Array.from(topicPerformanceMap.entries()).map(([topic, stats]) => ({
      topic,
      correct: stats.correct,
      total: stats.total,
    }));

    hasSyncedProgressRef.current = true;

    void fetch("/api/profiles/quiz-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: selectedSubject,
        scorePercent,
        questionCount: questions.length,
        topicPerformance,
      }),
    })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to sync quiz progress");
        }

        if (data.profile) {
          setProfile(data.profile);
        }
      })
      .catch((error) => {
        console.error("Failed to sync quiz progress:", error);
        setQuizError("Your quiz was saved, but progress stats could not be updated right now.");
        hasSyncedProgressRef.current = false;
      });
  }, [answers, profile, questions, quizState, scorePercent, selectedSubject]);

  if (profileLoading) {
    return (
      <div className="page-content">
        <div className="top-bar">
          <h1 className="heading-2">Practice Quiz</h1>
        </div>
        <div className="flex flex-col gap-4">
          <div className="skeleton" style={{ height: "80px" }} />
          <div className="skeleton" style={{ height: "80px" }} />
          <div className="skeleton" style={{ height: "80px" }} />
        </div>
      </div>
    );
  }

  /* ───── Subject Selection ───── */
  if (quizState === "select") {
    return (
      <div className="page-content">
        <div className="top-bar">
          <h1 className="heading-2">Practice Quiz</h1>
          <span className="badge badge-primary">AI Generated</span>
        </div>

        <p className="text-secondary mb-6">
          Test your knowledge! Quizzes are generated from your weak topics to help you improve.
        </p>

        {quizError && (
          <div className="card mb-6" style={{ borderColor: "rgba(225, 112, 85, 0.3)" }}>
            <div style={{ color: "var(--color-error)", fontWeight: "var(--weight-semibold)", marginBottom: "var(--space-2)" }}>
              Quiz issue
            </div>
            <div className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              {quizError}
            </div>
          </div>
        )}

        {profile?.weakTopics && profile.weakTopics.length > 0 && (
          <div className="card mb-6" style={{ borderColor: "rgba(225, 112, 85, 0.3)" }}>
            <div
              style={{
                fontWeight: "var(--weight-semibold)",
                fontSize: "var(--text-sm)",
                color: "var(--color-error)",
                marginBottom: "var(--space-2)",
              }}
            >
              📌 Focus Areas
            </div>
            <div className="chip-group">
              {profile.weakTopics.map((topic) => (
                <span key={topic} className="badge badge-error">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        <h3 className="heading-3 mb-4">Choose a Subject</h3>
        <div className="flex flex-col gap-3">
          {(profile?.subjects || []).map((subject) => {
            const meta = SUBJECT_META[subject] || {
              icon: "📚",
              color: "var(--color-primary)",
            };
            return (
              <button
                key={subject}
                className="subject-card"
                onClick={() => startQuiz(subject)}
                id={`quiz-${subject.toLowerCase().replace(/\s/g, "-")}`}
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
                  <div className="subject-progress">5 questions • Adaptive</div>
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
                  ▶
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ───── Loading ───── */
  if (quizState === "loading") {
    return (
      <div className="page-content">
        <div className="empty-state" style={{ marginTop: "var(--space-16)" }}>
          <div className="empty-state-icon animate-float">🧠</div>
          <h3 className="heading-3">Generating your quiz...</h3>
          <p className="text-secondary">
            Creating {selectedSubject} questions tailored to your level
          </p>
          <div className="streaming-dots" style={{ marginTop: "var(--space-4)" }}>
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  /* ───── Active Quiz ───── */
  if (quizState === "active" && questions[currentQ]) {
    const q = questions[currentQ];
    const userAnswer = answers[currentQ];
    const isAnswered = userAnswer !== null;

    return (
      <div className="page-content">
        {quizError && (
          <div className="card mb-4" style={{ borderColor: "rgba(253, 203, 110, 0.35)" }}>
            <div style={{ color: "var(--color-warning, #fdcb6e)", fontWeight: "var(--weight-semibold)", marginBottom: "var(--space-2)" }}>
              Limited quiz loaded
            </div>
            <div className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              {quizError}
            </div>
          </div>
        )}
        {/* Progress Bar */}
        <div style={{ marginBottom: "var(--space-6)" }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
              Question {currentQ + 1} of {questions.length}
            </span>
            <span className="badge badge-primary">{selectedSubject}</span>
          </div>
          <div
            style={{
              width: "100%",
              height: "6px",
              background: "var(--color-bg-input)",
              borderRadius: "var(--radius-full)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${((currentQ + 1) / questions.length) * 100}%`,
                height: "100%",
                background: "var(--gradient-primary)",
                borderRadius: "var(--radius-full)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>

        {/* Topic badge */}
        {q.topic && (
          <div
            className="badge"
            style={{
              background: "var(--color-primary-ghost)",
              color: "var(--color-primary-light)",
              border: "1px solid rgba(108, 92, 231, 0.2)",
              marginBottom: "var(--space-4)",
              textTransform: "none",
              letterSpacing: "0",
              fontSize: "var(--text-xs)",
            }}
          >
            {q.topic} • {q.difficulty}
          </div>
        )}

        {/* Question */}
        <h2
          className="heading-3"
          style={{
            marginBottom: "var(--space-6)",
            lineHeight: "var(--leading-relaxed)",
          }}
        >
          {q.question}
        </h2>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {q.options.map((option, idx) => {
            let optionStyle: React.CSSProperties = {
              padding: "var(--space-4)",
              borderRadius: "var(--radius-lg)",
              borderWidth: "1.5px",
              borderStyle: "solid",
              borderColor: "var(--color-border)",
              background: "var(--color-bg-input)",
              textAlign: "left" as const,
              cursor: isAnswered ? "default" : "pointer",
              fontSize: "var(--text-base)",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
            };

            if (isAnswered) {
              if (idx === q.correctIndex) {
                optionStyle = {
                  ...optionStyle,
                  borderColor: "var(--color-success)",
                  background: "rgba(0, 184, 148, 0.1)",
                  color: "var(--color-success)",
                };
              } else if (idx === userAnswer && idx !== q.correctIndex) {
                optionStyle = {
                  ...optionStyle,
                  borderColor: "var(--color-error)",
                  background: "rgba(225, 112, 85, 0.1)",
                  color: "var(--color-error)",
                };
              } else {
                optionStyle = {
                  ...optionStyle,
                  opacity: 0.5,
                };
              }
            }

            const optionLabel = String.fromCharCode(65 + idx); // A, B, C, D

            return (
              <button
                key={idx}
                style={optionStyle}
                onClick={() => handleAnswer(idx)}
                disabled={isAnswered}
                id={`quiz-option-${idx}`}
              >
                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-full)",
                    background: isAnswered
                      ? idx === q.correctIndex
                        ? "var(--color-success)"
                        : idx === userAnswer
                          ? "var(--color-error)"
                          : "var(--color-bg-card)"
                      : "var(--color-bg-card)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--weight-semibold)",
                    color: isAnswered && (idx === q.correctIndex || idx === userAnswer)
                      ? "white"
                      : "var(--color-text-secondary)",
                    flexShrink: 0,
                  }}
                >
                  {isAnswered && idx === q.correctIndex
                    ? "✓"
                    : isAnswered && idx === userAnswer
                      ? "✗"
                      : optionLabel}
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {showExplanation && (
          <div
            className="card mt-6 animate-slide-up"
            style={{
              borderColor:
                userAnswer === q.correctIndex
                  ? "rgba(0, 184, 148, 0.3)"
                  : "rgba(225, 112, 85, 0.3)",
            }}
          >
            <div
              style={{
                fontWeight: "var(--weight-semibold)",
                fontSize: "var(--text-sm)",
                color:
                  userAnswer === q.correctIndex
                    ? "var(--color-success)"
                    : "var(--color-error)",
                marginBottom: "var(--space-2)",
              }}
            >
              {userAnswer === q.correctIndex ? "🎉 Correct!" : "❌ Not quite"}
            </div>
            <p
              className="text-secondary"
              style={{ fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)" }}
            >
              {q.explanation}
            </p>
          </div>
        )}

        {/* Next Button */}
        {isAnswered && (
          <button
            className="btn btn-primary btn-lg btn-full mt-6 animate-fade-in"
            onClick={nextQuestion}
            id="quiz-next-btn"
          >
            {currentQ < questions.length - 1 ? "Next Question →" : "See Results 🏆"}
          </button>
        )}
      </div>
    );
  }

  /* ───── Results ───── */
  if (quizState === "results") {
    return (
      <div className="page-content">
        <div className="empty-state" style={{ paddingTop: "var(--space-8)" }}>
          <div style={{ fontSize: "4rem", marginBottom: "var(--space-2)" }}>
            {scorePercent >= 80 ? "🏆" : scorePercent >= 50 ? "👏" : "💪"}
          </div>
          <h2 className="heading-2">Quiz Complete!</h2>
          <p className="text-secondary" style={{ maxWidth: "280px" }}>
            {scorePercent >= 80
              ? "Excellent work! You've mastered this topic."
              : scorePercent >= 50
                ? "Good effort! Keep practicing to improve."
                : "Don't worry! Practice makes perfect. Try chatting with EduBot about the topics you missed."}
          </p>
        </div>

        {/* Score Card */}
        <div
          className="card mb-6"
          style={{
            background:
              scorePercent >= 80
                ? "linear-gradient(135deg, rgba(0, 184, 148, 0.15) 0%, rgba(85, 239, 196, 0.05) 100%)"
                : scorePercent >= 50
                  ? "linear-gradient(135deg, rgba(116, 185, 255, 0.15) 0%, rgba(116, 185, 255, 0.05) 100%)"
                  : "linear-gradient(135deg, rgba(225, 112, 85, 0.15) 0%, rgba(253, 203, 110, 0.05) 100%)",
            textAlign: "center",
          }}
        >
          <div className="heading-1" style={{ fontSize: "3rem" }}>
            {score}/{questions.length}
          </div>
          <div className="text-secondary mt-2">
            {scorePercent}% correct in {selectedSubject}
          </div>
        </div>

        {/* Question Review */}
        <h3 className="heading-3 mb-4">Review</h3>
        <div className="flex flex-col gap-2 mb-6">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="card"
              style={{
                padding: "var(--space-3) var(--space-4)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
              }}
            >
              <span
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "var(--radius-full)",
                  background:
                    answers[idx] === q.correctIndex
                      ? "var(--color-success)"
                      : "var(--color-error)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-xs)",
                  color: "white",
                  flexShrink: 0,
                }}
              >
                {answers[idx] === q.correctIndex ? "✓" : "✗"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {q.question}
                </div>
                <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                  {q.topic}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            className="btn btn-primary btn-full"
            onClick={() => startQuiz(selectedSubject)}
            id="quiz-retry-btn"
          >
            Try Again 🔄
          </button>
          <button
            className="btn btn-secondary btn-full"
            onClick={() => setQuizState("select")}
          >
            Different Subject
          </button>
          <button
            className="btn btn-ghost btn-full"
            onClick={() => router.push("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
