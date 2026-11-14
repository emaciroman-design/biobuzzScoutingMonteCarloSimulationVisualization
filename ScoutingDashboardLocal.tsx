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
    <div style={{ fontFamily: "Inter, sans-serif", background: "#0f172a", minHeight: "100vh