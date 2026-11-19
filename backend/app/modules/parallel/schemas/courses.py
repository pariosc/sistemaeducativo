import uuid
from datetime import date, time
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.modules.curriculum.models.entities import EstadoPlan
from app.modules.parallel.models.entities import DiaSemana, TipoExcepcionHorario

ParallelCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class CourseScheduleInput(BaseModel):
    dia_semana: DiaSemana
    hora_inicio: time
    hora_fin: time
    aula: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
        | None
    ) = None

    @model_validator(mode="after")
    def valid_time_range(self):
        if self.hora_fin <= self.hora_inicio:
            raise ValueError("La hora final debe ser posterior a la hora inicial")
        return self


class CourseSchedulePublic(BaseModel):
    id: uuid.UUID
    dia_semana: DiaSemana
    hora_inicio: time
    hora_fin: time
    aula: str | None


class CourseCreate(BaseModel):
    materia_plan_id: uuid.UUID
    periodo_id: uuid.UUID
    paralelo: ParallelCode
    cupo: Annotated[int, Field(gt=0)]
    fecha_inicio: date
    fecha_fin: date
    docente_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def valid_date_range(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final no puede ser anterior a la fecha inicial")
        return self


class CourseUpdate(BaseModel):
    paralelo: ParallelCode | None = None
    cupo: Annotated[int, Field(gt=0)] | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    docente_id: uuid.UUID | None = None
    activo: bool | None = None

    @model_validator(mode="after")
    def has_updates(self):
        changes = self.model_dump(exclude_unset=True)
        if not changes:
            raise ValueError("Envía al menos un campo")
        if any(value is None for key, value in changes.items() if key != "docente_id"):
            raise ValueError("Los campos enviados no pueden ser null")
        return self


class CoursePublic(BaseModel):
    id: uuid.UUID
    materia_plan_id: uuid.UUID
    materia_codigo: str
    materia_nombre: str
    plan_codigo: str
    plan_estado: EstadoPlan
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


class CourseScheduleUpdate(BaseModel):
    horarios: list[CourseScheduleInput]


class RegistrationUpdate(BaseModel):
    inscripcion_abierta: bool


class HolidayCreate(BaseModel):
    fecha: date
    descripcion: Description


class HolidayPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    periodo_id: uuid.UUID
    fecha: date
    descripcion: str


class ScheduleExceptionCreate(BaseModel):
    fecha_original: date
    tipo: TipoExcepcionHorario
    fecha_reprogramada: date | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    aula: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
        | None
    ) = None
    motivo: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
        | None
    ) = None

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
            if self.hora_fin <= self.hora_inicio:
                raise ValueError("La hora final debe ser posterior a la hora inicial")
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
