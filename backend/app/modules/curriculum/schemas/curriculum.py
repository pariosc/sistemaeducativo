import uuid
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.modules.curriculum.models.entities import EstadoPlan, ModalidadPlan

CodeText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
NameText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class CareerCreate(BaseModel):
    codigo: CodeText
    nombre: NameText
    facultad_id: uuid.UUID

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str) -> str:
        return value.upper()


class CareerUpdate(BaseModel):
    codigo: CodeText | None = None
    nombre: NameText | None = None
    activo: bool | None = None
    facultad_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class CareerPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nombre: str
    facultad_id: uuid.UUID
    facultad_codigo: str
    facultad_nombre: str
    activo: bool


class FacultyCreate(BaseModel):
    codigo: CodeText
    nombre: NameText

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str) -> str:
        return value.upper()


class FacultyUpdate(BaseModel):
    codigo: CodeText | None = None
    nombre: NameText | None = None
    activo: bool | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class FacultyPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nombre: str
    activo: bool


class SubjectCreate(BaseModel):
    codigo: CodeText
    nombre: NameText

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str) -> str:
        return value.upper()


class SubjectUpdate(BaseModel):
    codigo: CodeText | None = None
    nombre: NameText | None = None
    activo: bool | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class SubjectPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nombre: str
    activo: bool


class PlanCreate(BaseModel):
    carrera_id: uuid.UUID
    codigo: CodeText
    modalidad: ModalidadPlan

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str) -> str:
        return value.upper()


class PlanUpdate(BaseModel):
    codigo: CodeText | None = None
    estado: EstadoPlan | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self

    @field_validator("codigo")
    @classmethod
    def uppercase_code(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class UnitCreate(BaseModel):
    numero: Annotated[int, Field(gt=0)]
    nombre: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class UnitUpdate(BaseModel):
    numero: Annotated[int, Field(gt=0)] | None = None
    nombre: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
        | None
    ) = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self


class UnitPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    numero: int
    nombre: str


class PlanSubjectCreate(BaseModel):
    materia_id: uuid.UUID
    unidad_id: uuid.UUID


class PlanSubjectUpdate(BaseModel):
    unidad_id: uuid.UUID


class PrerequisiteCreate(BaseModel):
    requisito_materia_plan_id: uuid.UUID


class PlanSubjectPublic(BaseModel):
    id: uuid.UUID
    materia_id: uuid.UUID
    codigo: str
    nombre: str
    prerrequisitos: list[uuid.UUID]


class UnitWithSubjects(UnitPublic):
    materias: list[PlanSubjectPublic]


class PlanPublic(BaseModel):
    id: uuid.UUID
    carrera_id: uuid.UUID
    carrera_codigo: str
    carrera_nombre: str
    codigo: str
    modalidad: ModalidadPlan
    estado: EstadoPlan
    unidades: list[UnitWithSubjects]


class StudentPlanAssignment(BaseModel):
    plan_estudio_id: uuid.UUID


class StudentPlanPublic(BaseModel):
    usuario_id: uuid.UUID
    ci: str
    nombres: str
    apellidos: str
    plan_estudio_id: uuid.UUID | None
    plan_codigo: str | None
    plan_estado: EstadoPlan | None
