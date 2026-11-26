import uuid
from datetime import date
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.validation import CI, PersonName, Phone, StrictFlag, descriptive_text
from app.modules.access.models.user import UserRole

PasswordNew = Annotated[str, StringConstraints(min_length=8, max_length=128)]
CredentialText = Annotated[str, Field(min_length=1, max_length=128)]
Direccion = descriptive_text(200)
ProfessionalText = descriptive_text(120)


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ci: str
    nombres: str
    apellidos: str
    correo: EmailStr
    telefono: str
    direccion: str | None
    fecha_nacimiento: date | None
    titulo: str | None
    especialidad: str | None
    plan_estudio_id: UUID | None
    apertura_plan_id: UUID | None
    plan_codigo: str | None
    carrera_codigo: str | None
    carrera_nombre: str | None
    apertura_codigo: str | None
    rol: UserRole
    es_administrador_principal: bool
    activo: bool
    debe_cambiar_contrasena: bool


class LoginInput(StrictInputModel):
    identificador: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)
    ]
    contrasena: CredentialText


class LoginOutput(BaseModel):
    usuario: UserPublic
    debe_cambiar_contrasena: bool


class PasswordChangeInput(StrictInputModel):
    contrasena_actual: CredentialText
    contrasena_nueva: PasswordNew


class UserCreate(StrictInputModel):
    ci: CI
    nombres: PersonName
    apellidos: PersonName
    correo: EmailStr
    telefono: Phone
    direccion: Direccion | None = None
    fecha_nacimiento: date | None = None
    titulo: ProfessionalText | None = None
    especialidad: ProfessionalText | None = None
    plan_estudio_id: UUID | None = None
    apertura_plan_id: UUID | None = None
    rol: UserRole

    @field_validator("correo")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class UserUpdate(StrictInputModel):
    ci: CI | None = None
    nombres: PersonName | None = None
    apellidos: PersonName | None = None
    telefono: Phone | None = None
    direccion: Direccion | None = None
    fecha_nacimiento: date | None = None
    titulo: ProfessionalText | None = None
    especialidad: ProfessionalText | None = None
    plan_estudio_id: UUID | None = None
    apertura_plan_id: UUID | None = None
    activo: StrictFlag | None = None

    @model_validator(mode="after")
    def reject_null_updates(self):
        if any(value is None for value in self.model_dump(exclude_unset=True).values()):
            raise ValueError("Los campos enviados no pueden ser null")
        return self


class ProfileUpdate(BaseModel):
    telefono: Phone


class InitialAdminInput(StrictInputModel):
    ci: CI
    nombres: PersonName
    apellidos: PersonName
    correo: EmailStr
    telefono: Phone
    contrasena: PasswordNew

    @field_validator("correo")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class UserCreated(UserPublic):
    contrasena_temporal: str


class PasswordResetOutput(BaseModel):
    contrasena_temporal: str
