import uuid
from datetime import date

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
    Uuid,
)
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
    plantilla_modular_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("plantillas_modulares.id", ondelete="RESTRICT"),
        nullable=True,
    )


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
        UniqueConstraint("carrera_id", "periodo_inicio_id", name="uq_apertura_carrera_periodo"),
        UniqueConstraint("codigo", name="uq_apertura_plan_codigo"),
        ForeignKeyConstraint(
            ["plan_id", "carrera_id"],
            ["planes_estudio.id", "planes_estudio.carrera_id"],
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(120), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    carrera_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    periodo_inicio_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("periodos_academicos.id", ondelete="RESTRICT"),
        nullable=False,
    )


class SemestreGrupo(Base):
    """Asignación estable de cada semestre curricular de un grupo a un periodo."""

    __tablename__ = "semestres_grupo"
    __table_args__ = (
        UniqueConstraint("apertura_plan_id", "periodo_id", name="uq_semestre_grupo_periodo"),
        CheckConstraint("numero > 0", name="ck_semestre_grupo_numero_positivo"),
    )

    apertura_plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("aperturas_plan.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    numero: Mapped[int] = mapped_column(primary_key=True)
    periodo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("periodos_academicos.id", ondelete="RESTRICT"), nullable=True
    )
