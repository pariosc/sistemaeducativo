import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictInt

GradeValue = Annotated[StrictInt, Field(ge=0, le=100)]


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GradeInput(StrictInputModel):
    nota_final: GradeValue


class GradeWorkItem(BaseModel):
    inscripcion_id: uuid.UUID
    estudiante_id: uuid.UUID
    estudiante_ci: str
    estudiante_nombre: str
    materia_codigo: str
    materia_nombre: str
    paralelo: str
    periodo_denominacion: str
    nota_final: int | None
    fecha_registro: datetime | None


class GradePublic(BaseModel):
    id: uuid.UUID
    inscripcion_id: uuid.UUID
    estudiante_id: uuid.UUID
    materia_codigo: str
    materia_nombre: str
    paralelo: str
    periodo_denominacion: str
    nota_final: int
    fecha_registro: datetime
