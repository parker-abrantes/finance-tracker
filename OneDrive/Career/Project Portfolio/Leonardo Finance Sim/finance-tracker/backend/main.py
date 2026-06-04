from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import get_connection, init_db
from models import (
    ActualUpdate,
    BurnMonth,
    BurnResponse,
    EACResponse,
    Program,
    SummaryRow,
    VarianceResponse,
    VarianceRow,
)

app = FastAPI(title="Finance Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/programs", response_model=list[Program])
def list_programs():
    conn = get_connection()
    rows = conn.execute("SELECT id, name, contract, type, period_end FROM programs ORDER BY id").fetchall()
    conn.close()
    return [Program(**dict(r)) for r in rows]


@app.get("/programs/{program_id}/variance", response_model=VarianceResponse)
def get_variance(program_id: str):
    conn = get_connection()
    program = conn.execute("SELECT id FROM programs WHERE id = ?", (program_id,)).fetchone()
    if not program:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Program {program_id} not found")

    rows = conn.execute("""
        SELECT
            b.cost_element,
            b.amount AS budget,
            a.amount AS actual,
            (a.amount - b.amount)              AS variance,
            ROUND((a.amount - b.amount) / b.amount * 100, 2) AS variance_pct
        FROM budgets b
        JOIN actuals a ON a.program_id = b.program_id AND a.cost_element = b.cost_element
        WHERE b.program_id = ?
        ORDER BY ABS((a.amount - b.amount) / b.amount) DESC
    """, (program_id,)).fetchall()
    conn.close()

    variance_rows = []
    for r in rows:
        budget = r["budget"]
        actual = r["actual"]
        cpi = budget / actual if actual else 1.0
        total_budget = budget
        eac = total_budget / cpi if cpi else 0.0
        variance_rows.append(VarianceRow(
            cost_element=r["cost_element"],
            budget=budget,
            actual=actual,
            variance=r["variance"],
            variance_pct=r["variance_pct"],
            eac=round(eac, 2),
        ))

    return VarianceResponse(program_id=program_id, rows=variance_rows)


@app.get("/programs/{program_id}/burn", response_model=BurnResponse)
def get_burn(program_id: str):
    conn = get_connection()
    program = conn.execute("SELECT id FROM programs WHERE id = ?", (program_id,)).fetchone()
    if not program:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Program {program_id} not found")

    rows = conn.execute("""
        SELECT month, month_num, budget, actual
        FROM monthly_burn
        WHERE program_id = ?
        ORDER BY month_num
    """, (program_id,)).fetchall()
    conn.close()

    return BurnResponse(
        program_id=program_id,
        months=[BurnMonth(**dict(r)) for r in rows],
    )


@app.get("/programs/{program_id}/eac", response_model=EACResponse)
def get_eac(program_id: str):
    conn = get_connection()
    program = conn.execute("SELECT id FROM programs WHERE id = ?", (program_id,)).fetchone()
    if not program:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Program {program_id} not found")

    totals = conn.execute("""
        SELECT
            SUM(b.amount) AS total_budget,
            SUM(a.amount) AS total_actual
        FROM budgets b
        JOIN actuals a ON a.program_id = b.program_id AND a.cost_element = b.cost_element
        WHERE b.program_id = ?
    """, (program_id,)).fetchone()
    conn.close()

    total_budget = totals["total_budget"] or 0.0
    total_actual = totals["total_actual"] or 0.0
    cpi = round(total_budget / total_actual, 4) if total_actual else 1.0
    eac = round(total_budget / cpi, 2) if cpi else 0.0
    vac = round(total_budget - eac, 2)
    pct_spent = round(total_actual / total_budget * 100, 1) if total_budget else 0.0

    return EACResponse(
        program_id=program_id,
        total_budget=total_budget,
        total_actual=total_actual,
        cpi=cpi,
        eac=eac,
        vac=vac,
        pct_spent=pct_spent,
    )


@app.get("/summary", response_model=list[SummaryRow])
def get_summary():
    conn = get_connection()
    rows = conn.execute("""
        SELECT
            p.id            AS program_id,
            p.name,
            p.contract,
            p.type,
            SUM(b.amount)   AS total_budget,
            SUM(a.amount)   AS total_actual,
            SUM(a.amount - b.amount)                        AS variance,
            ROUND(SUM(a.amount) / SUM(b.amount) * 100, 1)  AS pct_spent
        FROM programs p
        JOIN budgets b ON b.program_id = p.id
        JOIN actuals a ON a.program_id = p.id AND a.cost_element = b.cost_element
        GROUP BY p.id
        ORDER BY variance DESC
    """).fetchall()
    conn.close()
    return [SummaryRow(**dict(r)) for r in rows]


@app.post("/actuals/{program_id}/{element}", response_model=dict)
def update_actual(program_id: str, element: str, body: ActualUpdate):
    conn = get_connection()

    program = conn.execute("SELECT id FROM programs WHERE id = ?", (program_id,)).fetchone()
    if not program:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Program {program_id} not found")

    cost_el = conn.execute("SELECT name FROM cost_elements WHERE name = ?", (element,)).fetchone()
    if not cost_el:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Cost element '{element}' not found")

    conn.execute("""
        INSERT INTO actuals (program_id, cost_element, amount)
        VALUES (?, ?, ?)
        ON CONFLICT(program_id, cost_element) DO UPDATE SET amount = excluded.amount
    """, (program_id, element, body.amount))
    conn.commit()
    conn.close()

    return {"program_id": program_id, "cost_element": element, "amount": body.amount}


# Serve built frontend — must be mounted last so API routes take priority
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
