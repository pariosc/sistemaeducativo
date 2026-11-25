from datetime import date, time
from uuid import UUID

from pydantic import BaseModel


class CalendarSessionPublic(BaseModel):
    curso_id: UUID
    fecha: date
    hora_inicio: time
    hora_fin: time
    aula: str | None
    reprogramada: bool


class PlanningBookingPublic(CalendarSessionPublic):
    materia_codigo: str
    materia_nombre: str
    paralelo: str
    docente_id: UUID | None
    docente_nombre: str | None
    carrera_nombre: str
    fecha_inicio_curso: date
    fecha_fin_curso: date
