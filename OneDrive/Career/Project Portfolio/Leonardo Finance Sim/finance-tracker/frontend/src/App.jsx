import { useState, useEffect } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

const API = "http://localhost:8000";
const MONO = "'IBM Plex Mono', 'Courier New', monospace";
const SANS = "'IBM Plex Sans', -apple-system, sans-serif";

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
  m.month, m.budget, m.actual,
  SUM(m.actual) OVER (ORDER BY m.month_num) AS cum_actual,
  SUM(m.budget) OVER (ORDER BY m.month_num) AS cum_budget
FROM monthly_burn m
WHERE m.program_id = '${pid}'
ORDER BY m.month_num;`,

  summary: () => `SELECT
  p.id AS program_id, p.name,
  SUM(b.amount) AS total_budget,
  SUM(a.amount) AS total_actual,
  SUM(a.amount - b.amount) AS variance,
  ROUND(SUM(a.amount) / SUM(b.amount) * 100, 1) AS pct_spent
FROM programs p
JOIN budgets b ON b.program_id = p.id
JOIN actuals a ON a.program_id = p.id AND a.cost_element = b.cost_element
GROUP BY p.id
ORDER BY variance DESC;`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

const varColor = (v) => {
  if (Math.abs(v) < 3) return C.textMuted;
  if (v > 0) return C.red;
  return C.green;
};

const C = {
  bg:          "#0d1117",
  surface:     "#161b22",
  surfaceHigh: "#21262d",
  border:      "#30363d",
  borderActive:"#388bfd",
  text:        "#e6edf3",
  textMuted:   "#8b949e",
  textDim:     "#484f58",
  blue:        "#388bfd",
  green:       "#3fb950",
  red:         "#f85149",
  yellow:      "#d29922",
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={styles.sqlDot} />
          <span style={styles.sqlLabel}>ACTIVE QUERY</span>
        </div>
        <button onClick={copy} style={styles.copyBtn}>{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <pre style={styles.sqlCode}>{query}</pre>
    </div>
  );
}

function KpiBar({ summary, eacData }) {
  const budget = summary?.total_budget ?? 0;
  const actual = summary?.total_actual ?? 0;
  const cpi = eacData?.cpi;
  const eac = eacData?.eac;
  const vac = eacData?.vac;
  const pct = summary?.pct_spent ?? 0;

  const tiles = [
    { label: "Total Budget",         value: fmtShort(budget),          sub: "BAC",   color: C.text },
    { label: "Actual Cost",          value: fmtShort(actual),          sub: "ACWP",  color: pct > 100 ? C.red : C.text },
    { label: "Cost Performance",     value: cpi ? cpi.toFixed(3) : "—", sub: "CPI", color: !cpi ? C.textMuted : cpi >= 1 ? C.green : C.red },
    { label: "Est. at Completion",   value: eac ? fmtShort(eac) : "—", sub: "EAC",  color: C.text },
    { label: "Variance at Compl.",   value: vac ? fmtShort(vac) : "—", sub: "VAC",  color: !vac ? C.textMuted : vac >= 0 ? C.green : C.red },
  ];

  return (
    <div style={styles.kpiBar}>
      {tiles.map((t, i) => (
        <div key={t.sub} style={{ ...styles.kpiTile, borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}>
          <div style={styles.kpiLabel}>{t.label}</div>
          <div style={{ ...styles.kpiValue, color: t.color }}>{t.value}</div>
          <div style={styles.kpiSub}>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function ProgramCard({ prog, summary, selected, onClick }) {
  const budget = summary?.total_budget ?? 0;
  const actual = summary?.total_actual ?? 0;
  const variance = summary?.variance ?? 0;
  const pct = budget > 0 ? (actual / budget) * 100 : 0;
  const pctDisplay = pct.toFixed(0);
  const barColor = pct > 100 ? C.red : pct > 90 ? C.yellow : C.green;
  const isOver = variance > 0;

  return (
    <div
      onClick={onClick}
      style={{ ...styles.card, ...(selected ? styles.cardSelected : {}) }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={styles.cardId}>{prog.id}</div>
        <span style={{ ...styles.pill, background: isOver ? "rgba(248,81,73,0.15)" : "rgba(63,185,80,0.15)", color: isOver ? C.red : C.green }}>
          {isOver ? "▲ OVER" : "▼ UNDER"}
        </span>
      </div>
      <div style={styles.cardName}>{prog.name}</div>
      <div style={styles.cardMeta}>{prog.contract} · {prog.type}</div>
      <div style={styles.burnTrack}>
        <div style={{ ...styles.burnFill, width: `${Math.min(pct, 100)}%`, background: barColor }} />
      </div>
      <div style={styles.cardFooter}>
        <span style={{ color: C.textMuted, fontFamily: MONO, fontSize: 11 }}>{pctDisplay}% spent</span>
        <span style={{ color: isOver ? C.red : C.green, fontFamily: MONO, fontSize: 11 }}>
          {isOver ? "+" : ""}{fmtShort(variance)}
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
      .then(([varData, eacData]) => { setRows(varData.rows); setCpi(eacData.cpi); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [pid, refreshKey]);

  const openModal = (row) => setModal({ open: true, element: row.cost_element, amount: String(row.actual) });
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

  if (loading) return <div style={styles.stateText}>Loading variance data…</div>;
  if (error) return <div style={{ ...styles.stateText, color: C.red }}>Error: {error}</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button onClick={exportCsv} style={styles.btnOutline}>↓ Export CSV</button>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Cost Element", "Budget", "Actual", "Variance", "Var %", "EAC", "Status", ""].map((h) => (
                <th key={h} style={{ ...styles.th, textAlign: h === "Cost Element" || h === "" ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const { cost_element: el, budget: b, actual: a, variance: v, variance_pct: vp } = row;
              const eac = cpi && cpi > 0 ? b / cpi : a;
              const over = vp > 3;
              const under = vp < -3;
              return (
                <tr key={el} className="fin-row" style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.016)" }}>
                  <td style={styles.td}>{el}</td>
                  <td style={{ ...styles.td, ...styles.tdR, color: C.textMuted }}>{fmt(b)}</td>
                  <td style={{ ...styles.td, ...styles.tdR }}>{fmt(a)}</td>
                  <td style={{ ...styles.td, ...styles.tdR, color: v > 0 ? C.red : C.green, fontFamily: MONO }}>
                    {v > 0 ? "+" : ""}{fmt(v)}
                  </td>
                  <td style={{ ...styles.td, ...styles.tdR, color: varColor(vp), fontFamily: MONO }}>
                    {vp > 0 ? "+" : ""}{vp}%
                  </td>
                  <td style={{ ...styles.td, ...styles.tdR, color: C.textMuted, fontFamily: MONO }}>{fmt(eac)}</td>
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {over && <span style={{ ...styles.pill, background: "rgba(248,81,73,0.15)", color: C.red }}>OVER</span>}
                    {under && <span style={{ ...styles.pill, background: "rgba(63,185,80,0.15)", color: C.green }}>UNDER</span>}
                    {!over && !under && <span style={{ ...styles.pill, background: "rgba(139,148,158,0.1)", color: C.textMuted }}>ON TRACK</span>}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <button onClick={() => openModal(row)} style={styles.btnGhost}>Edit</button>
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
            <div style={styles.modalTitle}>Update Actual Cost</div>
            <div style={styles.modalSub}>{pid} · {modal.element}</div>
            <div>
              <div style={styles.modalLabel}>Actual Amount (USD)</div>
              <input
                type="number"
                value={modal.amount}
                onChange={(e) => setModal((m) => ({ ...m, amount: e.target.value }))}
                style={styles.input}
                autoFocus
              />
            </div>
            <div style={styles.btnRow}>
              <button onClick={closeModal} style={styles.btnOutline} disabled={saving}>Cancel</button>
              <button onClick={handleSave} style={styles.btnPrimary} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
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
      .then((d) => {
        let cumBudget = 0, cumActual = 0;
        setData(d.months.map((m) => {
          cumBudget += m.budget;
          cumActual += m.actual;
          return { ...m, cumBudget, cumActual };
        }));
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [pid]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={styles.tooltip}>
        <div style={{ fontFamily: SANS, fontWeight: 600, color: C.text, marginBottom: 6, fontSize: 12 }}>{label}</div>
        {payload.map((p) => (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontFamily: MONO, fontSize: 11, color: p.color, marginBottom: 2 }}>
            <span>{p.name}</span><span>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div style={styles.stateText}>Loading burn data…</div>;
  if (error) return <div style={{ ...styles.stateText, color: C.red }}>Error: {error}</div>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} barGap={3} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={C.surfaceHigh} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: C.textMuted, fontFamily: MONO, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="monthly" tick={{ fill: C.textMuted, fontFamily: MONO, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} width={46} />
        <YAxis yAxisId="cumulative" orientation="right" tick={{ fill: C.textDim, fontFamily: MONO, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} width={46} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar yAxisId="monthly" dataKey="budget" name="Budget" fill={C.surfaceHigh} radius={[3, 3, 0, 0]} />
        <Bar yAxisId="monthly" dataKey="actual" name="Actual" fill={C.blue} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
        <Line yAxisId="cumulative" type="monotone" dataKey="cumBudget" name="Cum. Budget" stroke={C.textDim} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
        <Line yAxisId="cumulative" type="monotone" dataKey="cumActual" name="Cum. Actual" stroke={C.yellow} strokeWidth={2} dot={{ r: 3, fill: C.yellow }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function SummaryTable({ rows, loading, error, onQuery }) {
  useEffect(() => { onQuery(QUERIES.summary()); }, []);

  if (loading) return <div style={styles.stateText}>Loading portfolio data…</div>;
  if (error) return <div style={{ ...styles.stateText, color: C.red }}>Error: {error}</div>;

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {[
              { h: "Program", r: false },
              { h: "Contract", r: false },
              { h: "Type", r: false },
              { h: "Budget", r: true },
              { h: "Actual", r: true },
              { h: "Variance", r: true },
              { h: "% Spent", r: true },
            ].map(({ h, r }) => (
              <th key={h} style={{ ...styles.th, textAlign: r ? "right" : "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const { program_id, name, contract, type, total_budget, total_actual, variance: v, pct_spent: sp } = row;
            const spNum = Number(sp);
            return (
              <tr key={program_id} className="fin-row" style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.016)" }}>
                <td style={styles.td}>
                  <span style={{ color: C.blue, fontFamily: MONO, fontSize: 11, marginRight: 8 }}>{program_id}</span>
                  <span style={{ color: C.text }}>{name}</span>
                </td>
                <td style={{ ...styles.td, color: C.textMuted, fontFamily: MONO, fontSize: 11 }}>{contract}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.pill, background: "rgba(56,139,253,0.12)", color: C.blue }}>{type}</span>
                </td>
                <td style={{ ...styles.td, ...styles.tdR, color: C.textMuted, fontFamily: MONO }}>{fmt(total_budget)}</td>
                <td style={{ ...styles.td, ...styles.tdR, fontFamily: MONO }}>{fmt(total_actual)}</td>
                <td style={{ ...styles.td, ...styles.tdR, color: v > 0 ? C.red : C.green, fontFamily: MONO }}>
                  {v > 0 ? "+" : ""}{fmt(v)}
                </td>
                <td style={{ ...styles.td, ...styles.tdR, fontFamily: MONO, color: spNum > 100 ? C.red : spNum > 90 ? C.yellow : C.green }}>
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
  const [eacData, setEacData] = useState(null);
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

  useEffect(() => {
    setEacData(null);
    fetch(`${API}/programs/${selected}/eac`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(setEacData)
      .catch(() => {});
  }, [selected]);

  const summaryMap = Object.fromEntries(summary.map((s) => [s.program_id, s]));
  const selectedProg = programs.find((p) => p.id === selected);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .fin-row:hover > td { background: rgba(255,255,255,0.04) !important; }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        button:hover { opacity: 0.82; }
      `}</style>

      <div style={styles.root}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={styles.logo}>
              <div style={styles.logoMark}>DRS</div>
            </div>
            <div>
              <div style={styles.headerEyebrow}>Leonardo DRS · Land Electronics</div>
              <div style={styles.headerTitle}>Program Finance Tracker</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={styles.headerBadge}>FY2026 · Period 5 / 12</div>
            <button
              onClick={() => setView(view === "detail" ? "summary" : "detail")}
              style={view === "summary" ? styles.btnPrimary : styles.btnOutline}
            >
              {view === "detail" ? "Portfolio View" : "Program View"}
            </button>
          </div>
        </div>

        {view === "summary" ? (
          <div style={styles.body}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Portfolio Summary</div>
              <div style={styles.sectionSub}>All programs · FY2026</div>
            </div>
            <SummaryTable rows={summary} loading={summaryLoading} error={summaryError} onQuery={setActiveQuery} />
            <SqlPanel query={activeQuery} />
          </div>
        ) : (
          <div style={styles.body}>
            {/* Program selector */}
            <div style={styles.cardRow}>
              {programsLoading
                ? <div style={styles.stateText}>Loading programs…</div>
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

            {/* KPI bar */}
            <KpiBar summary={summaryMap[selected]} eacData={eacData} />

            <div style={styles.twoCol}>
              {/* Left: variance table */}
              <div style={{ flex: 1.6, minWidth: 0 }}>
                <div style={styles.sectionHeader}>
                  <div style={styles.sectionTitle}>Cost Element Variance</div>
                  {selectedProg && <div style={styles.sectionSub}>{selectedProg.name} · {selectedProg.contract}</div>}
                </div>
                <VarianceTable pid={selected} progName={selectedProg?.name} onQuery={setActiveQuery} />
              </div>

              {/* Right: burn chart */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.sectionHeader}>
                  <div style={styles.sectionTitle}>Monthly Burn Rate</div>
                  <div style={styles.sectionSub}>
                    <span style={{ color: C.textDim }}>■</span> Budget &nbsp;
                    <span style={{ color: C.blue }}>■</span> Actual &nbsp;
                    <span style={{ color: C.yellow }}>—</span> Cumulative
                  </div>
                </div>
                <div style={styles.chartCard}>
                  <BurnChart pid={selected} onQuery={setActiveQuery} />
                </div>
              </div>
            </div>

            <SqlPanel query={activeQuery} />
          </div>
        )}
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    background: C.bg,
    minHeight: "100vh",
    color: C.text,
    fontFamily: SANS,
    fontSize: 13,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 28px",
    borderBottom: `1px solid ${C.border}`,
    background: C.surface,
  },
  logo: {
    width: 40,
    height: 40,
    background: C.blue,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoMark: {
    fontFamily: MONO,
    fontWeight: 500,
    fontSize: 12,
    color: "#fff",
    letterSpacing: "0.05em",
  },
  headerEyebrow: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: "0.02em",
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: C.text,
    letterSpacing: "-0.01em",
  },
  headerBadge: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.textMuted,
    background: C.surfaceHigh,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: "3px 10px",
  },
  body: {
    padding: "24px 28px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: 1400,
  },
  cardRow: { display: "flex", gap: 12 },
  card: {
    flex: 1,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "16px",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  },
  cardSelected: {
    border: `1px solid ${C.borderActive}`,
    background: "#1c2128",
    boxShadow: `0 0 0 1px ${C.borderActive}22`,
  },
  cardId: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.blue,
    fontWeight: 500,
    letterSpacing: "0.05em",
  },
  cardName: {
    fontSize: 14,
    fontWeight: 600,
    color: C.text,
    marginTop: 4,
    marginBottom: 3,
  },
  cardMeta: {
    fontSize: 11,
    color: C.textMuted,
    fontFamily: MONO,
    marginBottom: 12,
  },
  burnTrack: {
    height: 4,
    background: C.surfaceHigh,
    borderRadius: 2,
    marginBottom: 10,
    overflow: "hidden",
  },
  burnFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.4s ease",
  },
  cardFooter: { display: "flex", justifyContent: "space-between" },
  kpiBar: {
    display: "flex",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  kpiTile: {
    flex: 1,
    padding: "14px 20px",
  },
  kpiLabel: {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 4,
    letterSpacing: "0.01em",
  },
  kpiValue: {
    fontFamily: MONO,
    fontSize: 20,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    marginBottom: 2,
  },
  kpiSub: {
    fontFamily: MONO,
    fontSize: 10,
    color: C.textDim,
    letterSpacing: "0.08em",
  },
  twoCol: { display: "flex", gap: 24, alignItems: "flex-start" },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: C.text,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 11,
    color: C.textMuted,
    fontFamily: MONO,
  },
  chartCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "16px 8px 8px 8px",
  },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 500,
    color: C.textMuted,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
    letterSpacing: "0.02em",
    userSelect: "none",
  },
  td: {
    padding: "9px 12px",
    borderBottom: `1px solid ${C.surfaceHigh}`,
    fontSize: 12,
    whiteSpace: "nowrap",
    color: C.text,
  },
  tdR: { textAlign: "right" },
  pill: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.04em",
    fontFamily: MONO,
  },
  sqlPanel: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  sqlHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    borderBottom: `1px solid ${C.border}`,
    background: C.surfaceHigh,
  },
  sqlDot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: C.green,
    boxShadow: `0 0 6px ${C.green}`,
  },
  sqlLabel: {
    fontSize: 11,
    fontFamily: MONO,
    color: C.textMuted,
    letterSpacing: "0.08em",
  },
  copyBtn: {
    fontSize: 11,
    fontFamily: SANS,
    background: "transparent",
    border: `1px solid ${C.border}`,
    color: C.textMuted,
    padding: "3px 10px",
    cursor: "pointer",
    borderRadius: 4,
  },
  sqlCode: {
    margin: 0,
    padding: "16px",
    fontSize: 12,
    fontFamily: MONO,
    color: "#79c0ff",
    lineHeight: 1.75,
    overflowX: "auto",
  },
  tooltip: {
    background: C.surfaceHigh,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  },
  stateText: {
    fontFamily: SANS,
    fontSize: 13,
    color: C.textMuted,
    padding: "24px 0",
  },
  btnPrimary: {
    background: C.blue,
    border: "none",
    color: "#fff",
    fontFamily: SANS,
    fontWeight: 500,
    fontSize: 13,
    padding: "7px 16px",
    borderRadius: 6,
    cursor: "pointer",
  },
  btnOutline: {
    background: "transparent",
    border: `1px solid ${C.border}`,
    color: C.text,
    fontFamily: SANS,
    fontSize: 13,
    padding: "7px 16px",
    borderRadius: 6,
    cursor: "pointer",
  },
  btnGhost: {
    background: "transparent",
    border: "none",
    color: C.textMuted,
    fontFamily: SANS,
    fontSize: 12,
    padding: "2px 8px",
    cursor: "pointer",
    borderRadius: 4,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(1,4,9,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    backdropFilter: "blur(2px)",
  },
  modalBox: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "24px 28px",
    width: 400,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: C.text,
  },
  modalSub: {
    fontSize: 12,
    color: C.textMuted,
    fontFamily: MONO,
    marginTop: -12,
  },
  modalLabel: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontFamily: MONO,
    fontSize: 14,
    padding: "9px 12px",
    outline: "none",
  },
  btnRow: { display: "flex", gap: 10, justifyContent: "flex-end" },
};
