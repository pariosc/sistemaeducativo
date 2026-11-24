from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ReportPreview(BaseModel):
    code: str
    title: str
    headers: list[str]
    rows: list[list[Any]]
    row_count: int
    generated_at: datetime
