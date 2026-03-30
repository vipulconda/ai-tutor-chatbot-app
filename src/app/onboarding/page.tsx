"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUBJECTS, BOARDS, GRADES } from "@/types";

const STEPS = [
  {
    icon: "🎓",
    title: "What grade are you in?",
    subtitle: "This helps us tailor content to your level",
  },
  {
    icon: "📋",
    title: "Which board?",
    subtitle: "We'll follow your curriculum",
  },
  {
    icon: "📚",
    title: "Pick your subjects",
    subtitle: "Choose the subjects you want help with",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [grade, setGrade] = useState(8);
  const [board, setBoard] = useState("CBSE");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    "Mathematics",
  ]);
  const [loading, setLoading] = useState(false);

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subject)
        ? prev.filter((s) => s !== subject)
        : [...prev, subject]
    );
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          board,
          preferredLang: "English",
          subjects: selectedSubjects,
        }),
      });
      router.push("/dashboard");
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    if (step === 2) return selectedSubjects.length > 0;
    return true;
  };

  return (
    <div className="onboarding-container">
      {/* Step indicators */}
      <div className="step-indicator mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`step-dot ${i === step ? "active" : ""}`}
          />
        ))}
      </div>

      <div className="onboarding-step animate-fade-in" key={step}>
        <div className="onboarding-illustration animate-float">
          {STEPS[step].icon}
        </div>

        <div className="text-center">
          <h2 className="heading-2" style={{ marginBottom: "var(--space-2)" }}>
            {STEPS[step].title}
          </h2>
          <p className="text-secondary">{STEPS[step].subtitle}</p>
        </div>

        <div
          className="flex flex-col gap-3 mt-4"
          style={{ flex: 1 }}
        >
          {/* Step 0: Grade selection */}
          {step === 0 && (
            <div className="chip-group" style={{ justifyContent: "center" }}>
              {GRADES.map((g) => (
                <button
                  key={g}
                  className={`chip ${grade === g ? "selected" : ""}`}
                  onClick={() => setGrade(g)}
                  style={{ minWidth: "72px", textAlign: "center" }}
                >
                  Grade {g}
                </button>
              ))}
            </div>
          )}

          {/* Step 1: Board selection */}
          {step === 1 && (
            <div className="flex flex-col gap-3">
              {BOARDS.map((b) => (
                <button
                  key={b.value}
                  className="card"
                  onClick={() => setBoard(b.value)}
                  style={{
                    textAlign: "left",
                    borderColor:
                      board === b.value
                        ? "var(--color-primary)"
                        : "var(--color-border)",
                    boxShadow:
                      board === b.value ? "var(--shadow-glow)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "var(--weight-semibold)",
                      fontSize: "var(--text-lg)",
                    }}
                  >
                    {b.label}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Subject selection */}
          {step === 2 && (
            <div className="chip-group" style={{ justifyContent: "center" }}>
              {SUBJECTS.map((subject) => (
                <button
                  key={subject}
                  className={`chip ${
                    selectedSubjects.includes(subject) ? "selected" : ""
                  }`}
                  onClick={() => toggleSubject(subject)}
                >
                  {subject === "Mathematics" && "📐 "}
                  {subject === "Science" && "🔬 "}
                  {subject === "Social Science" && "🌍 "}
                  {subject === "English" && "📖 "}
                  {subject === "Hindi" && "🇮🇳 "}
                  {subject}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => setStep(step - 1)}
              style={{ flex: 1 }}
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              style={{ flex: step > 0 ? 2 : 1 }}
              id="onboarding-next-btn"
            >
              Continue
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleFinish}
              disabled={loading || !canProceed()}
              style={{ flex: 2 }}
              id="onboarding-finish-btn"
            >
              {loading ? "Setting up..." : "Start Learning! 🚀"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
