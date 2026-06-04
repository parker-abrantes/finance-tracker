import { useState, useEffect } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const API = "http://localhost:8000";
const MONO = "'IBM Plex Mono', 'Courier New', monospace";
const SANS = "'IBM Plex Sans', -apple-system, sans-serif";

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
  purple:      "#a371f7",
  orange:      "#fd8458",
};

const PIE_COLORS = [C.blue, C.green, C.yellow, C.red, C.purple, C.orange, "#79c0ff"];

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
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

const varColor = (v) => {
  if (Math.abs(v) < 3) return C.textMuted;
  return v > 0 ? C.red : C.green;
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
        <button onClick={copy} style={styles.btnGhost}>{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <pre style={styles.sqlCode}>{query}</pre>
    </div>
  );
}

function KpiBar({ summary, eacData }) {
  const budget = summary?.total_budget ?? 0;
  const actual = summary?.total_actual ?? 0;
  const cpi    = eacData?.cpi;
  const eac    = eacData?.eac;
  const vac    = eacData?.vac;
  const pct    = summary?.pct_spent ?? 0;

  const tiles = [
    {
      label: "Total Budget", value: fmtShort(budget), sub: "BAC",
      color: C.text, iconBg: "rgba(56,139,253,0.15)", icon: "▣",
    },
    {
      label: "Actual Cost", value: fmtShort(actual), sub: "ACWP",
      color: pct > 100 ? C.red : C.text, iconBg: "rgba(63,185,80,0.15)", icon: "◈",
    },
    {
      label: "Cost Perf. Index", value: cpi ? cpi.toFixed(3) : "—", sub: "CPI",
      color: !cpi ? C.textMuted : cpi >= 1 ? C.green : C.red,
      iconBg: !cpi ? "rgba(139,148,158,0.1)" : cpi >= 1 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)",
      icon: cpi ? (cpi >= 1 ? "▲" : "▼") : "—",
    },
    {
      label: "Est. at Completion", value: eac ? fmtShort(eac) : "—", sub: "EAC",
      color: C.text, iconBg: "rgba(210,153,34,0.15)", icon: "◎",
    },
    {
      label: "Variance at Compl.", value: vac != null ? fmtShort(vac) : "—", sub: "VAC",
      color: vac == null ? C.textMuted : vac >= 0 ? C.green : C.red,
      iconBg: vac == null ? "rgba(139,148,158,0.1)" : vac >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)",
      icon: vac == null ? "—" : vac >= 0 ? "+" : "−",
    },
  ];

  return (
    <div style={styles.kpiBar}>
      {tiles.map((t, i) => (
        <div key={t.sub} style={{ ...styles.kpiTile, borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={styles.kpiLabel}>{t.label}</div>
            <div style={{ ...styles.kpiIcon, background: t.iconBg, color: t.color }}>{t.icon}</div>
          </div>
          <div style={{ ...styles.kpiValue, color: t.color }}>{t.value}</div>
          <div style={styles.kpiSub}>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function ProgramCard({ prog, summary, selected, onClick }) {
  const budget   = summary?.total_budget ?? 0;
  const actual   = summary?.total_actual ?? 0;
  const variance = summary?.variance ?? 0;
  const pct      = budget > 0 ? (actual / budget) * 100 : 0;
  const isOver   = variance > 0;
  const barColor = pct > 100 ? C.red : pct > 90 ? C.yellow : C.green;

  return (
    <div onClick={onClick} style={{ ...styles.card, ...(selected ? styles.cardSelected : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span style={styles.cardId}>{prog.id}</span>
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
        <span style={{ color: C.textMuted, fontFamily: MONO, fontSize: 11 }}>{pct.toFixed(0)}% spent</span>
        <span style={{ color: isOver ? C.red : C.green, fontFamily: MONO, fontSize: 11 }}>
          {isOver ? "+" : ""}{fmtShort(variance)}
        </span>
      </div>
    </div>
  );
}

function CostBreakdown({ pid }) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/programs/${pid}/variance`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        setData(d.rows.map((r) => ({ name: r.cost_element, value: r.budget, actual: r.actual })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pid]);

  if (loading) return <div style={styles.stateText}>Loading…</div>;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={styles.tooltip}>
        <div style={{ fontWeight: 600, color: C.text, marginBottom: 4, fontSize: 12 }}>{d.name}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}>Budget: <span style={{ color: C.text }}>{fmt(d.value)}</span></div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}>Actual: <span style={{ color: C.text }}>{fmt(d.actual)}</span></div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={210}>
      <PieChart>
        <Pie
          data={data}
          cx="42%"
          cy="50%"
          innerRadius={62}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={0.9} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          iconSize={7}
          formatter={(v) => (
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO }}>{v}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function BurnChart({ pid, onQuery }) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

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
        <div style={{ fontWeight: 600, color: C.text, marginBottom: 6, fontSize: 12 }}>{label}</div>
        {payload.map((p) => (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontFamily: MONO, fontSize: 11, color: p.color, marginBottom: 2 }}>
            <span>{p.name}</span><span>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div style={styles.stateText}>Loading…</div>;
  if (error)   return <div style={{ ...styles.stateText, color: C.red }}>Error: {error}</div>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} barGap={3} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={C.surfaceHigh} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: C.textMuted, fontFamily: MONO, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="m" tick={{ fill: C.textMuted, fontFamily: MONO, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} width={42} />
        <YAxis yAxisId="c" orientation="right" tick={{ fill: C.textDim, fontFamily: MONO, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} width={42} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar yAxisId="m" dataKey="budget" name="Budget"      fill={C.surfaceHigh}         radius={[3,3,0,0]} />
        <Bar yAxisId="m" dataKey="actual" name="Actual"      fill={C.blue}                radius={[3,3,0,0]} fillOpacity={0.85} />
        <Line yAxisId="c" type="monotone" dataKey="cumBudget" name="Cum. Budget" stroke={C.textDim}  strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
        <Line yAxisId="c" type="monotone" dataKey="cumActual" name="Cum. Actual" stroke={C.yellow}   strokeWidth={2}   dot={{ r: 3, fill: C.yellow }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function VarianceTable({ pid, progName, onQuery }) {
  const [rows, setRows]       = useState([]);
  const [cpi, setCpi]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal]     = useState({ open: false, element: "", amount: "" });
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    onQuery(QUERIES.variance(pid));
    Promise.all([
      fetch(`${API}/programs/${pid}/variance`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
      fetch(`${API}/programs/${pid}/eac`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
    ])
      .then(([vd, ed]) => { setRows(vd.rows); setCpi(ed.cpi); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [pid, refreshKey]);

  const openModal  = (row) => setModal({ open: true, element: row.cost_element, amount: String(row.actual) });
  const closeModal = ()    => setModal({ open: false, element: "", amount: "" });

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
    const meta   = `Program,${pid}\nReport Date,${today}\n\n`;
    const header = "Cost Element,Budget,Actual,Variance,Variance %,EAC,Status\n";
    const body   = rows.map(({ cost_element, budget, actual, variance, variance_pct }) => {
      const eac    = cpi > 0 ? (budget / cpi).toFixed(2) : actual.toFixed(2);
      const status = Math.abs(variance_pct) < 3 ? "ON TRACK" : variance_pct > 0 ? "OVER" : "UNDER";
      return `"${cost_element}",${budget},${actual},${variance},${variance_pct},${eac},${status}`;
    }).join("\n");
    const blob = new Blob([meta + header + body], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    const slug = (progName || pid).replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "");
    a.download = `${pid}-${slug}-variance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={styles.stateText}>Loading variance data…</div>;
  if (error)   return <div style={{ ...styles.stateText, color: C.red }}>Error: {error}</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button onClick={exportCsv} style={styles.btnOutline}>↓ Export CSV</button>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Cost Element","Budget","Actual","Variance","Var %","EAC","Status",""].map((h) => (
                <th key={h} style={{ ...styles.th, textAlign: h === "Cost Element" || h === "" ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const { cost_element: el, budget: b, actual: a, variance: v, variance_pct: vp } = row;
              const eac  = cpi && cpi > 0 ? b / cpi : a;
              const over = vp > 3, under = vp < -3;
              return (
                <tr key={el} className="fin-row" style={{ background: i % 2 ? "rgba(255,255,255,0.016)" : "transparent" }}>
                  <td style={styles.td}>{el}</td>
                  <td style={{ ...styles.td, ...styles.tdR, color: C.textMuted, fontFamily: MONO }}>{fmt(b)}</td>
                  <td style={{ ...styles.td, ...styles.tdR, fontFamily: MONO }}>{fmt(a)}</td>
                  <td style={{ ...styles.td, ...styles.tdR, color: v > 0 ? C.red : C.green, fontFamily: MONO }}>{v > 0 ? "+" : ""}{fmt(v)}</td>
                  <td style={{ ...styles.td, ...styles.tdR, color: varColor(vp), fontFamily: MONO }}>{vp > 0 ? "+" : ""}{vp}%</td>
                  <td style={{ ...styles.td, ...styles.tdR, color: C.textMuted, fontFamily: MONO }}>{fmt(eac)}</td>
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    {over  && <span style={{ ...styles.pill, background: "rgba(248,81,73,0.15)",  color: C.red   }}>OVER</span>}
                    {under && <span style={{ ...styles.pill, background: "rgba(63,185,80,0.15)",  color: C.green }}>UNDER</span>}
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

function SummaryTable({ rows, loading, error, onQuery }) {
  useEffect(() => { onQuery(QUERIES.summary()); }, []);
  if (loading) return <div style={styles.stateText}>Loading portfolio data…</div>;
  if (error)   return <div style={{ ...styles.stateText, color: C.red }}>Error: {error}</div>;

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {[["Program",false],["Contract",false],["Type",false],["Budget",true],["Actual",true],["Variance",true],["% Spent",true]].map(([h, r]) => (
              <th key={h} style={{ ...styles.th, textAlign: r ? "right" : "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const { program_id, name, contract, type, total_budget, total_actual, variance: v, pct_spent: sp } = row;
            const spNum = Number(sp);
            return (
              <tr key={program_id} className="fin-row" style={{ background: i % 2 ? "rgba(255,255,255,0.016)" : "transparent" }}>
                <td style={styles.td}>
                  <span style={{ color: C.blue, fontFamily: MONO, fontSize: 11, marginRight: 8 }}>{program_id}</span>
                  {name}
                </td>
                <td style={{ ...styles.td, color: C.textMuted, fontFamily: MONO, fontSize: 11 }}>{contract}</td>
                <td style={styles.td}><span style={{ ...styles.pill, background: "rgba(56,139,253,0.12)", color: C.blue }}>{type}</span></td>
                <td style={{ ...styles.td, ...styles.tdR, color: C.textMuted, fontFamily: MONO }}>{fmt(total_budget)}</td>
                <td style={{ ...styles.td, ...styles.tdR, fontFamily: MONO }}>{fmt(total_actual)}</td>
                <td style={{ ...styles.td, ...styles.tdR, color: v > 0 ? C.red : C.green, fontFamily: MONO }}>{v > 0 ? "+" : ""}{fmt(v)}</td>
                <td style={{ ...styles.td, ...styles.tdR, fontFamily: MONO, color: spNum > 100 ? C.red : spNum > 90 ? C.yellow : C.green }}>{sp}%</td>
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
  const [programs, setPrograms]       = useState([]);
  const [summary, setSummary]         = useState([]);
  const [eacData, setEacData]         = useState(null);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading]   = useState(true);
  const [summaryError, setSummaryError]       = useState(null);
  const [selected, setSelected]       = useState("P001");
  const [view, setView]               = useState("detail");
  const [activeQuery, setActiveQuery] = useState(QUERIES.variance("P001"));

  useEffect(() => {
    fetch(`${API}/programs`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setPrograms(d); setProgramsLoading(false); })
      .catch(() => setProgramsLoading(false));

    fetch(`${API}/summary`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setSummary(d); setSummaryLoading(false); })
      .catch((e) => { setSummaryError(e.message); setSummaryLoading(false); });
  }, []);

  useEffect(() => {
    setEacData(null);
    fetch(`${API}/programs/${selected}/eac`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setEacData)
      .catch(() => {});
  }, [selected]);

  const summaryMap  = Object.fromEntries(summary.map((s) => [s.program_id, s]));
  const selectedProg = programs.find((p) => p.id === selected);

  const tabs = [
    { id: "detail",  label: "Program Detail" },
    { id: "summary", label: "Portfolio Summary" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        .fin-row:hover > td { background: rgba(255,255,255,0.04) !important; }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        button { cursor: pointer; }
      `}</style>

      <div style={styles.root}>
        {/* ── Header ── */}
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={styles.logo}><span style={styles.logoText}>DRS</span></div>
            <div>
              <div style={styles.headerEyebrow}>Leonardo DRS · Land Electronics</div>
              <div style={styles.headerTitle}>Program Finance Tracker</div>
            </div>
          </div>

          {/* Nav tabs */}
          <nav style={styles.navTabs}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                style={{ ...styles.tab, ...(view === t.id ? styles.tabActive : {}) }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div style={styles.headerRight}>
            <div style={styles.headerBadge}>FY2026 · Period 5 / 12</div>
          </div>
        </div>

        {/* ── Portfolio view ── */}
        {view === "summary" && (
          <div style={styles.body}>
            <div style={styles.panelCard}>
              <div style={styles.panelHeader}>
                <div style={styles.sectionTitle}>Portfolio Summary</div>
                <div style={styles.sectionSub}>All active programs · FY2026</div>
              </div>
              <SummaryTable rows={summary} loading={summaryLoading} error={summaryError} onQuery={setActiveQuery} />
            </div>
            <SqlPanel query={activeQuery} />
          </div>
        )}

        {/* ── Program detail view ── */}
        {view === "detail" && (
          <div style={styles.body}>

            {/* Program selector cards */}
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

            {/* KPI metrics bar */}
            <KpiBar summary={summaryMap[selected]} eacData={eacData} />

            {/* Main content: variance table + right column */}
            <div style={styles.mainGrid}>

              {/* Variance table */}
              <div style={styles.panelCard}>
                <div style={styles.panelHeader}>
                  <div>
                    <div style={styles.sectionTitle}>Cost Element Variance</div>
                    {selectedProg && <div style={styles.sectionSub}>{selectedProg.name} · {selectedProg.contract}</div>}
                  </div>
                </div>
                <VarianceTable pid={selected} progName={selectedProg?.name} onQuery={setActiveQuery} />
              </div>

              {/* Right column: breakdown + burn */}
              <div style={styles.rightCol}>

                {/* Cost breakdown donut */}
                <div style={styles.panelCard}>
                  <div style={styles.panelHeader}>
                    <div style={styles.sectionTitle}>Budget by Cost Element</div>
                    <div style={styles.sectionSub}>Allocation breakdown</div>
                  </div>
                  <CostBreakdown pid={selected} />
                </div>

                {/* Burn rate chart */}
                <div style={styles.panelCard}>
                  <div style={styles.panelHeader}>
                    <div style={styles.sectionTitle}>Monthly Burn Rate</div>
                    <div style={styles.sectionSub}>
                      <span style={{ color: C.textDim }}>■</span> Budget &nbsp;
                      <span style={{ color: C.blue }}>■</span> Actual &nbsp;
                      <span style={{ color: C.yellow }}>—</span> Cumulative
                    </div>
                  </div>
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

  // Header
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 28px",
    height: 58,
    borderBottom: `1px solid ${C.border}`,
    background: C.surface,
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  logo: {
    width: 38,
    height: 38,
    background: C.blue,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoText: { fontFamily: MONO, fontWeight: 500, fontSize: 11, color: "#fff", letterSpacing: "0.05em" },
  headerEyebrow: { fontSize: 10, color: C.textMuted, marginBottom: 1 },
  headerTitle: { fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "-0.01em" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  headerBadge: {
    fontFamily: MONO, fontSize: 11, color: C.textMuted,
    background: C.surfaceHigh, border: `1px solid ${C.border}`,
    borderRadius: 20, padding: "3px 12px",
  },

  // Nav tabs
  navTabs: { display: "flex", gap: 2, background: C.surfaceHigh, borderRadius: 8, padding: 3 },
  tab: {
    fontFamily: SANS, fontSize: 13, fontWeight: 500,
    color: C.textMuted, background: "transparent",
    border: "none", padding: "6px 16px", borderRadius: 6,
    transition: "all 0.15s",
  },
  tabActive: {
    color: C.text, background: C.surface,
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },

  // Layout
  body: { padding: "20px 28px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1600 },
  cardRow: { display: "flex", gap: 12 },
  mainGrid: { display: "flex", gap: 16, alignItems: "flex-start" },
  rightCol: { display: "flex", flexDirection: "column", gap: 16, width: 380, flexShrink: 0 },

  // Panel card (surface container)
  panelCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    overflow: "hidden",
    flex: 1,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "14px 16px 12px",
    borderBottom: `1px solid ${C.border}`,
  },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 },
  sectionSub: { fontSize: 11, color: C.textMuted, fontFamily: MONO },

  // Program cards
  card: {
    flex: 1,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "14px 16px",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  },
  cardSelected: {
    border: `1px solid ${C.borderActive}`,
    background: "#1c2128",
    boxShadow: `0 0 0 3px rgba(56,139,253,0.12)`,
  },
  cardId:   { fontFamily: MONO, fontSize: 11, color: C.blue, fontWeight: 500, letterSpacing: "0.05em" },
  cardName: { fontSize: 13, fontWeight: 600, color: C.text, marginTop: 4, marginBottom: 3 },
  cardMeta: { fontSize: 11, color: C.textMuted, fontFamily: MONO, marginBottom: 12 },
  burnTrack: { height: 4, background: C.surfaceHigh, borderRadius: 2, marginBottom: 10, overflow: "hidden" },
  burnFill:  { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },
  cardFooter: { display: "flex", justifyContent: "space-between" },

  // KPI bar
  kpiBar: {
    display: "flex",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  kpiTile:  { flex: 1, padding: "16px 20px" },
  kpiLabel: { fontSize: 11, color: C.textMuted, marginBottom: 8 },
  kpiIcon:  { width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 },
  kpiValue: { fontFamily: MONO, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4, lineHeight: 1 },
  kpiSub:   { fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.12em" },

  // Tables
  tableWrap: { overflowX: "auto", padding: "0 4px" },
  table:     { width: "100%", borderCollapse: "collapse" },
  th: {
    padding: "10px 12px", fontSize: 11, fontWeight: 500,
    color: C.textMuted, borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap", letterSpacing: "0.02em", userSelect: "none",
    background: C.surface,
  },
  td:  { padding: "9px 12px", borderBottom: `1px solid rgba(48,54,61,0.6)`, fontSize: 12, whiteSpace: "nowrap", color: C.text },
  tdR: { textAlign: "right" },

  // Pills
  pill: {
    display: "inline-block", padding: "2px 8px", borderRadius: 20,
    fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", fontFamily: MONO,
  },

  // SQL panel
  sqlPanel: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  sqlHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.surfaceHigh,
  },
  sqlDot:  { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` },
  sqlLabel: { fontSize: 11, fontFamily: MONO, color: C.textMuted, letterSpacing: "0.08em" },
  sqlCode: {
    margin: 0, padding: "16px", fontSize: 12, fontFamily: MONO,
    color: "#79c0ff", lineHeight: 1.75, overflowX: "auto",
  },

  // Tooltip
  tooltip: {
    background: C.surfaceHigh, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "10px 14px", fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
  },

  // State
  stateText: { fontFamily: SANS, fontSize: 13, color: C.textMuted, padding: "24px 16px" },

  // Buttons
  btnPrimary: {
    background: C.blue, border: "none", color: "#fff",
    fontFamily: SANS, fontWeight: 500, fontSize: 13,
    padding: "7px 16px", borderRadius: 6,
  },
  btnOutline: {
    background: "transparent", border: `1px solid ${C.border}`, color: C.text,
    fontFamily: SANS, fontSize: 13, padding: "7px 16px", borderRadius: 6,
  },
  btnGhost: {
    background: "transparent", border: "none", color: C.textMuted,
    fontFamily: SANS, fontSize: 12, padding: "2px 8px", borderRadius: 4,
  },

  // Modal
  overlay: {
    position: "fixed", inset: 0, background: "rgba(1,4,9,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100, backdropFilter: "blur(2px)",
  },
  modalBox: {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "24px 28px", width: 400,
    display: "flex", flexDirection: "column", gap: 18,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
  },
  modalTitle: { fontSize: 16, fontWeight: 600, color: C.text },
  modalSub:   { fontSize: 12, color: C.textMuted, fontFamily: MONO, marginTop: -12 },
  modalLabel: { fontSize: 12, color: C.textMuted, marginBottom: 6 },
  input: {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 6, color: C.text, fontFamily: MONO,
    fontSize: 14, padding: "9px 12px", outline: "none",
  },
  btnRow: { display: "flex", gap: 10, justifyContent: "flex-end" },
};
