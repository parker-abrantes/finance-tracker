# Finance Tracker — Claude Code Context

## Project Summary
Defense program finance tracker built as a portfolio project for a Leonardo DRS Business Operations Internship application. Simulates real defense contract financial management: budget vs. actuals, variance analysis, burn rate, and EAC forecasting across multiple programs with FAR/DAR-compliant cost element structure.

## Stack
- **Frontend**: React (Vite), Recharts, IBM Plex Sans
- **Backend**: Python, FastAPI, SQLite (via `sqlite3` stdlib)
- **DB**: Single SQLite file at `data/finance.db`
- **API**: REST, runs on `http://localhost:8000`
- **Frontend dev server**: `http://localhost:5173`

## Project Structure
```
finance-tracker/
├── CLAUDE.md                  ← you are here
├── frontend/
│   ├── src/
│   │   └── App.jsx            ← main React component (currently uses in-memory mock data)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── main.py                ← FastAPI app
│   ├── database.py            ← DB init + seed
│   ├── models.py              ← Pydantic models
│   └── requirements.txt
└── data/
    └── finance.db             ← SQLite database (auto-created on first run)
```

## Database Schema
```sql
CREATE TABLE programs (
    id          TEXT PRIMARY KEY,  -- e.g. 'P001'
    name        TEXT NOT NULL,
    contract    TEXT NOT NULL,     -- contract number e.g. 'FA8650-24-C-1001'
    type        TEXT NOT NULL,     -- 'CPFF' | 'FFP' | 'T&M'
    period_end  TEXT NOT NULL      -- ISO date
);

CREATE TABLE cost_elements (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL UNIQUE   -- 'Direct Labor', 'Fringe', etc.
);

CREATE TABLE budgets (
    program_id      TEXT REFERENCES programs(id),
    cost_element    TEXT REFERENCES cost_elements(name),
    amount          REAL NOT NULL,
    PRIMARY KEY (program_id, cost_element)
);

CREATE TABLE actuals (
    program_id      TEXT REFERENCES programs(id),
    cost_element    TEXT REFERENCES cost_elements(name),
    amount          REAL NOT NULL,
    PRIMARY KEY (program_id, cost_element)
);

CREATE TABLE monthly_burn (
    program_id  TEXT REFERENCES programs(id),
    month       TEXT NOT NULL,     -- 'Jan', 'Feb', etc.
    month_num   INTEGER NOT NULL,  -- 1-12
    budget      REAL NOT NULL,
    actual      REAL NOT NULL,
    PRIMARY KEY (program_id, month_num)
);
```

## Seed Data
Three programs already defined in `frontend/src/App.jsx` under the `DB` object. When building `backend/database.py`, extract and insert this exact data so the frontend switches seamlessly.

Programs:
- P001: LYNX C2 System, FA8650-24-C-1001, CPFF
- P002: SHORAD Integration, W911QY-25-C-0042, FFP  
- P003: TITAN Vehicle Suite, N00024-24-C-5510, T&M

Cost elements: Direct Labor, Fringe, Overhead, ODC, Travel, Subcontract, G&A

## API Endpoints to Build
```
GET  /programs                          → list all programs
GET  /programs/{id}/variance            → budget vs actuals by cost element + variance %
GET  /programs/{id}/burn                → monthly burn rate data
GET  /programs/{id}/eac                 → EAC forecast using CPI method
GET  /summary                           → portfolio-level rollup across all programs
POST /actuals/{program_id}/{element}    → update an actual value (for data entry form)
```

## Key Formulas
- **Variance** = Actual - Budget
- **Variance %** = (Actual - Budget) / Budget × 100
- **CPI** = Budget / Actual (Cost Performance Index)
- **EAC** = Total Budget / CPI  (Estimate at Completion)
- **VAC** = Total Budget - EAC  (Variance at Completion)
- **% Spent** = Actual / Budget × 100

## Frontend Migration Plan
The current `App.jsx` uses a hardcoded `DB` object for all data. Migration steps:
1. Replace `DB.programs` → `GET /programs`
2. Replace variance table data → `GET /programs/{id}/variance`
3. Replace burn chart data → `GET /programs/{id}/burn`
4. Replace summary table → `GET /summary`
5. Add EAC column using → `GET /programs/{id}/eac`
6. Add data entry form wired to → `POST /actuals/{id}/{element}`

Use `useEffect` + `useState` for all fetches. Add a loading state per section. CORS must be enabled in FastAPI for `http://localhost:5173`.

## Styling Rules
- Dark theme only — background `#020c18`, surface `#041529`, border `#0f2744`
- Accent: `#3b82f6` (blue)
- Green: `#4ade80` (under budget), Red: `#f87171` (over budget), Yellow: `#facc15` (warning)
- Font: IBM Plex Sans (body), monospace for all numbers/codes/SQL
- No Tailwind — all styles are inline JS objects in `styles` const at bottom of App.jsx
- Keep the SQL query panel — it should update to show whichever endpoint query just ran

## Desired Features (prioritized)
1. **Real SQLite backend** via FastAPI (replace mock data)
2. **EAC column** in variance table (CPI method)
3. **Data entry form** — modal to update actuals for a cost element
4. **CSV export** — download variance report for selected program
5. **Trend indicator** — up/down arrow vs prior month on burn chart

## Resume Context
This project is specifically designed to demonstrate:
- SQL schema design and query writing
- Financial analysis (variance, burn rate, EAC/CPI)
- Defense contract cost element structure (FAR-compliant: Direct Labor, Fringe, OH, ODC, G&A)
- Dashboard/reporting for "AI assisted analysis" (per JD requirement)
- Full-stack ownership

Target role: Business Operations Intern, Leonardo DRS Land Electronics, Melbourne FL (Fall 2026).

## Run Commands
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```
