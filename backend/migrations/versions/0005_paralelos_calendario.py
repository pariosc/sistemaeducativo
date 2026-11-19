"""Create parallel offerings, weekly schedules, holidays, and exceptions."""

import sqlalchemy as sa
from alembic import op

revision = "0005_paralelos_calendario"
down_revision = "0004_periodos_academicos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cursos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("materia_plan_id", sa.Uuid(), nullable=False),
        sa.Column("periodo_id", sa.Uuid(), nullable=False),
        sa.Column("paralelo", sa.String(length=32), nullable=False),
        sa.Column("cupo", sa.Integer(), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.Column("docente_id", sa.Uuid(), nullable=True),
        sa.Column("inscripcion_abierta", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.CheckConstraint("cupo > 0", name="ck_curso_cupo_positivo"),
        sa.CheckConstraint("fecha_fin >= fecha_inicio", name="ck_curso_fechas_validas"),
        sa.CheckConstraint("paralelo = upper(paralelo)", name="ck_curso_paralelo_mayusculas"),
        sa.CheckConstraint("activo OR NOT inscripcion_abierta", name="ck_curso_inactivo_cerrado"),
        sa.ForeignKeyConstraint(
            ["docente_id"], ["perfiles_docente.usuario_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["materia_plan_id"], ["materias_plan.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_academicos.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "materia_plan_id", "periodo_id", "paralelo", name="uq_curso_paralelo_materia_periodo"
        ),
    )
    op.create_index("ix_cursos_docente_id", "cursos", ["docente_id"])
    op.create_index("ix_cursos_periodo_id", "cursos", ["periodo_id"])
    op.create_index("ix_cursos_materia_plan_id", "cursos", ["materia_plan_id"])
    op.create_table(
        "horarios_clase",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("curso_id", sa.Uuid(), nullable=False),
        sa.Column("dia_semana", sa.String(length=12), nullable=False),
        sa.Column("hora_inicio", sa.Time(), nullable=False),
        sa.Column("hora_fin", sa.Time(), nullable=False),
        sa.Column("aula", sa.String(length=120), nullable=True),
        sa.CheckConstraint("hora_fin > hora_inicio", name="ck_horario_intervalo_valido"),
        sa.CheckConstraint(
            "dia_semana IN ('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO')",
            name="ck_horario_dia_semana_valido",
        ),
        sa.ForeignKeyConstraint(["curso_id"], ["cursos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "curso_id", "dia_semana", "hora_inicio", "hora_fin", name="uq_horario_curso_entrada"
        ),
    )
    op.create_index("ix_horarios_clase_curso_id", "horarios_clase", ["curso_id"])
    op.create_table(
        "feriados_periodo",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("periodo_id", sa.Uuid(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("descripcion", sa.String(length=160), nullable=False),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_academicos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("periodo_id", "fecha", name="uq_feriado_periodo_fecha"),
    )
    op.create_table(
        "excepciones_horario",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("curso_id", sa.Uuid(), nullable=False),
        sa.Column("fecha_original", sa.Date(), nullable=False),
        sa.Column("tipo", sa.String(length=16), nullable=False),
        sa.Column("fecha_reprogramada", sa.Date(), nullable=True),
        sa.Column("hora_inicio", sa.Time(), nullable=True),
        sa.Column("hora_fin", sa.Time(), nullable=True),
        sa.Column("aula", sa.String(length=120), nullable=True),
        sa.Column("motivo", sa.String(length=240), nullable=True),
        sa.CheckConstraint(
            "(tipo = 'CANCELADA' AND fecha_reprogramada IS NULL AND hora_inicio IS NULL "
            "AND hora_fin IS NULL) OR (tipo = 'REPROGRAMADA' AND fecha_reprogramada IS NOT NULL "
            "AND hora_inicio IS NOT NULL "
            "AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)",
            name="ck_excepcion_tipo_campos",
        ),
        sa.CheckConstraint(
            "tipo IN ('CANCELADA', 'REPROGRAMADA')", name="ck_excepcion_tipo_valido"
        ),
        sa.ForeignKeyConstraint(["curso_id"], ["cursos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("curso_id", "fecha_original", name="uq_excepcion_curso_fecha"),
    )
    op.create_index("ix_excepciones_horario_curso_id", "excepciones_horario", ["curso_id"])


def downgrade() -> None:
    op.drop_index("ix_excepciones_horario_curso_id", table_name="excepciones_horario")
    op.drop_table("excepciones_horario")
    op.drop_table("feriados_periodo")
    op.drop_index("ix_horarios_clase_curso_id", table_name="horarios_clase")
    op.drop_table("horarios_clase")
    op.drop_index("ix_cursos_materia_plan_id", table_name="cursos")
    op.drop_index("ix_cursos_periodo_id", table_name="cursos")
    op.drop_index("ix_cursos_docente_id", table_name="cursos")
    op.drop_table("cursos")
