import uuid
from datetime import datetime

from pydantic import BaseModel

from app.modules.enrollments.models.entities import EstadoInscripcion, OrigenHabilitacion
from app.modules.parallel.schemas.courses import CoursePublic


class AuthorizationUpdate(BaseModel):
    activa: bool


class AuthorizationPublic(BaseModel):
    id: uuid.UUID | None
    estudiante_id: uuid.UUID
    estudiante_ci: str
    estudiante_nombre: str
    periodo_id: uuid.UUID
    habilitada: bool
    origen: OrigenHabilitacion | None
    fecha_autorizacion: datetime | None


class EnrollmentCreate(BaseModel):
    curso_id: uuid.UUID


class PrerequisitePending(BaseModel):
    materia_plan_id: uuid.UUID
    codigo: str
    nombre: str


class CourseOffer(BaseModel):
    curso: CoursePublic
    semestre_numero: int
    semestre_nombre: str
    cupos_disponibles: int
    inscrito: bool
    prerrequisitos_pendientes: list[PrerequisitePending]


class EnrollmentPublic(BaseModel):
    id: uuid.UUID
    curso_id: uuid.UUID
    fecha_inscripcion: datetime
    estado: EstadoInscripcion
    curso: CoursePublic
