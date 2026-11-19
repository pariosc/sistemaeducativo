from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.modules.curriculum.models.entities import PlanEstudio


class UserRole(StrEnum):
    ADMINISTRADOR = "ADMINISTRADOR"
    DOCENTE = "DOCENTE"
    ESTUDIANTE = "ESTUDIANTE"


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        UniqueConstraint("ci", name="uq_usuarios_ci"),
        UniqueConstraint("correo", name="uq_usuarios_correo"),
        CheckConstraint(
            "NOT es_administrador_principal OR rol = 'ADMINISTRADOR'",
            name="ck_principal_es_administrador",
        ),
        Index(
            "uq_unico_administrador_principal",
            "es_administrador_principal",
            unique=True,
            postgresql_where=text("es_administrador_principal"),
            sqlite_where=text("es_administrador_principal = 1"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ci: Mapped[str] = mapped_column(String(32), nullable=False)
    nombres: Mapped[str] = mapped_column(String(120), nullable=False)
    apellidos: Mapped[str] = mapped_column(String(120), nullable=False)
    correo: Mapped[str] = mapped_column(String(254), nullable=False)
    telefono: Mapped[str] = mapped_column(String(40), nullable=False)
    contrasena_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    rol: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="rol_usuario", native_enum=False, length=20), nullable=False
    )
    es_administrador_principal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    debe_cambiar_contrasena: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sesiones: Mapped[list[SesionAutenticacion]] = relationship(
        back_populates="usuario", cascade="all, delete-orphan"
    )
    perfil_docente: Mapped[PerfilDocente | None] = relationship(
        back_populates="usuario", cascade="all, delete-orphan", uselist=False
    )
    perfil_estudiante: Mapped[PerfilEstudiante | None] = relationship(
        back_populates="usuario", cascade="all, delete-orphan", uselist=False
    )


class PerfilDocente(Base):
    __tablename__ = "perfiles_docente"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    usuario: Mapped[Usuario] = relationship(back_populates="perfil_docente")


class PerfilEstudiante(Base):
    __tablename__ = "perfiles_estudiante"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    plan_estudio_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("planes_estudio.id", ondelete="RESTRICT"), nullable=True
    )
    usuario: Mapped[Usuario] = relationship(back_populates="perfil_estudiante")
    plan_estudio: Mapped[PlanEstudio | None] = relationship(back_populates="estudiantes")


class SesionAutenticacion(Base):
    __tablename__ = "sesiones_autenticacion"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    fecha_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    fecha_expiracion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revocada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    usuario: Mapped[Usuario] = relationship(back_populates="sesiones")
