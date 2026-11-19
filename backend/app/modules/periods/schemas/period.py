import uuid
from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

Denomination = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
]


class PeriodCreate(BaseModel):
    denominacion: Denomination
    fecha_inicio: date
    fecha_fin: date

    @model_validator(mode="after")
    def valid_date_range(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final no puede ser anterior a la fecha inicial")
        return self


class PeriodPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    denominacion: str
    fecha_inicio: date
    fecha_fin: date
