import uuid
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.validation import CI, PersonName, Phone, StrictFlag
from app.modules.access.models.user import UserRole

PasswordNew = Annotated[str, StringConstraints(min_length=8, max_length=128)]
CredentialText = Annotated[str, Field(min_length=1, max_length=128)]


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
