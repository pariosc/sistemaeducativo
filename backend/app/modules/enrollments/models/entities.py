import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OrigenHabilitacion(StrEnum):
    ADMINISTRADOR = "ADMINISTRADOR"
    SISTEMA = "SISTEMA"


class EstadoInscripcion(StrEnum):
    ACTIVA = "ACTIVA"
    RETIRADA = "RETIRADA"


class HabilitacionInscripcion(Base):
    __tablename__ = "habilitaciones_inscripcion"
    __table_args__ = (
        UniqueConstraint("estudiante_id", "periodo_id", name="uq_habilitacion_estudiante_periodo"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estudiante_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("perfiles_estudiante.usuario_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    periodo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("periodos_academicos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activa: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    origen: Mapped[OrigenHabilitacion] = mapped_column(
        Enum(OrigenHabilitacion, name="origen_habilitacion", native_enum=False, length=16),
        nullable=False,
        default=OrigenHabilitacion.ADMINISTRADOR,
        server_default=OrigenHabilitacion.ADMINISTRADOR.value,
    )
    fecha_autorizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    autorizada_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class Inscripcion(Base):
    __tablename__ = "inscripciones"
    __table_args__ = (
        UniqueConstraint("estudiante_id", "curso_id", name="uq_inscripcion_estudiante_curso"),
        CheckConstraint("estado IN ('ACTIVA', 'RETIRADA')", name="ck_inscripcion_estado_valido"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estudiante_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("perfiles_estudiante.usuario_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    curso_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("cursos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    fecha_inscripcion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    estado: Mapped[EstadoInscripcion] = mapped_column(
        Enum(EstadoInscripcion, name="estado_inscripcion", native_enum=False, length=16),
        nullable=False,
        default=EstadoInscripcion.ACTIVA,
        server_default=EstadoInscripcion.ACTIVA.value,
    )
