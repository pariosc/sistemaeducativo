import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TipoNotificacion(StrEnum):
    INSCRIPCION = "INSCRIPCION"
    CAMBIO_HORARIO = "CAMBIO_HORARIO"
    CALIFICACION = "CALIFICACION"
    GENERAL = "GENERAL"


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destinatario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    curso_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("cursos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tipo: Mapped[TipoNotificacion] = mapped_column(
        Enum(TipoNotificacion, name="tipo_notificacion", native_enum=False, length=20),
        nullable=False,
    )
    titulo: Mapped[str] = mapped_column(String(160), nullable=False)
    mensaje: Mapped[str] = mapped_column(String(500), nullable=False)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    leida: Mapped[bool] = mapped_column(nullable=False, default=False, server_default=text("false"))
