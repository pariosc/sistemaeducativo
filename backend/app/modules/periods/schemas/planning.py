import uuid

from pydantic import BaseModel, ConfigDict


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PeriodCareerInput(StrictInputModel):
    carrera_id: uuid.UUID


class PeriodPlanInput(StrictInputModel):
    plan_id: uuid.UUID


class PlanOpeningInput(StrictInputModel):
    plan_id: uuid.UUID


class PeriodPlanningPublic(BaseModel):
    periodo_id: uuid.UUID
    carrera_ids: list[uuid.UUID]
    plan_ids: list[uuid.UUID]


class PlanProjectionSlot(BaseModel):
    semestre_numero: int
    periodo_id: uuid.UUID | None
    periodo_denominacion: str | None


class PlanOpeningPublic(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    periodo_inicio_id: uuid.UUID
    periodo_denominacion: str
    estudiantes: int
    semestre_proyectado: int | None = None
    proyeccion: list[PlanProjectionSlot]


class SubjectSuggestionPublic(BaseModel):
    materia_plan_id: uuid.UUID
    codigo: str
    nombre: str
    semestre_numero: int
    semestre_nombre: str
    prerrequisitos: list[str]
    paralelos: int
    cohortes_previstas: int
    estudiantes_previstos: int
    aptos: int
    repetidores: int
    bloqueados: int
    sin_nota: int
    aprobados: int
    recomendada: bool
