import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Calificacion(Base):
    __tablename__ = "calificaciones"
    __table_args__ = (
        UniqueConstraint("inscripcion_id", name="uq_calificacion_inscripcion"),
        CheckConstraint("nota_final BETWEEN 0 AND 100", name="ck_calificacion_nota_rango"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inscripcion_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("inscripciones.id", ondelete="RESTRICT"), nullable=False
    )
    nota_final: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha_registro: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
