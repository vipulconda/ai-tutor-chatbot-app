"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { StudentProfileData } from "@/types";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-content">
        <div className="top-bar">
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <h1 className="heading-2">Profile</h1>
          <div />
        </div>
        <div className="flex flex-col gap-4 mt-6">
          <div className="skeleton" style={{ height: "180px", borderRadius: "var(--radius-xl)" }} />
          <div className="skeleton" style={{ height: "200px", borderRadius: "16px" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="top-bar">
        <button className="back-btn" onClick={() => router.back()}>←</button>
        <h1 className="heading-2">Profile</h1>
        <div />
      </div>

      <div className="card mb-6 mt-6" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-6)" }}>
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "var(--radius-full)",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2.5rem",
            fontWeight: "var(--weight-bold)",
            color: "white",
            border: "4px solid var(--color-bg-elevated)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          {(session?.user?.name || "S")[0].toUpperCase()}
        </div>
        <div className="text-center">
          <h2 className="heading-2">{session?.user?.name || "Student"}</h2>
          <p className="text-secondary mt-1">{session?.user?.email}</p>
        </div>
      </div>

      {profile ? (
        <>
          <h3 className="heading-3 mb-4">Academic Details</h3>
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4" style={{ paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
              <span className="text-secondary">Grade</span>
              <span style={{ fontWeight: "var(--weight-semibold)" }}>{profile.grade}</span>
            </div>
            <div className="flex justify-between items-center mb-4" style={{ paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
              <span className="text-secondary">Board</span>
              <span style={{ fontWeight: "var(--weight-semibold)" }}>{profile.board}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-secondary">Language</span>
              <span style={{ fontWeight: "var(--weight-semibold)" }}>{profile.preferredLang}</span>
            </div>
          </div>

          <h3 className="heading-3 mb-4">Enrolled Subjects</h3>
          <div className="chip-group mb-6">
            {profile.subjects.map(subject => (
              <span key={subject} className="badge" style={{ 
                padding: "var(--space-2) var(--space-4)", 
                fontSize: "var(--text-sm)",
                background: "var(--color-primary-ghost)",
                color: "var(--color-primary-light)",
                border: "1px solid rgba(108, 92, 231, 0.2)"
              }}>
                {subject}
              </span>
            ))}
          </div>
          
          <button 
            className="btn btn-secondary btn-full mt-2"
            onClick={() => router.push("/onboarding")}
          >
            Edit Academic Profile
          </button>
        </>
      ) : (
        <div className="empty-state">
          <p className="text-secondary mb-4">You haven&apos;t set up your learning profile yet.</p>
          <button className="btn btn-primary" onClick={() => router.push("/onboarding")}>
            Complete Profile
          </button>
        </div>
      )}
    </div>
  );
}
