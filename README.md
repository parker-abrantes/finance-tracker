# Defense Program Finance Tracker

A full-stack defense contract finance dashboard simulating real-world EVM (Earned Value Management) reporting across multiple DoD programs.

> **Built for:** Portfolio project for Leonardo DRS Business Operations Internship application (Fall 2026, Melbourne FL)

---

## Features

- **Multi-program dashboard** — simultaneous tracking of three active defense programs (CPFF, FFP, T&M contract types)
- **Cost Element Variance Analysis** — budget vs. actuals by FAR-compliant cost element (Direct Labor, Fringe, Overhead, ODC, Travel, Subcontract, G&A)
- **EVM KPI Bar** — live CPI, EAC, VAC, CV, and % spent calculated from SQLite on every page load
- **Monthly Burn Rate Chart** — dual-axis ComposedChart with monthly bars (budget vs. actual) and cumulative spend lines across a 12-month period
- **Budget Allocation Donut** — cost element breakdown by program
- **Program Health Badges** — HEALTHY / WATCH / AT RISK status derived from CPI on each program card
- **Actuals Edit Modal** — inline data entry to update any cost element actual; persisted to SQLite via POST
- **CSV Export** — one-click variance report download per program (includes EAC and status columns)
- **Portfolio Summary Tab** — cross-program rollup table with variance and % spent
- **SQL Query Panel** — displays the live SQL query powering each view (demonstrates schema knowledge)

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | React 18, Vite, IBM Plex Sans/Mono fonts        |
| Charts     | Recharts (ComposedChart, PieChart)              |
| Backend    | Python 3.11+, FastAPI, Uvicorn                  |
| Database   | SQLite 3 (stdlib `sqlite3`, no ORM)             |
| API Models | Pydantic v2                                     |

---

## Defense Finance Concepts

| Term | Definition |
|------|-----------|
| **CPI** (Cost Performance Index) | `Budget / Actual`. CPI > 1.0 means under budget (favorable); CPI < 1.0 means cost overrun. A CPI of 0.95 means you are spending $1.05 for every $1.00 of planned work. |
| **EAC** (Estimate at Completion) | `Total Budget / CPI`. Projects the final cost of the contract if current spending efficiency continues. The CPI method is standard under ANSI/EIA-748 EVMS guidelines. |
| **VAC** (Variance at Completion) | `Budget - EAC`. The projected dollar overrun or underrun at contract completion. Negative VAC means the program will likely exceed its budget. |
| **CV** (Cost Variance) | `Budget - Actual`. A snapshot of how much under or over budget the program is at the current period. Positive = favorable (under budget). |
| **Variance %** | `(Actual - Budget) / Budget × 100`. Normalized overrun/underrun percentage per cost element — used in Contractor Business System (CBS) reports. |
| **Burn Rate** | Monthly actual expenditure vs. planned budget. Cumulative burn vs. cumulative plan indicates whether the program is pacing correctly toward the period of performance end date. |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/programs` | List all programs (id, name, contract number, type, period end) |
| `GET`  | `/programs/{id}/variance` | Cost element variance table: budget, actual, variance $, variance %, EAC per element |
| `GET`  | `/programs/{id}/burn` | Monthly burn data (budget + actual) for all 12 months |
| `GET`  | `/programs/{id}/eac` | EVM summary: CPI, EAC, VAC, CV, % spent |
| `GET`  | `/summary` | Portfolio rollup: all programs with total budget, actual, variance |
| `POST` | `/actuals/{program_id}/{element}` | Update an actual cost value for a given cost element (body: `{"amount": float}`) |

---

## Run Locally

**Prerequisites:** Python 3.11+, Node.js 18+

```bash
# 1. Clone the repo
git clone <repo-url>
cd finance-tracker

# 2. Install Python dependencies
pip install -r backend/requirements.txt

# 3. Build the React frontend
npm install --prefix frontend
npm run build --prefix frontend

# 4. Start the server (serves API + built frontend on port 8000)
python run.py
```

Open **http://localhost:8000** in your browser.

The SQLite database (`data/finance.db`) is created and seeded automatically on first startup. No separate database setup required.

---

## Project Structure

```
finance-tracker/
├── run.py                  # Launch script (uvicorn)
├── backend/
│   ├── main.py             # FastAPI routes
│   ├── database.py         # SQLite init + seed data
│   ├── models.py           # Pydantic request/response models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   └── App.jsx         # React dashboard (single component file)
│   ├── index.html
│   └── vite.config.js
└── data/
    └── finance.db          # SQLite database (auto-created, gitignored)
```

---

## Schema Overview

The database uses five normalized tables following FAR Part 31 cost element structure:

- `programs` — contract metadata (number, type, period of performance)
- `cost_elements` — enumerated FAR-compliant cost categories
- `budgets` — planned cost per element per program
- `actuals` — incurred cost per element per program
- `monthly_burn` — time-phased budget and actual by month (12 months per program)
