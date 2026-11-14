import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebaseConfig";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ResponsiveContainer, Cell
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────
interface RawEntry {
  teamNumber: string;
  matchNumber: number;
  autoPlacement: number;
  autoShotsSucc: number;
  autoShotsTotal: number;
  tipsAuto: number;
  leaveAuto: boolean;
  parkAuto: boolean;
  teleopShotsSucc: number;
  teleopShotsTotal: number;
  tipsTeleop: number;
  cellBallsEndgame: number;
  pollenFlowers: number;
  nectarFlowers: number;
  ballsIntaked: number;
  cyclesTeleop: number;
  endgamePark: boolean;
  timestamp: string;
}

interface SimResult {
  winProbability: number;
  simAvg: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  matchesAnalyzed: number;
}

interface TeamStats {
  teamNumber: string;
  matchCount: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  avgTips: number;
  avgCycles: number;
  autoAccuracy: number;
  teleopAccuracy: number;
  parkRate: number;
  leaveRate: number;
  winProb: number;
  // Monte Carlo extras (present when simulation has run)
  simAvg?: number;
  p10?: number;
  p25?: number;
  p75?: number;
  p90?: number;
  usingSimulation: boolean;
}

// ── Scoring engine (mirrors Python simulation) ───────────────────────────────
function computeScore(e: RawEntry): number {
  let score = 0;
  if (e.leaveAuto)  score += 3;
  if (e.parkAuto)   score += 5;
  score += (e.tipsAuto    || 0) * 20;
  score += (e.tipsTeleop  || 0) * 20;
  score += (e.autoShotsSucc   || 0) * 2;
  score += (e.teleopShotsSucc || 0) * 2;
  score += (e.pollenFlowers   || 0) * 2;
  score += (e.nectarFlowers   || 0) * 2;
  if (e.endgamePark) score += 5;
  return score;
}

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = ["#4f9cf9", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#eab308"];

// ── Main component ────────────────────────────────────────────────────────────
export default function ScoutingDashboard() {
  const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch both collections in parallel
      const [rawSnap, simSnap] = await Promise.all([
        getDocs(collection(db, "rawEntries")),
        getDocs(collection(db, "simulationResults")),
      ]);

      // Build simulation results map keyed by team number string
      const simMap: Record<string, SimResult> = {};
      simSnap.forEach((doc) => {
        simMap[doc.id] = doc.data() as SimResult;
      });

      // Group raw entries by team
      const byTeam: Record<string, RawEntry[]> = {};
      rawSnap.forEach((doc) => {
        const d = doc.data() as RawEntry;
        const key = String(d.teamNumber);
        if (!byTeam[key]) byTeam[key] = [];
        byTeam[key].push(d);
      });

      setEntryCount(rawSnap.size);

      const stats: TeamStats[] = [];
      for (const [team, rows] of Object.entries(byTeam)) {
        const scores = rows.map(computeScore);
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const avgScore = avg(scores);

        const autoHits = rows.reduce((s, r) => s + (r.autoShotsSucc || 0), 0);
        const autoTot  = rows.reduce((s, r) => s + (r.autoShotsTotal || 0), 0);
        const telHits  = rows.reduce((s, r) => s + (r.teleopShotsSucc || 0), 0);
        const telTot   = rows.reduce((s, r) => s + (r.teleopShotsTotal || 0), 0);

        const sim = simMap[team];

        // Use Monte Carlo win probability if available, else sigmoid fallback
        const winProb = sim
          ? sim.winProbability
          : 1 / (1 + Math.exp(-((avgScore - 60) / 30)));

        stats.push({
          teamNumber: team,
          matchCount: rows.length,
          avgScore,
          minScore: Math.min(...scores),
          maxScore: Math.max(...scores),
          avgTips:  avg(rows.map(r => (r.tipsAuto || 0) + (r.tipsTeleop || 0))),
          avgCycles: avg(rows.map(r => r.cyclesTeleop || 0)),
          autoAccuracy:   autoTot > 0 ? autoHits / autoTot : 0,
          teleopAccuracy: telTot  > 0 ? telHits  / telTot  : 0,
          parkRate:  avg(rows.map(r => r.endgamePark ? 1 : 0)),
          leaveRate: avg(rows.map(r => r.leaveAuto  ? 1 : 0)),
          winProb,
          simAvg: sim?.simAvg,
          p10:    sim?.p10,
          p25:    sim?.p25,
          p75:    sim?.p75,
          p90:    sim?.p90,
          usingSimulation: !!sim,
        });
      }

      stats.sort((a, b) => b.winProb - a.winProb);
      setTeamStats(stats);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      setError("Failed to load Firestore data: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  const tabs = ["Win Probability", "Score Ranges", "Strategy", "Shot Accuracy", "Team Overview"];

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
                  height:"100vh", background:"#0f172a", color:"#94a3b8",
                  fontFamily:"monospace", fontSize:18 }}>
      Loading Firestore data…
    </div>
  );

  if (error) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
                  height:"100vh", background:"#0f172a", color:"#ef4444",
                  fontFamily:"monospace", fontSize:16, padding:32 }}>
      {error}
    </div>
  );

  if (teamStats.length === 0) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                  justifyContent:"center", height:"100vh", background:"#0f172a",
                  color:"#94a3b8", fontFamily:"monospace", fontSize:16, gap:12 }}>
      <div>No scouting data yet.</div>
      <div style={{ fontSize:13 }}>Submit a form entry and refresh.</div>
      <button onClick={fetchData}
        style={{ marginTop:8, padding:"8px 20px", background:"#4f9cf9",
                 color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:14 }}>
        Refresh
      </button>
    </div>
  );

  // ── Chart data ─────────────────────────────────────────────────────────────
  const winProbData = teamStats.map(t => ({
    team: t.teamNumber,
    "Win Prob %": Math.round(t.winProb * 100),
    source: t.usingSimulation ? "Monte Carlo" : "Sigmoid",
  }));

  const scoreRangeData = teamStats.map(t => ({
    team: t.teamNumber,
    Min: Math.round(t.minScore),
    Avg: Math.round(t.avgScore),
    Max: Math.round(t.maxScore),
    ...(t.p25 !== undefined ? { "P25 (sim)": Math.round(t.p25) } : {}),
    ...(t.p75 !== undefined ? { "P75 (sim)": Math.round(t.p75) } : {}),
  }));

  const strategyData = teamStats.map(t => ({
    team: t.teamNumber,
    "Avg Tips": +t.avgTips.toFixed(1),
    "Avg Cycles": +t.avgCycles.toFixed(1),
    "Park Rate %": Math.round(t.parkRate * 100),
    "Leave Rate %": Math.round(t.leaveRate * 100),
  }));

  const shotData = teamStats.map(t => ({
    team: t.teamNumber,
    "Auto Acc %": Math.round(t.autoAccuracy * 100),
    "Teleop Acc %": Math.round(t.teleopAccuracy * 100),
  }));

  const scatterData = teamStats.map(t => ({
    x: Math.round(t.avgScore),
    y: Math.round(t.winProb * 100),
    team: t.teamNumber,
  }));

  // ── Styles ─────────────────────────────────────────────────────────────────
  const S = {
    wrap: { minHeight:"100vh", background:"#0f172a", color:"#e2e8f0",
            fontFamily:"'Inter', sans-serif", padding:"0 0 48px" } as React.CSSProperties,
    header: { background:"#1e293b", borderBottom:"1px solid #334155",
              padding:"16px 32px", display:"flex", alignItems:"center",
              justifyContent:"space-between" } as React.CSSProperties,
    title:  { fontSize:22, fontWeight:700, color:"#4f9cf9", margin:0 } as React.CSSProperties,
    meta:   { fontSize:12, color:"#64748b" } as React.CSSProperties,
    tabs:   { display:"flex", gap:4, padding:"20px 32px 0",
              borderBottom:"1px solid #1e293b" } as React.CSSProperties,
    tab: (active: boolean) => ({
      padding:"8px 18px", borderRadius:"6px 6px 0 0", cursor:"pointer",
      fontSize:13, fontWeight:500, border:"none",
      background: active ? "#4f9cf9" : "#1e293b",
      color: active ? "#fff" : "#94a3b8",
      transition:"background 0.15s",
    } as React.CSSProperties),
    body:   { padding:"28px 32px" } as React.CSSProperties,
    card:   { background:"#1e293b", borderRadius:10, padding:"20px 24px",
              marginBottom:24, border:"1px solid #334155" } as React.CSSProperties,
    h2:     { fontSize:15, fontWeight:600, color:"#cbd5e1", marginBottom:16, marginTop:0 } as React.CSSProperties,
    table:  { width:"100%", borderCollapse:"collapse" as const, fontSize:13 },
    th:     { textAlign:"left" as const, padding:"8px 12px", color:"#64748b",
              borderBottom:"1px solid #334155", fontWeight:600 },
    td:     { padding:"8px 12px", borderBottom:"1px solid #1e293b" },
  };

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>🐝 BIOBUZZ 2026-27 Scouting Dashboard</h1>
          <div style={S.meta}>
            {entryCount} entries · {teamStats.length} teams ·
            Last refresh: {lastRefresh.toLocaleTimeString()} ·{" "}
            {teamStats.filter(t => t.usingSimulation).length} teams w/ Monte Carlo
          </div>
        </div>
        <button onClick={fetchData}
          style={{ padding:"8px 16px", background:"#4f9cf9", color:"#fff",
                   border:"none", borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:500 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {tabs.map((t, i) => (
          <button key={i} style={S.tab(activeTab === i)} onClick={() => setActiveTab(i)}>
            {t}
          </button>
        ))}
      </div>

      <div style={S.body}>

        {/* ── Tab 0: Win Probability ── */}
        {activeTab === 0 && (
          <div style={S.card}>
            <h2 style={S.h2}>
              Win Probability by Team
              <span style={{ fontSize:12, color:"#64748b", fontWeight:400, marginLeft:8 }}>
                ★ = Monte Carlo · no star = sigmoid estimate
              </span>
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={winProbData} margin={{ top:8, right:16, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="team" stroke="#64748b"
                  tickFormatter={(v, i) => winProbData[i]?.source === "Monte Carlo" ? `${v} ★` : String(v)} />
                <YAxis domain={[0, 100]} stroke="#64748b" unit="%" />
                <Tooltip contentStyle={{ background:"#1e293b", border:"1px solid #334155", color:"#e2e8f0" }}
                  formatter={(val, _name, props) => [
                    `${val}% (${props.payload.source})`, "Win Prob"
                  ]} />
                <Bar dataKey="Win Prob %" radius={[4,4,0,0]}>
                  {winProbData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Tab 1: Score Ranges ── */}
        {activeTab === 1 && (
          <div style={S.card}>
            <h2 style={S.h2}>
              Score Range per Team
              <span style={{ fontSize:12, color:"#64748b", fontWeight:400, marginLeft:8 }}>
                P25/P75 shown when Monte Carlo available
              </span>
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={scoreRangeData} margin={{ top:8, right:16, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="team" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ background:"#1e293b", border:"1px solid #334155", color:"#e2e8f0" }} />
                <Legend />
                <Bar dataKey="Min" fill="#ef4444" radius={[4,4,0,0]} />
                <Bar dataKey="Avg" fill="#4f9cf9" radius={[4,4,0,0]} />
                <Bar dataKey="Max" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="P25 (sim)" fill="#a855f7" radius={[4,4,0,0]} />
                <Bar dataKey="P75 (sim)" fill="#eab308" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Tab 2: Strategy ── */}
        {activeTab === 2 && (
          <div style={S.card}>
            <h2 style={S.h2}>Strategy Breakdown</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={strategyData} margin={{ top:8, right:16, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="team" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ background:"#1e293b", border:"1px solid #334155", color:"#e2e8f0" }} />
                <Legend />
                <Bar dataKey="Avg Tips"    fill="#a855f7" radius={[4,4,0,0]} />
                <Bar dataKey="Avg Cycles"  fill="#4f9cf9" radius={[4,4,0,0]} />
                <Bar dataKey="Park Rate %"  fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="Leave Rate %" fill="#f97316" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Tab 3: Shot Accuracy ── */}
        {activeTab === 3 && (
          <>
            <div style={S.card}>
              <h2 style={S.h2}>Shot Accuracy — Auto vs Teleop</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={shotData} margin={{ top:8, right:16, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="team" stroke="#64748b" />
                  <YAxis domain={[0,100]} stroke="#64748b" unit="%" />
                  <Tooltip contentStyle={{ background:"#1e293b", border:"1px solid #334155", color:"#e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="Auto Acc %"   fill="#4f9cf9" radius={[4,4,0,0]} />
                  <Bar dataKey="Teleop Acc %" fill="#f97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Scatter: avg score vs win prob */}
            <div style={S.card}>
              <h2 style={S.h2}>Avg Score vs Win Probability</h2>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top:8, right:16, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="x" name="Avg Score" stroke="#64748b"
                    label={{ value:"Avg Score", position:"insideBottom", offset:-4, fill:"#64748b", fontSize:12 }} />
                  <YAxis dataKey="y" name="Win Prob %" unit="%" stroke="#64748b" />
                  <Tooltip cursor={{ strokeDasharray:"3 3" }}
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ background:"#1e293b", border:"1px solid #334155",
                                      color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13 }}>
                          <div>Team {d.team}</div>
                          <div>Avg Score: {d.x}</div>
                          <div>Win Prob: {d.y}%</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="#4f9cf9" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ── Tab 4: Team Overview table ── */}
        {activeTab === 4 && (
          <div style={S.card}>
            <h2 style={S.h2}>All Teams — Summary Table</h2>
            <div style={{ overflowX:"auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["Team","Matches","Avg Score","Min","Max","Win Prob","Sim Avg","P25–P75","Avg Tips","Park Rate","Leave Rate"].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamStats.map((t, i) => (
                    <tr key={t.teamNumber}
                      style={{ background: i % 2 === 0 ? "#1e293b" : "#0f172a" }}>
                      <td style={{ ...S.td, color:"#4f9cf9", fontWeight:600 }}>
                        {t.teamNumber}{t.usingSimulation ? " ★" : ""}
                      </td>
                      <td style={S.td}>{t.matchCount}</td>
                      <td style={S.td}>{t.avgScore.toFixed(1)}</td>
                      <td style={S.td}>{t.minScore}</td>
                      <td style={S.td}>{t.maxScore}</td>
                      <td style={{ ...S.td, color: t.winProb > 0.6 ? "#22c55e" : t.winProb > 0.4 ? "#eab308" : "#ef4444" }}>
                        {Math.round(t.winProb * 100)}%
                      </td>
                      <td style={{ ...S.td, color:"#94a3b8" }}>
                        {t.simAvg !== undefined ? t.simAvg.toFixed(1) : "—"}
                      </td>
                      <td style={{ ...S.td, color:"#94a3b8" }}>
                        {t.p25 !== undefined && t.p75 !== undefined
                          ? `${t.p25.toFixed(0)}–${t.p75.toFixed(0)}`
                          : "—"}
                      </td>
                      <td style={S.td}>{t.avgTips.toFixed(1)}</td>
                      <td style={S.td}>{Math.round(t.parkRate * 100)}%</td>
                      <td style={S.td}>{Math.round(t.leaveRate * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:11, color:"#475569", marginTop:12 }}>
              ★ = Monte Carlo simulation data available &nbsp;·&nbsp; Win Prob sorted descending
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
