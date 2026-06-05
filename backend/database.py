import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "finance.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS programs (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            contract    TEXT NOT NULL,
            type        TEXT NOT NULL,
            period_end  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cost_elements (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            name    TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS budgets (
            program_id      TEXT REFERENCES programs(id),
            cost_element    TEXT REFERENCES cost_elements(name),
            amount          REAL NOT NULL,
            PRIMARY KEY (program_id, cost_element)
        );

        CREATE TABLE IF NOT EXISTS actuals (
            program_id      TEXT REFERENCES programs(id),
            cost_element    TEXT REFERENCES cost_elements(name),
            amount          REAL NOT NULL,
            PRIMARY KEY (program_id, cost_element)
        );

        CREATE TABLE IF NOT EXISTS monthly_burn (
            program_id  TEXT REFERENCES programs(id),
            month       TEXT NOT NULL,
            month_num   INTEGER NOT NULL,
            budget      REAL NOT NULL,
            actual      REAL NOT NULL,
            PRIMARY KEY (program_id, month_num)
        );
    """)

    # Skip seeding if already populated
    if cur.execute("SELECT COUNT(*) FROM programs").fetchone()[0] > 0:
        conn.close()
        return

    programs = [
        ("P001", "LYNX C2 System",      "FA8650-24-C-1001", "CPFF", "2026-12-31"),
        ("P002", "SHORAD Integration",   "W911QY-25-C-0042", "FFP",  "2027-06-30"),
        ("P003", "TITAN Vehicle Suite",  "N00024-24-C-5510", "T&M",  "2026-09-30"),
    ]
    cur.executemany("INSERT INTO programs VALUES (?,?,?,?,?)", programs)

    cost_elements = [
        "Direct Labor", "Fringe", "Overhead", "ODC", "Travel", "Subcontract", "G&A"
    ]
    cur.executemany("INSERT INTO cost_elements (name) VALUES (?)", [(e,) for e in cost_elements])

    budgets = [
        ("P001", "Direct Labor", 1240000),
        ("P001", "Fringe",        384400),
        ("P001", "Overhead",      558000),
        ("P001", "ODC",           125000),
        ("P001", "Travel",         48000),
        ("P001", "Subcontract",   620000),
        ("P001", "G&A",           197800),

        ("P002", "Direct Labor",  880000),
        ("P002", "Fringe",        272800),
        ("P002", "Overhead",      396000),
        ("P002", "ODC",            72000),
        ("P002", "Travel",         22000),
        ("P002", "Subcontract",   310000),
        ("P002", "G&A",           132400),

        ("P003", "Direct Labor",  560000),
        ("P003", "Fringe",        173600),
        ("P003", "Overhead",      252000),
        ("P003", "ODC",            38000),
        ("P003", "Travel",         15000),
        ("P003", "Subcontract",   180000),
        ("P003", "G&A",            88200),
    ]
    cur.executemany("INSERT INTO budgets VALUES (?,?,?)", budgets)

    actuals = [
        ("P001", "Direct Labor", 1318200),
        ("P001", "Fringe",        408642),
        ("P001", "Overhead",      527100),
        ("P001", "ODC",           113400),
        ("P001", "Travel",         51200),
        ("P001", "Subcontract",   589000),
        ("P001", "G&A",           209800),

        ("P002", "Direct Labor",  796400),
        ("P002", "Fringe",        246884),
        ("P002", "Overhead",      358380),
        ("P002", "ODC",            80150),
        ("P002", "Travel",         19800),
        ("P002", "Subcontract",   334000),
        ("P002", "G&A",           119600),

        ("P003", "Direct Labor",  498200),
        ("P003", "Fringe",        154442),
        ("P003", "Overhead",      224190),
        ("P003", "ODC",            41200),
        ("P003", "Travel",         12400),
        ("P003", "Subcontract",   162000),
        ("P003", "G&A",            79100),
    ]
    cur.executemany("INSERT INTO actuals VALUES (?,?,?)", actuals)

    monthly_burn = [
        # P001 — LYNX C2 System (monthly budget ~$294,583; actuals Jan–May, projections Jun–Dec)
        ("P001", "Jan",  1,  294583, 268200),
        ("P001", "Feb",  2,  294583, 301400),
        ("P001", "Mar",  3,  294583, 287600),
        ("P001", "Apr",  4,  294583, 322100),
        ("P001", "May",  5,  294583, 341042),
        ("P001", "Jun",  6,  294583, 0),
        ("P001", "Jul",  7,  294583, 0),
        ("P001", "Aug",  8,  294583, 0),
        ("P001", "Sep",  9,  294583, 0),
        ("P001", "Oct", 10,  294583, 0),
        ("P001", "Nov", 11,  294583, 0),
        ("P001", "Dec", 12,  294583, 0),

        # P002 — SHORAD Integration (monthly budget ~$173,533; actuals Jan–May, projections Jun–Dec)
        ("P002", "Jan",  1,  173533, 158200),
        ("P002", "Feb",  2,  173533, 181400),
        ("P002", "Mar",  3,  173533, 167800),
        ("P002", "Apr",  4,  173533, 192600),
        ("P002", "May",  5,  173533, 255214),
        ("P002", "Jun",  6,  173533, 0),
        ("P002", "Jul",  7,  173533, 0),
        ("P002", "Aug",  8,  173533, 0),
        ("P002", "Sep",  9,  173533, 0),
        ("P002", "Oct", 10,  173533, 0),
        ("P002", "Nov", 11,  173533, 0),
        ("P002", "Dec", 12,  173533, 0),

        # P003 — TITAN Vehicle Suite (monthly budget ~$140,983; actuals Jan–May, projections Jun–Dec)
        ("P003", "Jan",  1,  140983, 128400),
        ("P003", "Feb",  2,  140983, 134200),
        ("P003", "Mar",  3,  140983, 119800),
        ("P003", "Apr",  4,  140983, 155932),
        ("P003", "May",  5,  140983, 133200),
        ("P003", "Jun",  6,  140983, 0),
        ("P003", "Jul",  7,  140983, 0),
        ("P003", "Aug",  8,  140983, 0),
        ("P003", "Sep",  9,  140983, 0),
        ("P003", "Oct", 10,  140983, 0),
        ("P003", "Nov", 11,  140983, 0),
        ("P003", "Dec", 12,  140983, 0),
    ]
    cur.executemany("INSERT INTO monthly_burn VALUES (?,?,?,?,?)", monthly_burn)

    conn.commit()
    conn.close()
