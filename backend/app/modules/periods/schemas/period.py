import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, model_validator

from app.core.validation import descriptive_text, ensure_date_order

Denomination = descriptive_text(160)


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PeriodCreate(StrictInputModel):
    denominacion: Denomination
    fecha_inicio: date
    fecha_fin: date

    @model_validator(mode="after")
    def valid_date_range(self):
        ensure_date_order(self.fecha_inicio, self.fecha_fin)
        return self


class PeriodPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    denominacion: str
    fecha_inicio: date
    fecha_fin: date
