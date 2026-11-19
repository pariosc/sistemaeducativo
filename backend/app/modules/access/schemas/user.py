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

from app.modules.access.models.user import UserRole

CIText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=32)]
PhoneText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=40)]
PasswordText = Annotated[str, StringConstraints(min_length=8, max_length=128)]


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


class LoginInput(BaseModel):
    identificador: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)
    ]
    contrasena: Annotated[str, Field(min_length=1, max_length=128)]


class LoginOutput(BaseModel):
    usuario: UserPublic
    debe_cambiar_contrasena: bool


class PasswordChangeInput(BaseModel):
    contrasena_actual: Annotated[str, Field(min_length=1, max_length=128)]
    contrasena_nueva: PasswordText


class UserCreate(BaseModel):
    ci: CIText
    nombres: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    apellidos: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ]
    correo: EmailStr
    telefono: PhoneText
    rol: UserRole

    @field_validator("correo")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("ci")
    @classmethod
    def normalize_ci(cls, value: str) -> str:
        return value.strip().upper()


class UserUpdate(BaseModel):
    ci: CIText | None = None
    nombres: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
        | None
    ) = None
    apellidos: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
        | None
    ) = None
    activo: bool | None = None

    @model_validator(mode="after")
    def reject_null_updates(self):
        if any(value is None for value in self.model_dump(exclude_unset=True).values()):
            raise ValueError("Los campos enviados no pueden ser null")
        return self

    @field_validator("ci")
    @classmethod
    def normalize_ci(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else value


class ProfileUpdate(BaseModel):
    telefono: PhoneText


class UserCreated(UserPublic):
    contrasena_temporal: str


class PasswordResetOutput(BaseModel):
    contrasena_temporal: str
