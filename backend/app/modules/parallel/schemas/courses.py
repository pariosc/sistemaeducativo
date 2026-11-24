import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict, model_validator

from app.core.validation import (
    Code,
    PositiveInt,
    StrictFlag,
    descriptive_text,
    ensure_date_order,
    ensure_time_order,
)
from app.modules.curriculum.models.entities import EstadoPlan
from app.modules.parallel.models.entities import DiaSemana, TipoExcepcionHorario

ParallelCode = Code
Description = descriptive_text(160)
AulaText = descriptive_text(120)
ReasonText = descriptive_text(240)


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CourseScheduleInput(StrictInputModel):
    dia_semana: DiaSemana
    hora_inicio: time
    hora_fin: time
    aula: AulaText | None = None

    @model_validator(mode="after")
    def valid_time_range(self):
        ensure_time_order(self.hora_inicio, self.hora_fin)
        return self


class CourseSchedulePublic(BaseModel):
    id: uuid.UUID
    dia_semana: DiaSemana
    hora_inicio: time
    hora_fin: time
    aula: str | None


class CourseCreate(StrictInputModel):
    materia_plan_id: uuid.UUID
    periodo_id: uuid.UUID
    paralelo: ParallelCode
    cupo: PositiveInt
    fecha_inicio: date
    fecha_fin: date
    docente_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def valid_date_range(self):
        ensure_date_order(self.fecha_inicio, self.fecha_fin)
        return self


class CourseUpdate(StrictInputModel):
    paralelo: ParallelCode | None = None
    cupo: PositiveInt | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    docente_id: uuid.UUID | None = None
    activo: StrictFlag | None = None

    @model_validator(mode="after")
    def has_updates(self):
        changes = self.model_dump(exclude_unset=True)
        if not changes:
            raise ValueError("Envía al menos un campo")
        if any(value is None for key, value in changes.items() if key != "docente_id"):
            raise ValueError("Los campos enviados no pueden ser null")
        start = changes.get("fecha_inicio", self.fecha_inicio)
        end = changes.get("fecha_fin", self.fecha_fin)
        if start is not None and end is not None:
            ensure_date_order(start, end)
        return self


class CoursePublic(BaseModel):
    id: uuid.UUID
    materia_plan_id: uuid.UUID
    materia_codigo: str
    materia_nombre: str
    plan_id: uuid.UUID
    plan_codigo: str
    plan_estado: EstadoPlan
    carrera_id: uuid.UUID
    carrera_codigo: str
    carrera_nombre: str
    periodo_id: uuid.UUID
    periodo_denominacion: str
    paralelo: str
    cupo: int
    fecha_inicio: date
    fecha_fin: date
    docente_id: uuid.UUID | None
    docente_nombre: str | None
    inscripcion_abierta: bool
    activo: bool
    horarios: list[CourseSchedulePublic]


class CourseScheduleUpdate(StrictInputModel):
    horarios: list[CourseScheduleInput]

    @model_validator(mode="after")
    def reject_duplicate_schedules(self):
        seen: set[tuple[DiaSemana, time, time]] = set()
        for horario in self.horarios:
            key = (horario.dia_semana, horario.hora_inicio, horario.hora_fin)
            if key in seen:
                raise ValueError("No se pueden repetir franjas horarias idénticas")
            seen.add(key)
        return self


class RegistrationUpdate(StrictInputModel):
    inscripcion_abierta: StrictFlag


class HolidayCreate(StrictInputModel):
    fecha: date
    descripcion: Description


class HolidayPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    periodo_id: uuid.UUID
    fecha: date
    descripcion: str


class ScheduleExceptionCreate(StrictInputModel):
    fecha_original: date
    tipo: TipoExcepcionHorario
    fecha_reprogramada: date | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    aula: AulaText | None = None
    motivo: ReasonText | None = None

    @model_validator(mode="after")
    def validate_exception_fields(self):
        if self.tipo == TipoExcepcionHorario.CANCELADA:
            if any(
                value is not None
                for value in (self.fecha_reprogramada, self.hora_inicio, self.hora_fin, self.aula)
            ):
                raise ValueError("Una sesión cancelada no lleva fecha ni horario de reemplazo")
        else:
            if self.fecha_reprogramada is None or self.hora_inicio is None or self.hora_fin is None:
                raise ValueError("La reprogramación requiere fecha y horas nuevas")
            ensure_time_order(self.hora_inicio, self.hora_fin)
        return self


class ScheduleExceptionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    curso_id: uuid.UUID
    fecha_original: date
    tipo: TipoExcepcionHorario
    fecha_reprogramada: date | None
    hora_inicio: time | None
    hora_fin: time | None
    aula: str | None
    motivo: str | None
