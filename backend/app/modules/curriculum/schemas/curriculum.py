import uuid

from pydantic import BaseModel, ConfigDict, model_validator

from app.core.validation import Code, PositiveInt, StrictFlag, descriptive_text
from app.modules.curriculum.models.entities import EstadoPlan, ModalidadPlan

CodeText = Code
NameText = descriptive_text(160)
ShortText = descriptive_text(120)


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CareerCreate(StrictInputModel):
    codigo: CodeText
    nombre: NameText
    facultad_id: uuid.UUID


class CareerUpdate(StrictInputModel):
    codigo: CodeText | None = None
    nombre: NameText | None = None
    activo: StrictFlag | None = None
    facultad_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self


class CareerPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nombre: str
    facultad_id: uuid.UUID
    facultad_codigo: str
    facultad_nombre: str
    activo: bool


class FacultyCreate(StrictInputModel):
    codigo: CodeText
    nombre: NameText


class FacultyUpdate(StrictInputModel):
    codigo: CodeText | None = None
    nombre: NameText | None = None
    activo: StrictFlag | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self


class FacultyPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nombre: str
    activo: bool


class SubjectCreate(StrictInputModel):
    codigo: CodeText
    nombre: NameText


class SubjectUpdate(StrictInputModel):
    codigo: CodeText | None = None
    nombre: NameText | None = None
    activo: StrictFlag | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self


class SubjectPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nombre: str
    activo: bool


class PlanCreate(StrictInputModel):
    carrera_id: uuid.UUID
    codigo: CodeText
    modalidad: ModalidadPlan


class PlanUpdate(StrictInputModel):
    codigo: CodeText | None = None
    estado: EstadoPlan | None = None

    @model_validator(mode="after")
    def require_updates(self):
        values = self.model_dump(exclude_unset=True)
        if not values or any(value is None for value in values.values()):
            raise ValueError("Envía al menos un campo y ninguno puede ser null")
        return self


class UnitCreate(StrictInputModel):
    numero: PositiveInt
    nombre: ShortText


class UnitUpdate(StrictInputModel):
    numero: PositiveInt | None = None
    nombre: ShortText | None = None

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


class PlanSubjectCreate(StrictInputModel):
    materia_id: uuid.UUID
    unidad_id: uuid.UUID


class PlanSubjectUpdate(StrictInputModel):
    unidad_id: uuid.UUID


class PrerequisiteCreate(StrictInputModel):
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


class StudentPlanAssignment(StrictInputModel):
    plan_estudio_id: uuid.UUID


class StudentPlanPublic(BaseModel):
    usuario_id: uuid.UUID
    ci: str
    nombres: str
    apellidos: str
    plan_estudio_id: uuid.UUID | None
    plan_codigo: str | None
    plan_estado: EstadoPlan | None
