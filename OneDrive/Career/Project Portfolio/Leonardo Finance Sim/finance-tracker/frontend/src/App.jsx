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

function ProgramCard({ prog, summary, selected, onClick }) {
  const budget = summary?.total_budget ?? 0;
  const actual = summary?.total_actual ?? 0;
  const variance = summary?.variance ?? 0;
  const spent = budget > 0 ? ((actual / budget) * 100).toFixed(0) : "0";

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

  if (loading) return <div style={styles.loadingText}>LOADING VARIANCE DATA...</div>;
  if (error) return <div style={styles.errorText}>ERROR: {error}</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={exportCsv} style={styles.csvBtn}>↓ EXPORT CSV</button>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Cost Element", "Budget", "Actual", "Variance", "Var %", "EAC", "Status", ""].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { cost_element: el, budget: b, actual: a, variance: v, variance_pct: vp } = row;
              const eac = cpi && cpi > 0 ? b / cpi : a;
              return (
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
                  <td style={{ ...styles.td, fontFamily: "monospace", color: "#94a3b8" }}>
                    {fmt(eac)}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: Math.abs(vp) < 3 ? "#14532d" : vp > 0 ? "#7f1d1d" : "#713f12" }}>
                      {Math.abs(vp) < 3 ? "ON TRACK" : vp > 0 ? "OVER" : "UNDER"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button onClick={() => openModal(row)} style={styles.editBtn}>EDIT</button>
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
            <div style={styles.modalTitle}>UPDATE ACTUAL · {pid}</div>
            <div>
              <div style={styles.modalLabel}>COST ELEMENT</div>
              <div style={{ ...styles.input, color: "#60a5fa", cursor: "default" }}>{modal.element}</div>
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
              <button onClick={closeModal} style={styles.btnSecondary} disabled={saving}>CANCEL</button>
              <button onClick={handleSave} style={styles.btnPrimary} disabled={saving}>
                {saving ? "SAVING..." : "SAVE"}
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
        <div style={{ color: "#e2e8f0", fontFamily: "monospace", marginBottom: 4 }}>{label}</div>
        {payload.map((p) => (
          <div key={p.name} style={{ color: p.color, fontFamily: "monospace", fontSize: 12 }}>
            {p.name}: {fmt(p.value)}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div style={{ ...styles.loadingText, height: 220, display: "flex", alignItems: "center" }}>LOADING BURN DATA...</div>;
  if (error) return <div style={styles.errorText}>ERROR: {error}</div>;

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

function SummaryTable({ rows, loading, error, onQuery }) {
  useEffect(() => { onQuery(QUERIES.summary()); }, []);

  if (loading) return <div style={styles.loadingText}>LOADING PORTFOLIO DATA...</div>;
  if (error) return <div style={styles.errorText}>ERROR: {error}</div>;

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
          {rows.map((row) => {
            const { program_id, name, contract, type, total_budget, total_actual, variance: v, pct_spent: sp } = row;
            return (
              <tr key={program_id} style={styles.tr}>
                <td style={styles.td}><span style={{ color: "#60a5fa" }}>{program_id}</span> {name}</td>
                <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{contract}</td>
                <td style={styles.td}><span style={styles.typeBadge}>{type}</span></td>
                <td style={{ ...styles.td, color: "#94a3b8" }}>{fmt(total_budget)}</td>
                <td style={styles.td}>{fmt(total_actual)}</td>
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
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerEyebrow}>LEONARDO DRS · LAND ELECTRONICS</div>
          <div style={styles.headerTitle}>Program Finance Tracker</div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.headerMeta}>FY2026 · Period 5 of 12</div>
          <div
            role="button"
            onClick={() => setView(view === "detail" ? "summary" : "detail")}
            style={{ ...styles.headerMeta, cursor: "pointer", color: "#60a5fa", userSelect: "none" }}
          >
            {view === "detail" ? "→ PORTFOLIO VIEW" : "→ PROGRAM VIEW"}
          </div>
        </div>
      </div>

      {view === "summary" ? (
        <div style={styles.body}>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>PORTFOLIO SUMMARY</div>
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
              ? <div style={styles.loadingText}>LOADING PROGRAMS...</div>
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
              <div style={styles.sectionTitle}>COST ELEMENT VARIANCE ANALYSIS</div>
              <VarianceTable pid={selected} progName={programs.find((p) => p.id === selected)?.name} onQuery={setActiveQuery} />
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
  loadingText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#475569",
    letterSpacing: "0.1em",
    padding: "20px 0",
  },
  errorText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#f87171",
    padding: "20px 0",
  },
  editBtn: {
    background: "transparent",
    border: "1px solid #1e3a5f",
    color: "#475569",
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    borderRadius: 2,
    cursor: "pointer",
    letterSpacing: "0.08em",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,12,24,0.88)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  modalBox: {
    background: "#041529",
    border: "1px solid #0f2744",
    borderRadius: 4,
    padding: "24px 28px",
    width: 360,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  modalTitle: {
    fontSize: 10,
    fontFamily: "monospace",
    letterSpacing: "0.18em",
    color: "#3b82f6",
  },
  modalLabel: {
    fontSize: 10,
    fontFamily: "monospace",
    color: "#475569",
    letterSpacing: "0.1em",
    marginBottom: 5,
  },
  input: {
    width: "100%",
    background: "#020c18",
    border: "1px solid #0f2744",
    borderRadius: 3,
    color: "#e2e8f0",
    fontFamily: "monospace",
    fontSize: 13,
    padding: "7px 10px",
    outline: "none",
    boxSizing: "border-box",
  },
  btnRow: { display: "flex", gap: 8, justifyContent: "flex-end" },
  btnPrimary: {
    background: "#3b82f6",
    border: "none",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 11,
    padding: "6px 16px",
    borderRadius: 3,
    cursor: "pointer",
    letterSpacing: "0.08em",
  },
  btnSecondary: {
    background: "transparent",
    border: "1px solid #1e3a5f",
    color: "#64748b",
    fontFamily: "monospace",
    fontSize: 11,
    padding: "6px 16px",
    borderRadius: 3,
    cursor: "pointer",
    letterSpacing: "0.08em",
  },
  csvBtn: {
    background: "transparent",
    border: "1px solid #1e3a5f",
    color: "#3b82f6",
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 10px",
    borderRadius: 2,
    cursor: "pointer",
    letterSpacing: "0.1em",
  },
};
