import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, UniqueConstraint, Uuid
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


class PeriodoCarrera(Base):
    __tablename__ = "periodos_carreras"

    periodo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("periodos_academicos.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    carrera_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("carreras.id", ondelete="RESTRICT"), primary_key=True
    )


class PeriodoPlan(Base):
    __tablename__ = "periodos_planes"

    periodo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("periodos_academicos.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("planes_estudio.id", ondelete="RESTRICT"), primary_key=True
    )


class AperturaPlan(Base):
    """Grupo que inició un plan en un periodo; el plan puede tener varios inicios."""

    __tablename__ = "aperturas_plan"
    __table_args__ = (
        UniqueConstraint("plan_id", "periodo_inicio_id", name="uq_apertura_plan_periodo_inicio"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("planes_estudio.id", ondelete="RESTRICT"), nullable=False
    )
    periodo_inicio_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("periodos_academicos.id", ondelete="RESTRICT"),
        nullable=False,
    )
