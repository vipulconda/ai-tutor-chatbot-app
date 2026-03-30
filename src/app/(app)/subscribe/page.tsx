"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PlanFeature {
  name: string;
  free: string;
  basic: string;
  pro: string;
}

const FEATURES: PlanFeature[] = [
  { name: "Daily Questions", free: "10", basic: "50", pro: "Unlimited" },
  { name: "Subjects", free: "Math only", basic: "All 5", pro: "All 5" },
  { name: "Text Chat", free: "✓", basic: "✓", pro: "✓" },
  { name: "Voice Input", free: "✗", basic: "✓", pro: "✓" },
  { name: "Photo Solve", free: "✗", basic: "✗", pro: "✓" },
  { name: "Adaptive Quizzes", free: "✗", basic: "✗", pro: "✓" },
  { name: "Parent Dashboard", free: "✗", basic: "✗", pro: "✓" },
  { name: "Progress Reports", free: "Basic", basic: "Full", pro: "Full + Export" },
  { name: "Ads", free: "Yes", basic: "No", pro: "No" },
];

const PLANS = [
  {
    id: "FREE",
    name: "Free",
    price: 0,
    period: "",
    description: "Get started with basic learning",
    badge: null,
    gradient: "var(--gradient-glass)",
    borderColor: "var(--color-border)",
  },
  {
    id: "BASIC",
    name: "Basic",
    price: 149,
    period: "/month",
    description: "Unlock all subjects & voice input",
    badge: "POPULAR",
    gradient: "linear-gradient(145deg, rgba(108, 92, 231, 0.12) 0%, rgba(162, 155, 254, 0.06) 100%)",
    borderColor: "var(--color-primary)",
  },
  {
    id: "PRO",
    name: "Pro",
    price: 499,
    period: "/month",
    description: "Everything unlimited + premium features",
    badge: "BEST VALUE",
    gradient: "linear-gradient(145deg, rgba(0, 210, 211, 0.12) 0%, rgba(85, 239, 196, 0.06) 100%)",
    borderColor: "var(--color-accent)",
  },
];

