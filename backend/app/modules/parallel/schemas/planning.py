from datetime import time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.validation import StrictFlag, ensure_time_order

ShiftName = Literal["MADRUGADA", "MANANA", "TARDE", "NOCHE"]


class RoomCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9 -]*$")
    capacidad: int = Field(ge=1)


class RoomUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    activa: StrictFlag | None = None
    capacidad: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def valid_update(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un valor no nulo")
        return self


class RoomPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    codigo: str
    capacidad: int | None
    activa: bool


class ScheduleBlockCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    turno: ShiftName
    nombre: str = Field(min_length=1, max_length=48)
    hora_inicio: time
    hora_fin: time
    predeterminado_modular: StrictFlag = False

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
    predeterminado_modular: StrictFlag | None = None

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
    predeterminado_modular: bool


class ModularTemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nombre: str = Field(min_length=1, max_length=120)
    clases_por_modulo: int = Field(ge=1, le=366)
    minutos_por_clase: int = Field(ge=1, le=1439)


class ModularTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    clases_por_modulo: int | None = Field(default=None, ge=1, le=366)
    minutos_por_clase: int | None = Field(default=None, ge=1, le=1439)
    activa: StrictFlag | None = None

    @model_validator(mode="after")
    def valid_update(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un valor no nulo")
        return self


class ModularTemplatePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    nombre: str
    clases_por_modulo: int
    minutos_por_clase: int
    activa: bool
