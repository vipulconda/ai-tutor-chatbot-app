"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { StudentProfileData } from "@/types";
import { BOARDS, GRADES } from "@/types";
import { clearQuizAttemptHistory } from "@/lib/progress-storage";

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [grade, setGrade] = useState(8);
  const [board, setBoard] = useState("CBSE");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) {
      return;
    }

    setProfile(null);

    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile);
          setGrade(data.profile.grade);
          setBoard(data.profile.board);
        }
      });
  }, [userId]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          board,
          preferredLang: profile.preferredLang,
          subjects: profile.subjects,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    clearQuizAttemptHistory(session?.user?.id);
    await signOut({ redirect: false });
    router.push("/");
  };

  return (
    <div className="page-content">
      <div className="top-bar">
        <h1 className="heading-2">Settings</h1>
      </div>

      {/* Profile Card */}
      <div className="card mb-6" style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "var(--radius-full)",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            fontWeight: "var(--weight-bold)",
            flexShrink: 0,
          }}
        >
          {(session?.user?.name || "S")[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: "var(--weight-semibold)", fontSize: "var(--text-lg)" }}>
            {session?.user?.name || "Student"}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
            {session?.user?.email}
          </div>
        </div>
      </div>

      {/* Academic Settings */}
      <h3 className="heading-3 mb-4">Academic Settings</h3>
      <div className="flex flex-col gap-4 mb-6">
        <div className="input-group">
          <label htmlFor="settings-grade" className="input-label">Grade</label>
          <select
            id="settings-grade"
            className="select"
            value={grade}
            onChange={(e) => setGrade(parseInt(e.target.value))}
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label htmlFor="settings-board" className="input-label">Board</label>
          <select
            id="settings-board"
            className="select"
            value={board}
            onChange={(e) => setBoard(e.target.value)}
          >
            {BOARDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={handleSave}
          disabled={saving}
          id="settings-save-btn"
        >
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
        </button>
      </div>

      {/* Subscription */}
      <h3 className="heading-3 mb-4">Subscription</h3>
      <div className="card mb-6">
        <div className="flex justify-between items-center">
          <div>
            <div style={{ fontWeight: "var(--weight-semibold)" }}>Free Plan</div>
            <div className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
              10 questions/day • Math only
            </div>
          </div>
          <span className="badge badge-primary">FREE</span>
        </div>
        <button
          className="btn btn-accent btn-full mt-4 btn-sm"
          id="settings-upgrade-btn"
          onClick={() => router.push("/subscribe")}
        >
          Upgrade Plan ⚡
        </button>
      </div>

      {/* Danger Zone */}
      <div className="mt-8">
        <button
          className="btn btn-ghost btn-full"
          onClick={handleSignOut}
          style={{ color: "var(--color-error)" }}
          id="sign-out-btn"
        >
          Sign Out
        </button>
      </div>

      {saved && (
        <div className="toast toast-success">
          Settings saved successfully ✓
        </div>
      )}
    </div>
  );
}
