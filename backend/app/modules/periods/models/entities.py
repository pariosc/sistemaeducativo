import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PeriodoAcademico(Base):
    __tablename__ = "periodos_academicos"
    __table_args__ = (
        CheckConstraint("fecha_fin >= fecha_inicio", name="ck_periodos_fechas_validas"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    denominacion: Mapped[str] = mapped_column(String(160), nullable=False)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False)
