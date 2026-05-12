import { useState, useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ── Simulated SQL Database ──────────────────────────────────────────────────
const DB = {
  programs: [
    { id: "P001", name: "LYNX C2 System", contract: "FA8650-24-C-1001", type: "CPFF", period_end: "2026-12-31" },
    { id: "P002", name: "SHORAD Integration", contract: "W911QY-25-C-0042", type: "FFP", period_end: "2027-06-30" },
    { id: "P003", name: "TITAN Vehicle Suite", contract: "N00024-24-C-5510", type: "T&M", period_end: "2026-09-30" },
  ],
  cost_elements: ["Direct Labor", "Fringe", "Overhead", "ODC", "Travel", "Subcontract", "G&A"],
  budgets: {
    P001: { "Direct Labor": 1240000, Fringe: 384400, Overhead: 558000, ODC: 125000, Travel: 48000, Subcontract: 620000, "G&A": 197800 },
    P002: { "Direct Labor": 880000, Fringe: 272800, Overhead: 396000, ODC: 72000, Travel: 22000, Subcontract: 310000, "G&A": 132400 },
    P003: { "Direct Labor": 560000, Fringe: 173600, Overhead: 252000, ODC: 38000, Travel: 15000, Subcontract: 180000, "G&A": 88200 },
  },
  actuals: {
    P001: { "Direct Labor": 1318200, Fringe: 408642, Overhead: 527100, ODC: 113400, Travel: 51200, Subcontract: 589000, "G&A": 209800 },
    P002: { "Direct Labor": 796400, Fringe: 246884, Overhead: 358380, ODC: 80150, Travel: 19800, Subcontract: 334000, "G&A": 119600 },
    P003: { "Direct Labor": 498200, Fringe: 154442, Overhead: 224190, ODC: 41200, Travel: 12400, Subcontract: 162000, "G&A": 79100 },
  },
  monthly_burn: {
    P001: [
      { month: "Jan", budget: 294583, actual: 268200 },
      { month: "Feb", budget: 294583, actual: 301400 },
      { month: "Mar", budget: 294583, actual: 287600 },
      { month: "Apr", budget: 294583, actual: 322100 },
      { month: "May", budget: 294583, actual: 341042 },
    ],
    P002: [
      { month: "Jan", budget: 173533, actual: 158200 },
      { month: "Feb", budget: 173533, actual: 181400 },
      { month: "Mar", budget: 173533, actual: 167800 },
      { month: "Apr", budget: 173533, actual: 192600 },
      { month: "May", budget: 173533, actual: 255214 },
    ],
    P003: [
      { month: "Jan", budget: 140983, actual: 128400 },
      { month: "Feb", budget: 140983, actual: 134200 },
      { month: "Mar", budget: 140983, actual: 119800 },
      { month: "Apr", budget: 140983, actual: 155932 },
      { month: "May", budget: 140983, actual: 133200 },
    ],
  },
};

// ── SQL Query Simulator ──────────────────────────────────────────────────────
const QUERIES = {
  variance: (pid) => `SELECT
  ce.element,
  b.budgeted,
  a.actual,
  (a.actual - b.budgeted) AS variance,
  ROUND((a.actual - b.budgeted) / b.budgeted * 100, 2) AS var_pct
FROM cost_elements ce
JOIN budgets b ON b.program_id = '${pid}'
JOIN actuals a ON a.program_id = '${pid}'
WHERE ce.element = b.element
ORDER BY ABS(var_pct) DESC;`,

  burnrate: (pid) => `SELECT
  m.month,
  m.budget_plan,
  m.actual_cost,
  SUM(m.actual_cost) OVER (
    ORDER BY m.month_num
  ) AS cumulative_actual,
  SUM(m.budget_plan) OVER (
    ORDER BY m.month_num
  ) AS cumulative_budget
FROM monthly_burn m
WHERE m.program_id = '${pid}'
ORDER BY m.month_num;`,

  summary: () => `SELECT
  p.program_id,
  p.name,
  SUM(b.budgeted) AS total_budget,
  SUM(a.actual)   AS total_actual,
  SUM(a.actual - b.budgeted) AS total_variance,
  ROUND(SUM(a.actual)/SUM(b.budgeted)*100,1) AS pct_spent
FROM programs p
JOIN budgets b USING (program_id)
JOIN actuals a USING (program_id)
GROUP BY p.program_id
ORDER BY total_variance DESC;`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (a, b) => (((a - b) / b) * 100).toFixed(1);

const varColor = (v) => {
  if (Math.abs(v) < 3) return "#4ade80";
  if (v > 0) return "#f87171";
  return "#facc15";
};

// ── Components ───────────────────────────────────────────────────────────────

function SqlPanel({ query }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={styles.sqlPanel}>
      <div style={styles.sqlHeader}>
        <span style={styles.sqlLabel}>▶ ACTIVE QUERY</span>
        <button onClick={copy} style={styles.copyBtn}>{copied ? "COPIED" : "COPY"}</button>
      </div>
      <pre style={styles.sqlCode}>{query}</pre>
    </div>
  );
}

function ProgramCard({ prog, selected, onClick }) {
  const budget = Object.values(DB.budgets[prog.id]).reduce((a, b) => a + b, 0);
  const actual = Object.values(DB.actuals[prog.id]).reduce((a, b) => a + b, 0);
  const variance = actual - budget;
  const spent = ((actual / budget) * 100).toFixed(0);

  return (
    <div onClick={onClick} style={{ ...styles.card, ...(selected ? styles.cardSelected : {}) }}>
      <div style={styles.cardId}>{prog.id} · {prog.type}</div>
      <div style={styles.cardName}>{prog.name}</div>
      <div style={styles.cardMeta}>{prog.contract}</div>
      <div style={styles.burnBar}>
        <div style={{ ...styles.burnFill, width: `${Math.min(spent, 100)}%`, background: spent > 100 ? "#f87171" : spent > 90 ? "#facc15" : "#4ade80" }} />
      </div>
      <div style={styles.cardFooter}>
        <span style={{ color: "#94a3b8" }}>{spent}% spent</span>
        <span style={{ color: variance > 0 ? "#f87171" : "#4ade80" }}>
          {variance > 0 ? "▲" : "▼"} {fmt(Math.abs(variance))}
        </span>
      </div>
    </div>
  );
}

function VarianceTable({ pid, onQuery }) {
  const rows = DB.cost_elements.map((el) => {
    const b = DB.budgets[pid][el];
    const a = DB.actuals[pid][el];
    const v = a - b;
    const vp = parseFloat(pct(a, b));
    return { el, b, a, v, vp };
  });

  useState(() => onQuery(QUERIES.variance(pid)), [pid]);

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {["Cost Element", "Budget", "Actual", "Variance", "Var %", "Status"].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ el, b, a, v, vp }) => (
            <tr key={el} style={styles.tr}>
              <td style={styles.td}>{el}</td>
              <td style={{ ...styles.td, color: "#94a3b8" }}>{fmt(b)}</td>
              <td style={styles.td}>{fmt(a)}</td>
              <td style={{ ...styles.td, color: v > 0 ? "#f87171" : "#4ade80" }}>
                {v > 0 ? "+" : ""}{fmt(v)}
              </td>
              <td style={{ ...styles.td, color: varColor(vp), fontFamily: "monospace" }}>
                {vp > 0 ? "+" : ""}{vp}%
              </td>
              <td style={styles.td}>
                <span style={{ ...styles.badge, background: Math.abs(vp) < 3 ? "#14532d" : vp > 0 ? "#7f1d1d" : "#713f12" }}>
                  {Math.abs(vp) < 3 ? "ON TRACK" : vp > 0 ? "OVER" : "UNDER"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BurnChart({ pid, onQuery }) {
  const data = DB.monthly_burn[pid];
  useMemo(() => onQuery(QUERIES.burnrate(pid)), [pid]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={styles.tooltip}>
        <div style={{ color: "#e2e8f0", fontFamily: "monospace", marginBottom: 4 }}>{label}</div>
        {payload.map((p) => (
          <div key={p.name} style={{ color: p.color, fontFamily: "monospace", fontSize: 12 }}>
            {p.name}: {fmt(p.value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#64748b", fontFamily: "monospace", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontFamily: "monospace", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="budget" name="Budget" fill="#1e3a5f" radius={[2, 2, 0, 0]} />
        <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SummaryTable({ onQuery }) {
  useMemo(() => onQuery(QUERIES.summary()), []);
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {["Program", "Contract", "Type", "Budget", "Actual", "Variance", "% Spent"].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DB.programs.map((p) => {
            const budget = Object.values(DB.budgets[p.id]).reduce((a, b) => a + b, 0);
            const actual = Object.values(DB.actuals[p.id]).reduce((a, b) => a + b, 0);
            const v = actual - budget;
            const sp = ((actual / budget) * 100).toFixed(1);
            return (
              <tr key={p.id} style={styles.tr}>
                <td style={styles.td}><span style={{ color: "#60a5fa" }}>{p.id}</span> {p.name}</td>
                <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{p.contract}</td>
                <td style={styles.td}><span style={styles.typeBadge}>{p.type}</span></td>
                <td style={{ ...styles.td, color: "#94a3b8" }}>{fmt(budget)}</td>
                <td style={styles.td}>{fmt(actual)}</td>
                <td style={{ ...styles.td, color: v > 0 ? "#f87171" : "#4ade80" }}>{v > 0 ? "+" : ""}{fmt(v)}</td>
                <td style={{ ...styles.td, fontFamily: "monospace", color: sp > 100 ? "#f87171" : sp > 90 ? "#facc15" : "#4ade80" }}>{sp}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [selected, setSelected] = useState("P001");
  const [view, setView] = useState("detail"); // "detail" | "summary"
  const [activeQuery, setActiveQuery] = useState(QUERIES.variance("P001"));

  const prog = DB.programs.find((p) => p.id === selected);

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerEyebrow}>LEONARDO DRS · LAND ELECTRONICS</div>
          <div style={styles.headerTitle}>Program Finance Tracker</div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.headerMeta}>FY2026 · Period 5 of 12</div>
          <div style={styles.headerMeta} onClick={() => setView(view === "detail" ? "summary" : "detail")} role="button" style={{ ...styles.headerMeta, cursor: "pointer", color: "#60a5fa", userSelect: "none" }}>
            {view === "detail" ? "→ PORTFOLIO VIEW" : "→ PROGRAM VIEW"}
          </div>
        </div>
      </div>

      {view === "summary" ? (
        <div style={styles.body}>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>PORTFOLIO SUMMARY</div>
            <SummaryTable onQuery={setActiveQuery} />
          </div>
          <SqlPanel query={activeQuery} />
        </div>
      ) : (
        <div style={styles.body}>
          {/* Program selector */}
          <div style={styles.cardRow}>
            {DB.programs.map((p) => (
              <ProgramCard
                key={p.id}
                prog={p}
                selected={selected === p.id}
                onClick={() => { setSelected(p.id); setActiveQuery(QUERIES.variance(p.id)); }}
              />
            ))}
          </div>

          <div style={styles.twoCol}>
            {/* Left: variance table */}
            <div style={{ flex: 1.6 }}>
              <div style={styles.sectionTitle}>COST ELEMENT VARIANCE ANALYSIS</div>
              <VarianceTable pid={selected} onQuery={setActiveQuery} />
            </div>

            {/* Right: burn chart */}
            <div style={{ flex: 1 }}>
              <div style={styles.sectionTitle}>MONTHLY BURN RATE</div>
              <div style={{ marginBottom: 6, color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>
                ■ BUDGET &nbsp; ■ ACTUAL (USD)
              </div>
              <BurnChart pid={selected} onQuery={setActiveQuery} />
            </div>
          </div>

          <SqlPanel query={activeQuery} />
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    background: "#020c18",
    minHeight: "100vh",
    color: "#e2e8f0",
    fontFamily: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
    fontSize: 13,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: "20px 28px 16px",
    borderBottom: "1px solid #0f2744",
    background: "linear-gradient(180deg, #020c18 0%, #041529 100%)",
  },
  headerEyebrow: {
    fontSize: 10,
    letterSpacing: "0.2em",
    color: "#3b82f6",
    fontFamily: "monospace",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: "#f1f5f9",
  },
  headerRight: { textAlign: "right" },
  headerMeta: { fontSize: 11, color: "#475569", fontFamily: "monospace" },
  body: { padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 },
  cardRow: { display: "flex", gap: 12 },
  card: {
    flex: 1,
    background: "#041529",
    border: "1px solid #0f2744",
    borderRadius: 4,
    padding: "14px 16px",
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  cardSelected: { border: "1px solid #3b82f6", background: "#051e38" },
  cardId: { fontSize: 10, fontFamily: "monospace", color: "#3b82f6", marginBottom: 4, letterSpacing: "0.1em" },
  cardName: { fontSize: 13, fontWeight: 600, color: "#f1f5f9", marginBottom: 2 },
  cardMeta: { fontSize: 10, color: "#475569", fontFamily: "monospace", marginBottom: 10 },
  burnBar: { height: 3, background: "#0f2744", borderRadius: 2, marginBottom: 8, overflow: "hidden" },
  burnFill: { height: "100%", borderRadius: 2, transition: "width 0.3s" },
  cardFooter: { display: "flex", justifyContent: "space-between", fontSize: 11 },
  twoCol: { display: "flex", gap: 24, alignItems: "flex-start" },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: "0.18em",
    color: "#475569",
    fontFamily: "monospace",
    marginBottom: 10,
  },
  section: {},
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: 10,
    letterSpacing: "0.12em",
    color: "#475569",
    fontFamily: "monospace",
    borderBottom: "1px solid #0f2744",
    whiteSpace: "nowrap",
  },
  td: { padding: "9px 12px", borderBottom: "1px solid #070f1c", fontSize: 12, whiteSpace: "nowrap" },
  tr: { transition: "background 0.1s", ":hover": { background: "#041529" } },
  badge: {
    display: "inline-block",
    padding: "2px 7px",
    borderRadius: 2,
    fontSize: 10,
    fontFamily: "monospace",
    letterSpacing: "0.08em",
    color: "#e2e8f0",
  },
  typeBadge: {
    display: "inline-block",
    padding: "2px 6px",
    background: "#0f2744",
    borderRadius: 2,
    fontSize: 10,
    fontFamily: "monospace",
    color: "#60a5fa",
  },
  sqlPanel: {
    background: "#020c18",
    border: "1px solid #0f2744",
    borderLeft: "3px solid #3b82f6",
    borderRadius: 4,
    overflow: "hidden",
  },
  sqlHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "7px 14px",
    background: "#041529",
    borderBottom: "1px solid #0f2744",
  },
  sqlLabel: { fontSize: 10, fontFamily: "monospace", color: "#3b82f6", letterSpacing: "0.15em" },
  copyBtn: {
    fontSize: 10,
    fontFamily: "monospace",
    background: "transparent",
    border: "1px solid #1e3a5f",
    color: "#64748b",
    padding: "2px 8px",
    cursor: "pointer",
    borderRadius: 2,
    letterSpacing: "0.1em",
  },
  sqlCode: {
    margin: 0,
    padding: "12px 14px",
    fontSize: 11,
    fontFamily: "monospace",
    color: "#7dd3fc",
    lineHeight: 1.7,
    overflowX: "auto",
  },
  tooltip: {
    background: "#041529",
    border: "1px solid #0f2744",
    borderRadius: 4,
    padding: "8px 12px",
    fontSize: 12,
  },
};
