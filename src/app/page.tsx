import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="page-content" style={{ padding: 0 }}>
      {/* Hero Section */}
      <section
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "var(--space-6)",
          background: "var(--gradient-hero)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Floating Background Orbs */}
        <div
          style={{
            position: "absolute",
            top: "10%",
            right: "-20%",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(108,92,231,0.15) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
          className="animate-float"
        />
        <div
          style={{
            position: "absolute",
            bottom: "20%",
            left: "-15%",
            width: "250px",
            height: "250px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,210,211,0.12) 0%, transparent 70%)",
            filter: "blur(40px)",
            animationDelay: "1s",
          }}
          className="animate-float"
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Logo */}
          <div
            style={{
              fontSize: "3.5rem",
              marginBottom: "var(--space-2)",
            }}
          >
            🧠
          </div>

          <div className="badge badge-primary mb-4">
            AI-Powered Learning
          </div>

          <h1
            className="heading-1"
            style={{ marginBottom: "var(--space-4)", maxWidth: "320px" }}
          >
            Your Personal{" "}
            <span
              style={{
                background: "var(--gradient-primary)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              AI Tutor
            </span>{" "}
            for School
          </h1>

          <p
            className="text-secondary"
            style={{
              fontSize: "var(--text-lg)",
              maxWidth: "340px",
              marginBottom: "var(--space-8)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            Master Math, Science, English & more. Adaptive learning for grades
            6–10, designed for CBSE, ICSE & State boards.
          </p>

          <div className="flex flex-col gap-3">
            <Link href="/signup" className="btn btn-primary btn-lg btn-full" id="hero-signup-btn">
              Start Learning Free →
            </Link>
            <Link href="/login" className="btn btn-ghost btn-lg btn-full" id="hero-login-btn">
              I already have an account
            </Link>
          </div>
        </div>

        {/* Feature Pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            marginTop: "var(--space-10)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {[
            { icon: "💬", label: "Text Chat" },
            { icon: "🎙️", label: "Voice Input" },
            { icon: "📸", label: "Photo Solve" },
            { icon: "📊", label: "Adaptive" },
          ].map((feature) => (
            <div
              key={feature.label}
              className="badge"
              style={{
                background: "var(--gradient-glass)",
                border: "1px solid var(--color-border)",
                padding: "var(--space-2) var(--space-3)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--weight-medium)",
                color: "var(--color-text-secondary)",
                textTransform: "none",
                letterSpacing: "0",
              }}
            >
              {feature.icon} {feature.label}
            </div>
          ))}
        </div>
      </section>

      {/* Trust Section */}
      <section
        style={{
          padding: "var(--space-10) var(--space-6)",
          textAlign: "center",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <p
          className="text-muted"
          style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-6)" }}
        >
          BUILT FOR INDIAN STUDENTS
        </p>
        <div
          className="flex gap-6 justify-center"
          style={{ flexWrap: "wrap" }}
        >
          {["CBSE", "ICSE", "State Board"].map((board) => (
            <div
              key={board}
              style={{
                padding: "var(--space-3) var(--space-5)",
                borderRadius: "var(--radius-lg)",
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--weight-semibold)",
              }}
            >
              {board}
            </div>
          ))}
        </div>

        <div
          className="flex gap-8 justify-center mt-8"
          style={{ flexWrap: "wrap" }}
        >
          <div className="text-center">
            <div className="heading-2" style={{ color: "var(--color-primary-light)" }}>
              5+
            </div>
            <div className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
              Subjects
            </div>
          </div>
          <div className="text-center">
            <div className="heading-2" style={{ color: "var(--color-accent)" }}>
              6-10
            </div>
            <div className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
              Grades
            </div>
          </div>
          <div className="text-center">
            <div className="heading-2" style={{ color: "var(--color-warning)" }}>
              24/7
            </div>
            <div className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
              Available
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
