/**
 * ScoutingDashboardLocal.tsx
 * ───────────────────────────
 * Identical to ScoutingDashboard.tsx EXCEPT it reads from mockData.json
 * instead of Firestore. No Firebase account, no internet, no API keys needed.
 *
 * HOW TO RUN:
 *   1. npm create vite@latest biobuzz-local -- --template react-ts
 *   2. cd biobuzz-local
 *   3. npm install recharts
 *   4. Copy this file + mockData.json into src/
 *   5. In src/App.tsx replace everything with:
 *        import ScoutingDashboardLocal from "./ScoutingDashboardLocal";
 *        export default function App() { return <ScoutingDashboardLocal />; }
 *   6. npm run dev  →  open http://localhost:5173
 *
 * When you're ready for real Firebase, swap this file for ScoutingDashboard.tsx.
 */

import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import mockData from "./mockData.json";

// ── Types ──────────────────────────────────────────────────────────────────

interface TeamStats {
  teamNumber:        string;
  matchCount:        number;
  trustedMatchCount: number;
  trusted:           boolean;
  strategy:          string;
  avg: Record<string, number>;
  std: Record<string, number>;
  min: Record<string, number>;
  max: Record<string, number>;
}

interface SimResult {
  matchId:    string;
  ourTeam:    string;
  oppTeam:    string;
  ourWinProb: number;
  oppWinProb: number;
  our:  { worst: number; average: number; best: number };
  opp:  { worst: number; average: number; best: number };
  officialResult: { ourScore: number; oppScore: number; predictedCorrectly: boolean } | null;
}

interface PredAccuracy {
  totalPredicted: number;
  totalCorrect:   number;
  accuracyPct:    number;
}

interface RawEntry {
  teamNumber:      string;
  matchNumber:     string;
  autoShotAccuracy: number;
  teleShotAccuracy: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];
const STRATEGY_COLORS: Record<string, string> = {
  specimen_dominant: "#6366f1",
  balanced:          "#10b981",
  sample_dominant:   "#f59e0b",
  unknown:           "#9ca3af",
};
const STRATEGY_LABELS: Record<string, string> = {
  specimen_dominant: "Tip-Dominant",
  sample_dominant:   "Placement-Dominant",
  balanced:          "Balanced",
  unknown:           "Unknown",
};

