import uuid
from datetime import date, time
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DiaSemana(StrEnum):
    LUNES = "LUNES"
    MARTES = "MARTES"
    MIERCOLES = "MIERCOLES"
    JUEVES = "JUEVES"
    VIERNES = "VIERNES"
    SABADO = "SABADO"
    DOMINGO = "DOMINGO"


class TipoExcepcionHorario(StrEnum):
    CANCELADA = "CANCELADA"
    REPROGRAMADA = "REPROGRAMADA"


class Aula(Base):
    """Catálogo simple de aulas identificadas por el código visible en campus."""

    __tablename__ = "aulas"
    __table_args__ = (CheckConstraint("codigo = upper(codigo)", name="ck_aula_codigo_mayusculas"),)

    codigo: Mapped[str] = mapped_column(String(120), primary_key=True)
    activa: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )


class BloqueHorario(Base):
    """Franja reusable de un turno; los horarios existentes guardan su propia hora."""

    __tablename__ = "bloques_horario"
    __table_args__ = (
        UniqueConstraint("turno", "nombre", name="uq_bloque_turno_nombre"),
        CheckConstraint("hora_fin > hora_inicio", name="ck_bloque_horario_intervalo_valido"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    turno: Mapped[str] = mapped_column(String(24), nullable=False)
    nombre: Mapped[str] = mapped_column(String(48), nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time, nullable=False)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )


class Curso(Base):
    __tablename__ = "cursos"
    __table_args__ = (
        UniqueConstraint(
            "materia_plan_id", "periodo_id", "paralelo", name="uq_curso_paralelo_materia_periodo"
        ),
        CheckConstraint("cupo > 0", name="ck_curso_cupo_positivo"),
        CheckConstraint("fecha_fin >= fecha_inicio", name="ck_curso_fechas_validas"),
        CheckConstraint("paralelo = upper(paralelo)", name="ck_curso_paralelo_mayusculas"),
        CheckConstraint("activo OR NOT inscripcion_abierta", name="ck_curso_inactivo_cerrado"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    materia_plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("materias_plan.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    periodo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("periodos_academicos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    paralelo: Mapped[str] = mapped_column(String(32), nullable=False)
    cupo: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False)
    docente_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("perfiles_docente.usuario_id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    inscripcion_abierta: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )


class HorarioClase(Base):
    __tablename__ = "horarios_clase"
    __table_args__ = (
        UniqueConstraint(
            "curso_id", "dia_semana", "hora_inicio", "hora_fin", name="uq_horario_curso_entrada"
        ),
        CheckConstraint("hora_fin > hora_inicio", name="ck_horario_intervalo_valido"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    curso_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("cursos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dia_semana: Mapped[DiaSemana] = mapped_column(
        Enum(DiaSemana, name="dia_semana", native_enum=False, length=12), nullable=False
    )
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time, nullable=False)
    aula: Mapped[str | None] = mapped_column(
        String(120), ForeignKey("aulas.codigo", ondelete="RESTRICT"), nullable=True
    )


class FeriadoPeriodo(Base):
    __tablename__ = "feriados_periodo"
    __table_args__ = (UniqueConstraint("periodo_id", "fecha", name="uq_feriado_periodo_fecha"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    periodo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("periodos_academicos.id", ondelete="CASCADE"), nullable=False
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    descripcion: Mapped[str] = mapped_column(String(160), nullable=False)


class ExcepcionHorario(Base):
    __tablename__ = "excepciones_horario"
    __table_args__ = (
        UniqueConstraint("curso_id", "fecha_original", name="uq_excepcion_curso_fecha"),
        CheckConstraint(
            "(tipo = 'CANCELADA' AND fecha_reprogramada IS NULL AND hora_inicio IS NULL "
            "AND hora_fin IS NULL) OR (tipo = 'REPROGRAMADA' AND fecha_reprogramada IS NOT NULL "
            "AND hora_inicio IS NOT NULL "
            "AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)",
            name="ck_excepcion_tipo_campos",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    curso_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("cursos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fecha_original: Mapped[date] = mapped_column(Date, nullable=False)
    tipo: Mapped[TipoExcepcionHorario] = mapped_column(
        Enum(TipoExcepcionHorario, name="tipo_excepcion_horario", native_enum=False, length=16),
        nullable=False,
    )
    fecha_reprogramada: Mapped[date | None] = mapped_column(Date, nullable=True)
    hora_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    hora_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    aula: Mapped[str | None] = mapped_column(
        String(120), ForeignKey("aulas.codigo", ondelete="RESTRICT"), nullable=True
    )
    motivo: Mapped[str | None] = mapped_column(String(240), nullable=True)