export default function SubscribePage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState("BASIC");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubscribe = async () => {
    if (selectedPlan === "FREE") {
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedPlan }),
      });

      const data = await res.json();

      if (data.checkoutUrl) {
        // In production: redirect to Stripe Checkout
        window.location.href = data.checkoutUrl;
      } else {
        // Development mode: direct upgrade
        setSuccess(true);
        setTimeout(() => router.push("/dashboard"), 2000);
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="page-content">
        <div className="empty-state" style={{ marginTop: "var(--space-16)" }}>
          <div style={{ fontSize: "4rem" }} className="animate-float">
            🎉
          </div>
          <h2 className="heading-2">Welcome to {selectedPlan}!</h2>
          <p className="text-secondary">
            Your plan has been upgraded. Redirecting to dashboard...
          </p>
          <div className="streaming-dots mt-4">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="top-bar">
        <button
          className="back-btn"
          onClick={() => router.back()}
          id="subscribe-back-btn"
        >
          ←
        </button>
        <h1 className="heading-2">Choose Your Plan</h1>
        <div />
      </div>

      <p className="text-secondary mb-6" style={{ textAlign: "center" }}>
        Unlock your full learning potential with EduBot
      </p>

      {/* Plan Cards */}
      <div className="flex flex-col gap-4 mb-6">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            className="card"
            onClick={() => setSelectedPlan(plan.id)}
            style={{
              background: plan.gradient,
              borderColor:
                selectedPlan === plan.id
                  ? plan.borderColor
                  : "var(--color-border)",
              boxShadow:
                selectedPlan === plan.id
                  ? plan.id === "BASIC"
                    ? "var(--shadow-glow)"
                    : plan.id === "PRO"
                      ? "var(--shadow-glow-accent)"
                      : "none"
                  : "none",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.25s ease",
              position: "relative",
              overflow: "hidden",
            }}
            id={`plan-${plan.id.toLowerCase()}`}
          >
            {plan.badge && (
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                }}
              >
                <span
                  className="badge"
                  style={{
                    background:
                      plan.id === "BASIC"
                        ? "var(--color-primary-ghost)"
                        : "rgba(0, 210, 211, 0.1)",
                    color:
                      plan.id === "BASIC"
                        ? "var(--color-primary-light)"
                        : "var(--color-accent)",
                    border: `1px solid ${
                      plan.id === "BASIC"
                        ? "rgba(108, 92, 231, 0.2)"
                        : "rgba(0, 210, 211, 0.2)"
                    }`,
                  }}
                >
                  {plan.badge}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 mb-2">
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "var(--radius-full)",
                  border: `2px solid ${
                    selectedPlan === plan.id
                      ? plan.id === "FREE"
                        ? "var(--color-text-secondary)"
                        : plan.borderColor
                      : "var(--color-text-muted)"
                  }`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {selectedPlan === plan.id && (
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "var(--radius-full)",
                      background:
                        plan.id === "PRO"
                          ? "var(--color-accent)"
                          : plan.id === "BASIC"
                            ? "var(--color-primary)"
                            : "var(--color-text-secondary)",
                    }}
                  />
                )}
              </div>
              <div>
                <span
                  style={{
                    fontWeight: "var(--weight-semibold)",
                    fontSize: "var(--text-lg)",
                  }}
                >
                  {plan.name}
                </span>
              </div>
            </div>

            <div style={{ marginLeft: "32px" }}>
              <div className="tier-price">
                {plan.price === 0 ? (
                  "Free"
                ) : (
                  <>
                    ₹{plan.price}
                    <span>{plan.period}</span>
                  </>
                )}
              </div>
              <div
                className="text-secondary mt-1"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {plan.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Feature Comparison */}
      <h3
        className="heading-3 mb-4"
        style={{ textAlign: "center" }}
      >
        Compare Plans
      </h3>
      <div
        className="card mb-6"
        style={{ padding: "var(--space-3)", overflow: "auto" }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "var(--text-xs)",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "var(--space-2) var(--space-2)",
                  color: "var(--color-text-muted)",
                  fontWeight: "var(--weight-medium)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                Feature
              </th>
              <th
                style={{
                  textAlign: "center",
                  padding: "var(--space-2)",
                  color: "var(--color-text-muted)",
                  fontWeight: "var(--weight-medium)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                Free
              </th>
              <th
                style={{
                  textAlign: "center",
                  padding: "var(--space-2)",
                  color: "var(--color-primary-light)",
                  fontWeight: "var(--weight-semibold)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                Basic
              </th>
              <th
                style={{
                  textAlign: "center",
                  padding: "var(--space-2)",
                  color: "var(--color-accent)",
                  fontWeight: "var(--weight-semibold)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.name}>
                <td
                  style={{
                    padding: "var(--space-2)",
                    borderBottom: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {f.name}
                </td>
                <td
                  style={{
                    textAlign: "center",
                    padding: "var(--space-2)",
                    borderBottom: "1px solid var(--color-border)",
                    color:
                      f.free === "✗"
                        ? "var(--color-text-muted)"
                        : "var(--color-text)",
                  }}
                >
                  {f.free}
                </td>
                <td
                  style={{
                    textAlign: "center",
                    padding: "var(--space-2)",
                    borderBottom: "1px solid var(--color-border)",
                    color:
                      f.basic === "✗"
                        ? "var(--color-text-muted)"
                        : "var(--color-text)",
                  }}
                >
                  {f.basic}
                </td>
                <td
                  style={{
                    textAlign: "center",
                    padding: "var(--space-2)",
                    borderBottom: "1px solid var(--color-border)",
                    color:
                      f.pro === "✗"
                        ? "var(--color-text-muted)"
                        : "var(--color-text)",
                  }}
                >
                  {f.pro}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <button
        className="btn btn-primary btn-lg btn-full"
        onClick={handleSubscribe}
        disabled={loading}
        id="subscribe-cta-btn"
      >
        {loading
          ? "Processing..."
          : selectedPlan === "FREE"
            ? "Continue with Free"
            : `Subscribe to ${selectedPlan} — ₹${PLANS.find((p) => p.id === selectedPlan)?.price}/mo`}
      </button>

      <p
        className="text-muted mt-4"
        style={{ textAlign: "center", fontSize: "var(--text-xs)" }}
      >
        Cancel anytime. No hidden charges. Prices in INR.
      </p>
    </div>
  );
}
