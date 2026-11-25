from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.validation import Code
from app.modules.parallel.schemas.planning import ShiftName


class ModularSubjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    materia_plan_id: UUID
    paralelo: Code
    cupo: int = Field(ge=1)
    docente_id: UUID | None = None
    aula: str = Field(min_length=1, max_length=120)
    clases: int | None = Field(default=None, ge=1, le=366)

    @field_validator("aula")
    @classmethod
    def normalize_room(cls, value: str) -> str:
        return value.strip().upper()


class ModularPlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: UUID
    apertura_plan_id: UUID
    turno: ShiftName
    fecha_inicio: date
    materias: list[ModularSubjectInput] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def unique_subjects(self):
        ids = [item.materia_plan_id for item in self.materias]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada materia debe aparecer una sola vez en la secuencia")
        return self


class ModularModulePreview(BaseModel):
    materia_plan_id: UUID
    paralelo: str
    fecha_inicio: date
    fecha_fin: date
    fechas_clase: list[date]
    clases: int


class ModularPlanPreview(BaseModel):
    periodo_id: UUID
    plantilla_modular_id: UUID
    grupo_id: UUID
    turno: ShiftName
    cabe_en_semestre: bool
    fin_estimado: date
    materias: list[ModularModulePreview]


class ModularBatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    secuencias: list[ModularPlanInput] = Field(min_length=1)


class ModularBatchPreview(BaseModel):
    periodo_id: UUID
    cabe_en_semestre: bool
    secuencias: list[ModularPlanPreview]
