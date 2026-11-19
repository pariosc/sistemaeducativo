from __future__ import annotations

import uuid
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.modules.access.models.user import PerfilEstudiante


class ModalidadPlan(StrEnum):
    MODULAR = "MODULAR"
    SEMESTRAL = "SEMESTRAL"


class EstadoPlan(StrEnum):
    BORRADOR = "BORRADOR"
    VIGENTE = "VIGENTE"
    INACTIVO = "INACTIVO"


class Facultad(Base):
    __tablename__ = "facultades"
    __table_args__ = (
        UniqueConstraint("codigo", name="uq_facultades_codigo"),
        CheckConstraint("codigo = upper(codigo)", name="ck_facultades_codigo_mayusculas"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(32), nullable=False)
    nombre: Mapped[str] = mapped_column(String(160), nullable=False)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    carreras: Mapped[list[Carrera]] = relationship(back_populates="facultad")


class Carrera(Base):
    __tablename__ = "carreras"
    __table_args__ = (
        UniqueConstraint("codigo", name="uq_carreras_codigo"),
        CheckConstraint("codigo = upper(codigo)", name="ck_carreras_codigo_mayusculas"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(32), nullable=False)
    nombre: Mapped[str] = mapped_column(String(160), nullable=False)
    facultad_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("facultades.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    planes: Mapped[list[PlanEstudio]] = relationship(back_populates="carrera")
    facultad: Mapped[Facultad] = relationship(back_populates="carreras")

    @property
    def facultad_codigo(self) -> str:
        return self.facultad.codigo

    @property
    def facultad_nombre(self) -> str:
        return self.facultad.nombre


class Materia(Base):
    __tablename__ = "materias"
    __table_args__ = (
        UniqueConstraint("codigo", name="uq_materias_codigo"),
        CheckConstraint("codigo = upper(codigo)", name="ck_materias_codigo_mayusculas"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(32), nullable=False)
    nombre: Mapped[str] = mapped_column(String(160), nullable=False)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    incorporaciones: Mapped[list[MateriaPlan]] = relationship(back_populates="materia")


class PlanEstudio(Base):
    __tablename__ = "planes_estudio"
    __table_args__ = (
        UniqueConstraint("codigo", name="uq_planes_estudio_codigo"),
        CheckConstraint("codigo = upper(codigo)", name="ck_planes_codigo_mayusculas"),
        CheckConstraint("modalidad IN ('MODULAR', 'SEMESTRAL')", name="ck_planes_modalidad_valida"),
        CheckConstraint(
            "estado IN ('BORRADOR', 'VIGENTE', 'INACTIVO')", name="ck_planes_estado_valido"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    carrera_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("carreras.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    codigo: Mapped[str] = mapped_column(String(32), nullable=False)
    modalidad: Mapped[ModalidadPlan] = mapped_column(
        Enum(ModalidadPlan, name="modalidad_plan", native_enum=False, length=16), nullable=False
    )
    estado: Mapped[EstadoPlan] = mapped_column(
        Enum(EstadoPlan, name="estado_plan", native_enum=False, length=16),
        nullable=False,
        default=EstadoPlan.BORRADOR,
        server_default=EstadoPlan.BORRADOR.value,
    )
    carrera: Mapped[Carrera] = relationship(back_populates="planes")
    unidades: Mapped[list[UnidadPlan]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="UnidadPlan.numero"
    )
    materias_plan: Mapped[list[MateriaPlan]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", overlaps="unidad"
    )
    estudiantes: Mapped[list[PerfilEstudiante]] = relationship(back_populates="plan_estudio")


class UnidadPlan(Base):
    __tablename__ = "unidades_plan"
    __table_args__ = (
        UniqueConstraint("plan_id", "numero", name="uq_unidades_plan_numero"),
        UniqueConstraint("plan_id", "id", name="uq_unidades_plan_plan_id"),
        CheckConstraint("numero > 0", name="ck_unidades_plan_numero_positivo"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("planes_estudio.id", ondelete="CASCADE"), nullable=False
    )
    numero: Mapped[int] = mapped_column(nullable=False)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    plan: Mapped[PlanEstudio] = relationship(back_populates="unidades")
    materias_plan: Mapped[list[MateriaPlan]] = relationship(
        back_populates="unidad", foreign_keys="MateriaPlan.unidad_id", overlaps="plan"
    )


class MateriaPlan(Base):
    __tablename__ = "materias_plan"
    __table_args__ = (
        UniqueConstraint("plan_id", "materia_id", name="uq_materias_plan_materia"),
        UniqueConstraint("plan_id", "id", name="uq_materias_plan_plan_id"),
        ForeignKeyConstraint(
            ["plan_id", "unidad_id"],
            ["unidades_plan.plan_id", "unidades_plan.id"],
            ondelete="CASCADE",
            name="fk_materias_plan_unidad_del_plan",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("planes_estudio.id", ondelete="CASCADE"), nullable=False
    )
    unidad_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    materia_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("materias.id", ondelete="RESTRICT"), nullable=False
    )
    plan: Mapped[PlanEstudio] = relationship(back_populates="materias_plan", overlaps="unidad")
    unidad: Mapped[UnidadPlan] = relationship(
        back_populates="materias_plan", foreign_keys=[unidad_id], overlaps="plan"
    )
    materia: Mapped[Materia] = relationship(back_populates="incorporaciones")


class Prerrequisito(Base):
    __tablename__ = "prerrequisitos_materia_plan"
    __table_args__ = (
        ForeignKeyConstraint(
            ["plan_id", "materia_plan_id"],
            ["materias_plan.plan_id", "materias_plan.id"],
            ondelete="CASCADE",
            name="fk_prerrequisito_materia_plan",
        ),
        ForeignKeyConstraint(
            ["plan_id", "requisito_materia_plan_id"],
            ["materias_plan.plan_id", "materias_plan.id"],
            ondelete="CASCADE",
            name="fk_prerrequisito_requisito_plan",
        ),
        CheckConstraint(
            "materia_plan_id <> requisito_materia_plan_id",
            name="ck_prerrequisito_no_autorreferencia",
        ),
    )

    plan_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    materia_plan_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    requisito_materia_plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True
    )