function computeScore(avg: Record<string, number>): number {
  return (
    (avg.autoLeave     ?? 0) * 3
    + (avg.autoPark    ?? 0) * 5
    + (avg.autoTips    ?? 0) * 20
    + (avg.teleTips    ?? 0) * 20
    + (avg.cellBalls   ?? 0) * 2
    + (avg.flowerPollen ?? 0) * 2
    + (avg.flowerNectar ?? 0) * 2
    + (avg.endgamePark ?? 0) * 5
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ScoutingDashboardLocal() {
  const teamStats:   TeamStats[]   = mockData.teamStats as TeamStats[];
  const simResults:  SimResult[]   = mockData.simulationResults as SimResult[];
  const accuracy:    PredAccuracy  = mockData.predictionAccuracy as PredAccuracy;
  const rawEntries:  RawEntry[]    = mockData.rawEntries as RawEntry[];

  const [activeTab, setActiveTab] = useState<
    "winProb" | "scoreRange" | "strategy" | "shotAccuracy" | "predAccuracy"
  >("winProb");

  const sortedTeams = [...teamStats].sort((a, b) =>
    a.teamNumber.localeCompare(b.teamNumber)
  );

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#0f172a", minHeight: "100vh", color: "#f1f5f9", padding: "24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        FTC Scouting — BIOBUZZ 2026
      </h1>
      <p style={{ color: "#f59e0b", marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
        ⚠ LOCAL TEST MODE — reading from mockData.json, not Firestore
      </p>
      <p style={{ color: "#94a3b8", marginBottom: 24, fontSize: 13 }}>
        {sortedTeams.length} team(s) · Prediction accuracy: {accuracy.accuracyPct.toFixed(1)}%
      </p>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
        {(
          [
            { key: "winProb",      label: "Win Probability" },
            { key: "scoreRange",   label: "Score Ranges" },
            { key: "strategy",     label: "Strategy" },
            { key: "shotAccuracy", label: "Shot Accuracy" },
            { key: "predAccuracy", label: "Prediction Accuracy" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 14,
              background: activeTab === key ? "#6366f1" : "#1e293b",
              color:      activeTab === key ? "#fff"    : "#94a3b8",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "winProb"      && <WinProbChart   simResults={simResults} teamStats={sortedTeams} />}
      {activeTab === "scoreRange"   && <ScoreRangeChart teamStats={sortedTeams} />}
      {activeTab === "strategy"     && <StrategyChart   teamStats={sortedTeams} />}
      {activeTab === "shotAccuracy" && <ShotAccuracyChart rawEntries={rawEntries} teamStats={sortedTeams} />}
      {activeTab === "predAccuracy" && <PredAccuracyChart accuracy={accuracy} simResults={simResults} />}
    </div>
  );
}

// ── Chart 1: Win Probability ───────────────────────────────────────────────

function WinProbChart({ simResults, teamStats }: { simResults: SimResult[]; teamStats: TeamStats[] }) {
  const teamWinAvg: Record<string, number[]> = {};
  for (const r of simResults) {
    if (!teamWinAvg[r.ourTeam]) teamWinAvg[r.ourTeam] = [];
    if (!teamWinAvg[r.oppTeam]) teamWinAvg[r.oppTeam] = [];
    teamWinAvg[r.ourTeam].push(r.ourWinProb * 100);
    teamWinAvg[r.oppTeam].push(r.oppWinProb * 100);
  }
  const data = teamStats.map((t) => {
    const probs = teamWinAvg[t.teamNumber] ?? [];
    const avg   = probs.length ? probs.reduce((s, v) => s + v, 0) / probs.length : 0;
    return { team: t.teamNumber, winProb: Math.round(avg * 10) / 10 };
  }).sort((a, b) => b.winProb - a.winProb);

  return (
    <ChartCard title="Average Win Probability (across all matchups)">
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="team" stroke="#94a3b8" />
          <YAxis domain={[0, 100]} stroke="#94a3b8" label={{ value: "Win %", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
            formatter={(v: number) => [`${v.toFixed(1)}%`, "Win Probability"]} />
          <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4"
            label={{ value: "50%", fill: "#f59e0b", fontSize: 12 }} />
          <Bar dataKey="winProb" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Chart 2: Score Range ───────────────────────────────────────────────────

function ScoreRangeChart({ teamStats }: { teamStats: TeamStats[] }) {
  const data = teamStats.map((t) => ({
    team:    t.teamNumber,
    worst:   Math.round(computeScore(t.min)),
    average: Math.round(computeScore(t.avg)),
    best:    Math.round(computeScore(t.max)),
  })).sort((a, b) => b.average - a.average);

  return (
    <ChartCard title="Score Range per Team (Worst / Average / Best)">
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="team" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" label={{ value: "Points", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} />
          <Legend wrapperStyle={{ color: "#94a3b8" }} />
          <Bar dataKey="worst"   name="Worst"   fill="#ef4444" radius={[2, 2, 0, 0]} />
          <Bar dataKey="average" name="Average" fill="#6366f1" radius={[2, 2, 0, 0]} />
          <Bar dataKey="best"    name="Best"    fill="#10b981" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Chart 3: Strategy ──────────────────────────────────────────────────────

function StrategyChart({ teamStats }: { teamStats: TeamStats[] }) {
  const counts: Record<string, number> = {
    specimen_dominant: 0, balanced: 0, sample_dominant: 0, unknown: 0,
  };
  for (const t of teamStats) counts[t.strategy] = (counts[t.strategy] ?? 0) + 1;

  const pieData = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: STRATEGY_LABELS[key] ?? key, value, key }));

  const barData = teamStats.map((t) => ({
    team:               t.teamNumber,
    "Tip Points":       Math.round(((t.avg.autoTips ?? 0) + (t.avg.teleTips ?? 0)) * 20),
    "Placement Points": Math.round(((t.avg.cellBalls ?? 0) + (t.avg.flowerPollen ?? 0) + (t.avg.flowerNectar ?? 0)) * 2),
  })).sort((a, b) => b["Tip Points"] - a["Tip Points"]);

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <ChartCard title="Strategy Distribution" style={{ flex: "1 1 300px" }}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
              label={({ name, value }) => `${name}: ${value}`}>
              {pieData.map((entry, i) => (
                <Cell key={i} fill={STRATEGY_COLORS[entry.key] ?? COLORS[i]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Avg Tip vs Placement Points per Team" style={{ flex: "2 1 460px" }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#94a3b8" />
            <YAxis type="category" dataKey="team" stroke="#94a3b8" width={60} />
            <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} />
            <Legend wrapperStyle={{ color: "#94a3b8" }} />
            <Bar dataKey="Tip Points"       fill="#6366f1" radius={[0, 4, 4, 0]} />
            <Bar dataKey="Placement Points" fill="#f59e0b" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Chart 4: Shot Accuracy Trend ───────────────────────────────────────────

function ShotAccuracyChart({ rawEntries, teamStats }: { rawEntries: RawEntry[]; teamStats: TeamStats[] }) {
  const byTeam: Record<string, { match: number; autoAcc: number; teleAcc: number }[]> = {};
  for (const e of rawEntries) {
    if (!byTeam[e.teamNumber]) byTeam[e.teamNumber] = [];
    byTeam[e.teamNumber].push({
      match:   parseInt(e.matchNumber) || 0,
      autoAcc: e.autoShotAccuracy * 100,
      teleAcc: e.teleShotAccuracy * 100,
    });
  }
  for (const t of Object.values(byTeam)) t.sort((a, b) => a.match - b.match);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#e2e8f0" }}>
        Shot Accuracy Trend per Team
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {teamStats.map((t, i) => {
          const entries = byTeam[t.teamNumber] ?? [];
          if (entries.length === 0) return null;
          return (
            <div key={t.teamNumber} style={{ flex: "1 1 400px", background: "#1e293b", borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: COLORS[i % COLORS.length] }}>
                Team {t.teamNumber}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={entries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="match" stroke="#94a3b8" label={{ value: "Match #", position: "insideBottom", offset: -5, fill: "#94a3b8" }} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" label={{ value: "%", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }}
                    formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                  <Line type="monotone" dataKey="autoAcc" name="Auto Accuracy" stroke="#6366f1" dot strokeWidth={2} />
                  <Line type="monotone" dataKey="teleAcc" name="Tele Accuracy" stroke="#10b981" dot strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Chart 5: Prediction Accuracy ───────────────────────────────────────────

function PredAccuracyChart({ accuracy, simResults }: { accuracy: PredAccuracy; simResults: SimResult[] }) {
  const validated = simResults.filter((r) => r.officialResult !== null);
  const history   = validated.map((r, i) => {
    const correct = validated.slice(0, i + 1).filter((v) => v.officialResult?.predictedCorrectly).length;
    return {
      match:    r.matchId.split("_").pop() ?? String(i + 1),
      accuracy: Math.round((correct / (i + 1)) * 1000) / 10,
    };
  });

  return (
    <ChartCard title="Running Prediction Accuracy %">
      <div style={{ display: "flex", gap: 32, marginBottom: 24, flexWrap: "wrap" }}>
        <StatTile label="Total Predicted" value={String(accuracy.totalPredicted)} />
        <StatTile label="Correct"         value={String(accuracy.totalCorrect)} />
        <StatTile label="Accuracy"        value={`${accuracy.accuracyPct.toFixed(1)}%`} highlight />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={history} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="match" stroke="#94a3b8" />
          <YAxis domain={[0, 100]} stroke="#94a3b8" label={{ value: "Accuracy %", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
            formatter={(v: number) => [`${v.toFixed(1)}%`, "Accuracy"]} />
          <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ChartCard({ title, children, style }: {
  title: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24, ...style }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: "#e2e8f0" }}>{title}</h2>
      {children}
    </div>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: highlight ? "#10b981" : "#f1f5f9" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{label}</div>
    </div>
  );
}
