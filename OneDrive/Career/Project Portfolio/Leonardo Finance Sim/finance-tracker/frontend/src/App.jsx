import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API = "http://localhost:8000";

// ── SQL Query Simulator ──────────────────────────────────────────────────────
const QUERIES = {
  variance: (pid) => `SELECT
  b.cost_element,
  b.amount          AS budget,
  a.amount          AS actual,
  (a.amount - b.amount)                          AS variance,
  ROUND((a.amount - b.amount) / b.amount * 100, 2) AS var_pct
FROM budgets b
JOIN actuals a ON a.program_id = b.program_id
              AND a.cost_element = b.cost_element
WHERE b.program_id = '${pid}'
ORDER BY ABS(var_pct) DESC;`,

  burnrate: (pid) => `SELECT
  m.month,
  m.budget,
  m.actual,
  SUM(m.actual) OVER (ORDER BY m.month_num) AS cumulative_actual,
  SUM(m.budget) OVER (ORDER BY m.month_num) AS cumulative_budget
FROM monthly_burn m
WHERE m.program_id = '${pid}'
ORDER BY m.month_num;`,

  summary: () => `SELECT
  p.id            AS program_id,
  p.name,
  SUM(b.amount)   AS total_budget,
  SUM(a.amount)   AS total_actual,
  SUM(a.amount - b.amount)                        AS variance,
  ROUND(SUM(a.amount) / SUM(b.amount) * 100, 1)  AS pct_spent
FROM programs p
JOIN budgets b ON b.program_id = p.id
JOIN actuals a ON a.program_id = p.id AND a.cost_element = b.cost_element
GROUP BY p.id
ORDER BY variance DESC;`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const varColor = (v) => {
  if (Math.abs(v) < 3) return "#4a4a00";
  if (v > 0) return "#8b2000";
  return "#2a5a00";
};

const SESSION_TS = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

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
        <span style={styles.sqlLabel}>$ QUERY_EXEC &gt;&gt;</span>
        <button onClick={copy} style={styles.copyBtn}>{copied ? "[COPIED]" : "[COPY]"}</button>
      </div>
      <pre style={styles.sqlCode}>{query}<span className="sql-cursor">█</span></pre>
    </div>
  );
}

function ProgramCard({ prog, summary, selected, onClick }) {
  const budget = summary?.total_budget ?? 0;
  const actual = summary?.total_actual ?? 0;
  const variance = summary?.variance ?? 0;
  const spent = budget > 0 ? ((actual / budget) * 100).toFixed(0) : "0";
  const spentNum = Number(spent);

  const BAR_BLOCKS = 20;
  const filledBlocks = Math.round(Math.min(spentNum, 100) / 100 * BAR_BLOCKS);
  const blockColor = spentNum > 100 ? "#8b2000" : spentNum > 90 ? "#6b5000" : "#2a5a00";

  return (
    <div onClick={onClick} style={{ ...styles.card, ...(selected ? styles.cardSelected : {}) }}>
      <div style={styles.cardId}>{prog.id} / {prog.type}</div>
      <div style={styles.cardName}>{prog.name}</div>
      <div style={styles.cardMeta}>{prog.contract}</div>
      <div style={styles.burnBarWrap}>
        {Array.from({ length: BAR_BLOCKS }, (_, i) => (
          <div key={i} style={{ ...styles.burnBlock, background: i < filledBlocks ? blockColor : "#1a1a00" }} />
        ))}
      </div>
      <div style={styles.cardFooter}>
        <span style={{ color: "#6b6000", fontFamily: "'Courier New', monospace", fontSize: 10 }}>{spent}% SPENT</span>
        <span style={{ color: variance > 0 ? "#8b2000" : "#2a5a00", fontFamily: "'Courier New', monospace", fontSize: 10 }}>
          {variance > 0 ? "[+]" : "[-]"} {fmt(Math.abs(variance))}
        </span>
      </div>
    </div>
  );
}

