from pydantic import BaseModel


class Program(BaseModel):
    id: str
    name: str
    contract: str
    type: str
    period_end: str


class VarianceRow(BaseModel):
    cost_element: str
    budget: float
    actual: float
    variance: float
    variance_pct: float
    eac: float


class VarianceResponse(BaseModel):
    program_id: str
    rows: list[VarianceRow]


class BurnMonth(BaseModel):
    month: str
    month_num: int
    budget: float
    actual: float


class BurnResponse(BaseModel):
    program_id: str
    months: list[BurnMonth]


class EACResponse(BaseModel):
    program_id: str
    total_budget: float
    total_actual: float
    cpi: float
    eac: float
    vac: float
    pct_spent: float


class SummaryRow(BaseModel):
    program_id: str
    name: str
    contract: str
    type: str
    total_budget: float
    total_actual: float
    variance: float
    pct_spent: float


class ActualUpdate(BaseModel):
    amount: float
