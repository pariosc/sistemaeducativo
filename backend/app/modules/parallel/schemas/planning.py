from datetime import time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.validation import StrictFlag, ensure_time_order

ShiftName = Literal["MADRUGADA", "MANANA", "TARDE", "NOCHE"]


class RoomCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9 -]*$")


class RoomUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    activa: StrictFlag


class RoomPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    codigo: str
    activa: bool


class ScheduleBlockCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    turno: ShiftName
    nombre: str = Field(min_length=1, max_length=48)
    hora_inicio: time
    hora_fin: time

    @model_validator(mode="after")
    def valid_range(self):
        ensure_time_order(self.hora_inicio, self.hora_fin)
        return self


class ScheduleBlockUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    turno: ShiftName | None = None
    nombre: str | None = Field(default=None, min_length=1, max_length=48)
    hora_inicio: time | None = None
    hora_fin: time | None = None
    activo: StrictFlag | None = None

    @model_validator(mode="after")
    def valid_update(self):
        values = self.model_dump(exclude_unset=True)
        if not values:
            raise ValueError("Envía al menos un campo")
        if any(value is None for value in values.values()):
            raise ValueError("Los campos enviados no pueden ser null")
        if ("hora_inicio" in values) != ("hora_fin" in values):
            raise ValueError("Envía hora_inicio y hora_fin juntas")
        if "hora_inicio" in values:
            ensure_time_order(values["hora_inicio"], values["hora_fin"])
        return self


class ScheduleBlockPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    turno: str
    nombre: str
    hora_inicio: time
    hora_fin: time
    activo: bool
