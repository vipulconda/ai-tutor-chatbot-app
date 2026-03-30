import type { StudentProfileData } from "@/types";
import type { QuizAttemptRecord } from "@/lib/progress-storage";

interface SubjectReportStat {
  subject: string;
  abilityScore: number;
  band: string;
  quizAttempts: number;
  avgAccuracy: number | null;
  chatSessions: number;
  totalAttempts: number;
}

interface ActivityReportItem {
  title: string;
  subtitle: string;
  timestamp: string;
  score?: number;
}

export interface ProgressReportData {
  profile: StudentProfileData;
  overallAccuracy: number | null;
  totalPracticeAttempts: number;
  streak: number;
  subjectStats: SubjectReportStat[];
  recommendedTopics: string[];
  strongTopics: string[];
  weakTopics: string[];
  recentActivity: ActivityReportItem[];
  generatedAt: string;
  quizAttempts: QuizAttemptRecord[];
  totalChatSessions: number;
  totalQuizAttempts: number;
  totalChatTokens: number;
  bestQuizScore: number | null;
  lowestQuizScore: number | null;
  recentQuizAverage: number | null;
  weeklyActivity: Array<{ label: string; total: number; quizCount: number; chatCount: number }>;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString));
}

function renderMetricCard(label: string, value: string, tone: string) {
  return `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value" style="color:${tone}">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderTopicChips(topics: string[], tone: "success" | "warning" | "danger") {
  if (topics.length === 0) {
    return `<div class="empty">No items available yet.</div>`;
  }

  return `
    <div class="chip-grid">
      ${topics
      .map(
        (topic) => `<span class="chip chip-${tone}">${escapeHtml(topic)}</span>`
      )
      .join("")}
    </div>
  `;
}

export function createProgressReportHtml(data: ProgressReportData) {
  const strongestSubject = [...data.subjectStats].sort((a, b) => b.abilityScore - a.abilityScore)[0];
  const weakestSubject = [...data.subjectStats].sort((a, b) => a.abilityScore - b.abilityScore)[0];

  const recentQuizRows =
    data.quizAttempts.length > 0
      ? data.quizAttempts
        .slice(0, 8)
        .map(
          (attempt) => `
              <tr>
                <td>${escapeHtml(attempt.subject)}</td>
                <td>${attempt.correctAnswers}/${attempt.questionCount}</td>
                <td>${attempt.scorePercent}%</td>
                <td>${escapeHtml(attempt.topics.join(", ") || "General")}</td>
                <td>${escapeHtml(formatDateTime(attempt.createdAt))}</td>
              </tr>
            `
        )
        .join("")
      : `<tr><td colspan="5" class="empty-cell">No quiz attempts available yet.</td></tr>`;

  const recentActivityRows =
    data.recentActivity.length > 0
      ? data.recentActivity
        .slice(0, 10)
        .map(
          (item) => `
              <tr>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.subtitle)}</td>
                <td>${typeof item.score === "number" ? `${item.score}%` : "-"}</td>
                <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
              </tr>
            `
        )
        .join("")
      : `<tr><td colspan="4" class="empty-cell">No recent activity available.</td></tr>`;

  const subjectRows = data.subjectStats
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.subject)}</td>
          <td>${Math.round(entry.abilityScore)}/100</td>
          <td>${escapeHtml(entry.band)}</td>
          <td>${entry.quizAttempts}</td>
          <td>${entry.chatSessions}</td>
          <td>${entry.totalAttempts}</td>
          <td>${entry.avgAccuracy !== null ? `${entry.avgAccuracy}%` : "n/a"}</td>
        </tr>
      `
    )
    .join("");

  const activityBars = data.weeklyActivity
    .map((day) => {
      const height = Math.max(day.total * 14, 12);
      return `
        <div class="bar-group">
          <div class="bar-value">${day.total}</div>
          <div class="bar-track">
            <div class="bar-fill" style="height:${height}px"></div>
          </div>
          <div class="bar-label">${escapeHtml(day.label)}</div>
          <div class="bar-meta">${day.quizCount}Q / ${day.chatCount}C</div>
        </div>
      `;
    })
    .join("");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Student Progress Report</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #172033;
          --muted: #64748b;
          --border: #d8e0eb;
          --surface: #ffffff;
          --surface-alt: #f6f8fb;
          --primary: #1d4ed8;
          --success: #0f9d58;
          --warning: #c77d00;
          --danger: #c2410c;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Noto Sans", "Noto Sans Devanagari", "Segoe UI", Arial, sans-serif;
          color: var(--ink);
          background: #eef2f7;
          overflow-x: auto;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.5;
        }
        .page {
          width: 1120px;
          min-width: 1120px;
          margin: 0 auto;
          background: var(--surface);
          min-height: 100vh;
          padding: 40px 36px 56px;
        }
        .hero {
          border: 1px solid var(--border);
          background: linear-gradient(135deg, #eff6ff, #ffffff 60%);
          border-radius: 24px;
          padding: 28px;
          margin-bottom: 24px;
        }
        .eyebrow {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--primary);
          font-weight: 700;
          margin-bottom: 10px;
        }
        h1 {
          margin: 0 0 10px;
          font-size: 32px;
          line-height: 1.1;
          font-family: "Segoe UI", "Noto Sans", Arial, sans-serif;
        }
        .hero-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          color: var(--muted);
          font-size: 14px;
          overflow-wrap: anywhere;
        }
        .section {
          margin-top: 28px;
        }
        .section h2 {
          margin: 0 0 14px;
          font-size: 21px;
          font-family: "Segoe UI", "Noto Sans", Arial, sans-serif;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .metric-card {
          border: 1px solid var(--border);
          border-radius: 18px;
          background: var(--surface-alt);
          padding: 16px;
        }
        .metric-label {
          color: var(--muted);
          font-size: 13px;
          margin-bottom: 10px;
        }
        .metric-value {
          font-size: 28px;
          font-weight: 700;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        .insight-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .insight-card {
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 16px;
          background: #fff;
        }
        .insight-label {
          color: var(--muted);
          font-size: 13px;
          margin-bottom: 8px;
        }
        .insight-value {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .insight-copy {
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
        }
        .chart {
          border: 1px solid var(--border);
          border-radius: 22px;
          background: var(--surface-alt);
          padding: 18px;
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 12px;
          align-items: end;
          overflow: hidden;
          min-width: 720px;
        }
        .scroll-shell {
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 4px;
        }
        .scroll-shell::-webkit-scrollbar {
          height: 10px;
        }
        .scroll-shell::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
        }
        .scroll-shell::-webkit-scrollbar-track {
          background: #e2e8f0;
          border-radius: 999px;
        }
        .bar-group {
          text-align: center;
          min-width: 0;
        }
        .bar-value {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 8px;
        }
        .bar-track {
          height: 150px;
          display: flex;
          align-items: end;
          justify-content: center;
          min-width: 0;
        }
        .bar-fill {
          width: min(28px, 100%);
          border-radius: 999px;
          background: linear-gradient(180deg, #60a5fa, #1d4ed8);
        }
        .bar-label {
          margin-top: 8px;
          font-weight: 700;
          font-size: 13px;
        }
        .bar-meta {
          color: var(--muted);
          font-size: 11px;
          margin-top: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid var(--border);
          border-radius: 18px;
          overflow: hidden;
          background: white;
          table-layout: auto;
          min-width: 980px;
        }
        th, td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          text-align: left;
          font-size: 14px;
          vertical-align: top;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        th {
          background: var(--surface-alt);
          font-size: 12px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }
        tr:last-child td { border-bottom: none; }
        .chip-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          max-width: 100%;
          overflow-wrap: anywhere;
        }
        .chip-success { background: #e7f8ee; color: var(--success); }
        .chip-warning { background: #fff4de; color: var(--warning); }
        .chip-danger { background: #feeee8; color: var(--danger); }
        .empty, .empty-cell {
          color: var(--muted);
          font-style: italic;
        }
        .footer-note {
          margin-top: 30px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.6;
        }
        .subject-table col:nth-child(1) { width: 20%; }
        .subject-table col:nth-child(2) { width: 12%; }
        .subject-table col:nth-child(3) { width: 14%; }
        .subject-table col:nth-child(4) { width: 10%; }
        .subject-table col:nth-child(5) { width: 10%; }
        .subject-table col:nth-child(6) { width: 12%; }
        .subject-table col:nth-child(7) { width: 22%; }
        .quiz-table col:nth-child(1) { width: 16%; }
        .quiz-table col:nth-child(2) { width: 12%; }
        .quiz-table col:nth-child(3) { width: 10%; }
        .quiz-table col:nth-child(4) { width: 38%; }
        .quiz-table col:nth-child(5) { width: 24%; }
        .activity-table col:nth-child(1) { width: 26%; }
        .activity-table col:nth-child(2) { width: 40%; }
        .activity-table col:nth-child(3) { width: 10%; }
        .activity-table col:nth-child(4) { width: 24%; }
        @media (max-width: 760px) {
          .page {
            width: 1120px;
            min-width: 1120px;
            padding: 24px 18px 32px;
          }
          .metrics,
          .insight-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .chart {
            gap: 8px;
            padding: 14px;
          }
        }
        @media print {
          body { background: white; }
          .page { width: 100%; margin: 0; padding: 24px; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="hero">
          <div class="eyebrow">Student Progress Report</div>
          <h1>${escapeHtml(`Grade ${String(data.profile.grade)} • ${data.profile.board}`)}</h1>
          <div class="hero-meta">
            <span>Generated ${escapeHtml(formatDateTime(data.generatedAt))}</span>
            <span>${escapeHtml(`${data.totalPracticeAttempts} total learning sessions`)}</span>
            <span>${escapeHtml(`${data.streak} day streak`)}</span>
          </div>
        </section>

        <section class="section">
          <h2>Executive Summary</h2>
          <div class="metrics">
            ${renderMetricCard("Overall quiz accuracy", data.overallAccuracy !== null ? `${data.overallAccuracy}%` : "n/a", "var(--primary)")}
            ${renderMetricCard("Quiz attempts", String(data.totalQuizAttempts), "var(--success)")}
            ${renderMetricCard("Chat sessions", String(data.totalChatSessions), "var(--warning)")}
            ${renderMetricCard("Chat tokens", String(data.totalChatTokens), "var(--danger)")}
          </div>
          <div class="metrics" style="margin-top:12px;">
            ${renderMetricCard("Best quiz score", data.bestQuizScore !== null ? `${data.bestQuizScore}%` : "n/a", "var(--success)")}
            ${renderMetricCard("Lowest quiz score", data.lowestQuizScore !== null ? `${data.lowestQuizScore}%` : "n/a", "var(--danger)")}
            ${renderMetricCard("Recent quiz average", data.recentQuizAverage !== null ? `${data.recentQuizAverage}%` : "n/a", "var(--primary)")}
            ${renderMetricCard("Saved quiz attempts", String(data.quizAttempts.length), "var(--ink)")}
          </div>
        </section>

        <section class="section">
          <h2>Key Insights</h2>
          <div class="insight-grid">
            <div class="insight-card">
              <div class="insight-label">Strongest subject</div>
              <div class="insight-value">${escapeHtml(strongestSubject ? strongestSubject.subject : "Not enough data")}</div>
              <div class="insight-copy">${escapeHtml(
    strongestSubject
      ? `Ability score ${Math.round(strongestSubject.abilityScore)}/100 with ${strongestSubject.totalAttempts} total practice attempts.`
      : "More activity is needed before a strongest subject can be identified."
  )}</div>
            </div>
            <div class="insight-card">
              <div class="insight-label">Needs support</div>
              <div class="insight-value">${escapeHtml(weakestSubject ? weakestSubject.subject : "Not enough data")}</div>
              <div class="insight-copy">${escapeHtml(
    weakestSubject
      ? `Ability score ${Math.round(weakestSubject.abilityScore)}/100. Focus on revision and targeted quiz practice here next.`
      : "More activity is needed before support areas can be identified."
  )}</div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2>Weekly Activity Trend</h2>
          <div class="scroll-shell">
            <div class="chart">${activityBars}</div>
          </div>
        </section>

        <section class="section">
          <h2>Subject Performance Breakdown</h2>
          <div class="scroll-shell">
            <table class="subject-table">
              <colgroup>
                <col /><col /><col /><col /><col /><col /><col />
              </colgroup>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Ability</th>
                  <th>Band</th>
                  <th>Quizzes</th>
                  <th>Chats</th>
                  <th>Total Practice</th>
                  <th>Avg Accuracy</th>
                </tr>
              </thead>
              <tbody>${subjectRows}</tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2>Recommended Next Topics</h2>
          ${renderTopicChips(data.recommendedTopics, "warning")}
        </section>

        <section class="section">
          <h2>Learning Snapshot</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <div class="insight-label" style="margin-bottom:10px;">Strong topics</div>
              ${renderTopicChips(data.strongTopics, "success")}
            </div>
            <div>
              <div class="insight-label" style="margin-bottom:10px;">Topics to revise</div>
              ${renderTopicChips(data.weakTopics, "danger")}
            </div>
          </div>
        </section>

        <section class="section">
          <h2>Recent Quiz Performance</h2>
          <div class="scroll-shell">
            <table class="quiz-table">
              <colgroup>
                <col /><col /><col /><col /><col />
              </colgroup>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Score</th>
                  <th>Percent</th>
                  <th>Topics</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>${recentQuizRows}</tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2>Recent Activity</h2>
          <div class="scroll-shell">
            <table class="activity-table">
              <colgroup>
                <col /><col /><col /><col />
              </colgroup>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Details</th>
                  <th>Score</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>${recentActivityRows}</tbody>
            </table>
          </div>
        </section>

        <div class="footer-note">
          This report combines profile data, quiz attempts saved on this device, and recent chat activity. Use the browser print dialog to save this report as a PDF with full Unicode text support.
        </div>
      </main>
    </body>
  </html>`;
}