function VarianceTable({ pid, progName, onQuery }) {
  const [rows, setRows] = useState([]);
  const [cpi, setCpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState({ open: false, element: "", amount: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    onQuery(QUERIES.variance(pid));

    Promise.all([
      fetch(`${API}/programs/${pid}/variance`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
      fetch(`${API}/programs/${pid}/eac`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
    ])
      .then(([varData, eacData]) => {
        setRows(varData.rows);
        setCpi(eacData.cpi);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [pid, refreshKey]);

  const openModal = (row) =>
    setModal({ open: true, element: row.cost_element, amount: String(row.actual) });
  const closeModal = () => setModal({ open: false, element: "", amount: "" });

  const handleSave = () => {
    const amount = parseFloat(modal.amount);
    if (isNaN(amount)) return;
    setSaving(true);
    fetch(`${API}/actuals/${pid}/${encodeURIComponent(modal.element)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    })
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(() => { setSaving(false); closeModal(); setRefreshKey((k) => k + 1); })
      .catch((e) => { setSaving(false); setError(e.message); });
  };

  const exportCsv = () => {
    const today = new Date().toISOString().split("T")[0];
    const meta = `Program,${pid}\nReport Date,${today}\n\n`;
    const header = "Cost Element,Budget,Actual,Variance,Variance %,EAC,Status\n";
    const body = rows.map((row) => {
      const { cost_element, budget, actual, variance, variance_pct } = row;
      const eac = cpi > 0 ? (budget / cpi).toFixed(2) : actual.toFixed(2);
      const status = Math.abs(variance_pct) < 3 ? "ON TRACK" : variance_pct > 0 ? "OVER" : "UNDER";
      return `"${cost_element}",${budget},${actual},${variance},${variance_pct},${eac},${status}`;
    }).join("\n");
    const blob = new Blob([meta + header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = (progName || pid).replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "");
    a.download = `${pid}-${slug}-variance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={styles.loadingText}>// RETRIEVING VARIANCE DATA...</div>;
  if (error) return <div style={styles.errorText}>// ERROR: {error}</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={exportCsv} style={styles.csvBtn}>[↓ EXPORT CSV]</button>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["COST ELEMENT", "BUDGET", "ACTUAL", "VARIANCE", "VAR %", "EAC", "STATUS", ""].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { cost_element: el, budget: b, actual: a, variance: v, variance_pct: vp } = row;
              const eac = cpi && cpi > 0 ? b / cpi : a;
              const statusLabel = Math.abs(vp) < 3 ? "[OK]" : vp > 0 ? "[OVER]" : "[UNDER]";
              const statusColor = Math.abs(vp) < 3 ? "#4a4a00" : vp > 0 ? "#8b2000" : "#2a5a00";
              return (
                <tr key={el} className="fin-row" style={styles.tr}>
                  <td style={styles.td}>{el}</td>
                  <td style={{ ...styles.td, ...styles.tdNum, color: "#6b6000" }}>{fmt(b)}</td>
                  <td style={{ ...styles.td, ...styles.tdNum }}>{fmt(a)}</td>
                  <td style={{ ...styles.td, ...styles.tdNum, color: v > 0 ? "#8b2000" : "#2a5a00" }}>
                    {v > 0 ? "+" : ""}{fmt(v)}
                  </td>
                  <td style={{ ...styles.td, ...styles.tdNum, color: varColor(vp) }}>
                    {vp > 0 ? "+" : ""}{vp}%
                  </td>
                  <td style={{ ...styles.td, ...styles.tdNum, color: "#6b6000" }}>
                    {fmt(eac)}
                  </td>
                  <td style={{ ...styles.td, color: statusColor, letterSpacing: "0.08em" }}>
                    {statusLabel}
                  </td>
                  <td style={styles.td}>
                    <button onClick={() => openModal(row)} style={styles.editBtn}>[EDIT]</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <div style={styles.overlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalTitle}>// UPDATE ACTUAL · {pid}</div>
            <div>
              <div style={styles.modalLabel}>COST ELEMENT</div>
              <div style={{ ...styles.input, color: "#e8d000", cursor: "default" }}>{modal.element}</div>
            </div>
            <div>
              <div style={styles.modalLabel}>ACTUAL AMOUNT (USD)</div>
              <input
                type="number"
                value={modal.amount}
                onChange={(e) => setModal((m) => ({ ...m, amount: e.target.value }))}
                style={styles.input}
                autoFocus
              />
            </div>
            <div style={styles.btnRow}>
              <button onClick={closeModal} style={styles.btnSecondary} disabled={saving}>[CANCEL]</button>
              <button onClick={handleSave} style={styles.btnPrimary} disabled={saving}>
                {saving ? "[WRITING...]" : "[CONFIRM]"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BurnChart({ pid, onQuery }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    onQuery(QUERIES.burnrate(pid));

    fetch(`${API}/programs/${pid}/burn`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d) => { setData(d.months); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [pid]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={styles.tooltip}>
        <div style={{ color: "#c8b400", fontFamily: "'Courier New', monospace", marginBottom: 4, fontSize: 11 }}>{label}</div>
        {payload.map((p) => (
          <div key={p.name} style={{ color: p.color, fontFamily: "'Courier New', monospace", fontSize: 11 }}>
            {p.name.toUpperCase()}: {fmt(p.value)}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div style={{ ...styles.loadingText, height: 220, display: "flex", alignItems: "center" }}>// RETRIEVING BURN DATA...</div>;
  if (error) return <div style={styles.errorText}>// ERROR: {error}</div>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={2}>
        <CartesianGrid strokeDasharray="2 4" stroke="#1a1a00" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#6b6000", fontFamily: "'Courier New', monospace", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6b6000", fontFamily: "'Courier New', monospace", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(200,180,0,0.03)" }} />
        <Bar dataKey="budget" name="Budget" fill="#2a2a00" radius={0} />
        <Bar dataKey="actual" name="Actual" fill="#c8b400" radius={0} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SummaryTable({ rows, loading, error, onQuery }) {
  useEffect(() => { onQuery(QUERIES.summary()); }, []);

  if (loading) return <div style={styles.loadingText}>// RETRIEVING PORTFOLIO DATA...</div>;
  if (error) return <div style={styles.errorText}>// ERROR: {error}</div>;

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {["PROGRAM", "CONTRACT", "TYPE", "BUDGET", "ACTUAL", "VARIANCE", "% SPENT"].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { program_id, name, contract, type, total_budget, total_actual, variance: v, pct_spent: sp } = row;
            const spNum = Number(sp);
            return (
              <tr key={program_id} className="fin-row" style={styles.tr}>
                <td style={styles.td}>
                  <span style={{ color: "#e8d000" }}>{program_id}</span>
                  <span style={{ color: "#6b6000" }}> / </span>
                  {name}
                </td>
                <td style={{ ...styles.td, color: "#6b6000", fontSize: 10 }}>{contract}</td>
                <td style={styles.td}><span style={styles.typeBadge}>[{type}]</span></td>
                <td style={{ ...styles.td, ...styles.tdNum, color: "#6b6000" }}>{fmt(total_budget)}</td>
                <td style={{ ...styles.td, ...styles.tdNum }}>{fmt(total_actual)}</td>
                <td style={{ ...styles.td, ...styles.tdNum, color: v > 0 ? "#8b2000" : "#2a5a00" }}>
                  {v > 0 ? "+" : ""}{fmt(v)}
                </td>
                <td style={{ ...styles.td, ...styles.tdNum, color: spNum > 100 ? "#8b2000" : spNum > 90 ? "#6b5000" : "#2a5a00" }}>
                  {sp}%
                </td>
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
  const [programs, setPrograms] = useState([]);
  const [summary, setSummary] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [selected, setSelected] = useState("P001");
  const [view, setView] = useState("detail");
  const [activeQuery, setActiveQuery] = useState(QUERIES.variance("P001"));

  useEffect(() => {
    fetch(`${API}/programs`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data) => { setPrograms(data); setProgramsLoading(false); })
      .catch(() => setProgramsLoading(false));

    fetch(`${API}/summary`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data) => { setSummary(data); setSummaryLoading(false); })
      .catch((e) => { setSummaryError(e.message); setSummaryLoading(false); });
  }, []);

  const summaryMap = Object.fromEntries(summary.map((s) => [s.program_id, s]));

  return (
    <>
      <style>{`
        @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .sql-cursor { animation: blink 1.1s step-end infinite; color: #c8b400; }
        .fin-row:hover > td { background: rgba(200,180,0,0.035) !important; }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div style={styles.root}>
        {/* Classification banner */}
        <div style={styles.classBar}>
          UNCLASSIFIED // FOR OFFICIAL USE ONLY // NOT FOR PUBLIC RELEASE
        </div>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.headerEyebrow}>LEONARDO DRS · LAND ELECTRONICS · DEFENSE FINANCE SYSTEM</div>
            <div style={styles.headerTitle}>PROGRAM COST ANALYSIS TERMINAL</div>
            <div style={styles.headerSub}>SESSION OPENED: {SESSION_TS} · FY2026 · PERIOD 05 OF 12</div>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.headerMeta}>OPERATOR: [CLASSIFIED]</div>
            <div
              role="button"
              onClick={() => setView(view === "detail" ? "summary" : "detail")}
              style={{ ...styles.headerMeta, cursor: "pointer", color: "#e8d000", userSelect: "none", marginTop: 6 }}
            >
              {view === "detail" ? "[→ PORTFOLIO VIEW]" : "[→ PROGRAM VIEW]"}
            </div>
          </div>
        </div>

        {view === "summary" ? (
          <div style={styles.body}>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>// PORTFOLIO SUMMARY</div>
              <SummaryTable
                rows={summary}
                loading={summaryLoading}
                error={summaryError}
                onQuery={setActiveQuery}
              />
            </div>
            <SqlPanel query={activeQuery} />
          </div>
        ) : (
          <div style={styles.body}>
            {/* Program selector */}
            <div style={styles.cardRow}>
              {programsLoading
                ? <div style={styles.loadingText}>// LOADING PROGRAMS...</div>
                : programs.map((p) => (
                  <ProgramCard
                    key={p.id}
                    prog={p}
                    summary={summaryMap[p.id]}
                    selected={selected === p.id}
                    onClick={() => { setSelected(p.id); setActiveQuery(QUERIES.variance(p.id)); }}
                  />
                ))
              }
            </div>

            <div style={styles.twoCol}>
              {/* Left: variance table */}
              <div style={{ flex: 1.6 }}>
                <div style={styles.sectionTitle}>// COST ELEMENT VARIANCE ANALYSIS</div>
                <VarianceTable pid={selected} progName={programs.find((p) => p.id === selected)?.name} onQuery={setActiveQuery} />
              </div>

              {/* Right: burn chart */}
              <div style={{ flex: 1 }}>
                <div style={styles.sectionTitle}>// MONTHLY BURN RATE</div>
                <div style={{ marginBottom: 8, color: "#4a4a00", fontSize: 10, fontFamily: "'Courier New', monospace", letterSpacing: "0.1em" }}>
                  ■ BUDGET &nbsp;&nbsp; ■ ACTUAL (USD)
                </div>
                <BurnChart pid={selected} onQuery={setActiveQuery} />
              </div>
            </div>

            <SqlPanel query={activeQuery} />
          </div>
        )}

        {/* Footer classification banner */}
        <div style={{ ...styles.classBar, borderTop: "1px solid #2a2a00", borderBottom: "none", marginTop: 8 }}>
          UNCLASSIFIED // FOR OFFICIAL USE ONLY // NOT FOR PUBLIC RELEASE
        </div>
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px), #0a0a00",
    minHeight: "100vh",
    color: "#c8b400",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 12,
  },
  classBar: {
    background: "#0a0a00",
    borderBottom: "1px solid #2a2a00",
    padding: "3px 28px",
    fontSize: 9,
    fontFamily: "'Courier New', Courier, monospace",
    color: "#4a4a00",
    letterSpacing: "0.25em",
    textAlign: "center",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "18px 28px 14px",
    borderBottom: "1px solid #2a2a00",
    background: "#0a0a00",
  },
  headerEyebrow: {
    fontSize: 9,
    letterSpacing: "0.3em",
    color: "#6b6000",
    fontFamily: "'Courier New', Courier, monospace",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: "0.25em",
    color: "#e8d000",
    fontFamily: "'Courier New', Courier, monospace",
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 9,
    letterSpacing: "0.15em",
    color: "#4a4a00",
    fontFamily: "'Courier New', Courier, monospace",
  },
  headerRight: { textAlign: "right" },
  headerMeta: { fontSize: 10, color: "#6b6000", fontFamily: "'Courier New', Courier, monospace", letterSpacing: "0.12em" },
  body: { padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 },
  cardRow: { display: "flex", gap: 12 },
  card: {
    flex: 1,
    background: "#0f0f00",
    border: "1px solid #2a2a00",
    borderLeft: "3px solid transparent",
    padding: "14px 16px 14px 14px",
    cursor: "pointer",
    transition: "border-color 0.1s",
  },
  cardSelected: {
    borderLeft: "3px solid #e8d000",
    background: "#141400",
    borderTop: "1px solid #4a4a00",
    borderRight: "1px solid #4a4a00",
    borderBottom: "1px solid #4a4a00",
  },
  cardId: { fontSize: 9, fontFamily: "'Courier New', Courier, monospace", color: "#6b6000", marginBottom: 5, letterSpacing: "0.2em" },
  cardName: { fontSize: 12, fontWeight: "bold", color: "#c8b400", marginBottom: 3, letterSpacing: "0.05em" },
  cardMeta: { fontSize: 9, color: "#4a4a00", fontFamily: "'Courier New', Courier, monospace", marginBottom: 10, letterSpacing: "0.1em" },
  burnBarWrap: { display: "flex", gap: 1, marginBottom: 10 },
  burnBlock: { flex: 1, height: 4 },
  cardFooter: { display: "flex", justifyContent: "space-between" },
  twoCol: { display: "flex", gap: 24, alignItems: "flex-start" },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: "0.28em",
    color: "#6b6000",
    fontFamily: "'Courier New', Courier, monospace",
    marginBottom: 12,
  },
  section: {},
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "7px 12px",
    fontSize: 9,
    letterSpacing: "0.2em",
    color: "#6b6000",
    fontFamily: "'Courier New', Courier, monospace",
    borderBottom: "1px solid #2a2a00",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #0f0f00",
    fontSize: 11,
    whiteSpace: "nowrap",
    fontFamily: "'Courier New', Courier, monospace",
    color: "#c8b400",
  },
  tdNum: { textAlign: "right" },
  tr: {},
  typeBadge: {
    color: "#e8d000",
    fontSize: 10,
    fontFamily: "'Courier New', Courier, monospace",
    letterSpacing: "0.1em",
  },
  sqlPanel: {
    background: "#0a0a00",
    border: "1px solid #2a2a00",
    borderLeft: "3px solid #4a4a00",
  },
  sqlHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 14px",
    background: "#0f0f00",
    borderBottom: "1px solid #2a2a00",
  },
  sqlLabel: { fontSize: 9, fontFamily: "'Courier New', Courier, monospace", color: "#6b6000", letterSpacing: "0.2em" },
  copyBtn: {
    fontSize: 9,
    fontFamily: "'Courier New', Courier, monospace",
    background: "transparent",
    border: "1px solid #2a2a00",
    color: "#6b6000",
    padding: "2px 8px",
    cursor: "pointer",
    letterSpacing: "0.12em",
  },
  sqlCode: {
    margin: 0,
    padding: "12px 14px",
    fontSize: 11,
    fontFamily: "'Courier New', Courier, monospace",
    color: "#c8b400",
    lineHeight: 1.8,
    overflowX: "auto",
  },
  tooltip: {
    background: "#0f0f00",
    border: "1px solid #2a2a00",
    padding: "8px 12px",
    fontSize: 11,
  },
  loadingText: {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 11,
    color: "#4a4a00",
    letterSpacing: "0.12em",
    padding: "20px 0",
  },
  errorText: {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 11,
    color: "#8b2000",
    padding: "20px 0",
    letterSpacing: "0.1em",
  },
  editBtn: {
    background: "transparent",
    border: "1px solid #2a2a00",
    color: "#6b6000",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 9,
    padding: "2px 6px",
    cursor: "pointer",
    letterSpacing: "0.1em",
  },
  csvBtn: {
    background: "transparent",
    border: "1px solid #2a2a00",
    color: "#6b6000",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 9,
    padding: "3px 10px",
    cursor: "pointer",
    letterSpacing: "0.12em",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,10,0,0.92)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  modalBox: {
    background: "#0f0f00",
    border: "1px solid #4a4a00",
    borderLeft: "3px solid #e8d000",
    padding: "24px 28px",
    width: 380,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  modalTitle: {
    fontSize: 10,
    fontFamily: "'Courier New', Courier, monospace",
    letterSpacing: "0.2em",
    color: "#e8d000",
  },
  modalLabel: {
    fontSize: 9,
    fontFamily: "'Courier New', Courier, monospace",
    color: "#6b6000",
    letterSpacing: "0.15em",
    marginBottom: 5,
  },
  input: {
    width: "100%",
    background: "#0a0a00",
    border: "1px solid #2a2a00",
    color: "#c8b400",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 12,
    padding: "7px 10px",
    outline: "none",
  },
  btnRow: { display: "flex", gap: 8, justifyContent: "flex-end" },
  btnPrimary: {
    background: "#1a1a00",
    border: "1px solid #e8d000",
    color: "#e8d000",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 10,
    padding: "6px 16px",
    cursor: "pointer",
    letterSpacing: "0.12em",
  },
  btnSecondary: {
    background: "transparent",
    border: "1px solid #2a2a00",
    color: "#6b6000",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 10,
    padding: "6px 16px",
    cursor: "pointer",
    letterSpacing: "0.12em",
  },
};
