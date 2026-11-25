"""Add reusable modular templates and group-aware course planning."""

import sqlalchemy as sa
from alembic import op

revision = "0012_modular_planning"
down_revision = "0011_curriculum_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plantillas_modulares",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("clases_por_modulo", sa.Integer(), nullable=False),
        sa.Column("minutos_por_clase", sa.Integer(), nullable=False),
        sa.Column("activa", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.CheckConstraint("clases_por_modulo > 0", name="ck_plantilla_clases_positivas"),
        sa.CheckConstraint("minutos_por_clase > 0", name="ck_plantilla_minutos_positivos"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nombre"),
    )
    op.add_column(
        "bloques_horario",
        sa.Column(
            "predeterminado_modular", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.create_index(
        "uq_bloque_predeterminado_modular_turno",
        "bloques_horario",
        ["turno"],
        unique=True,
        postgresql_where=sa.text("predeterminado_modular = true"),
        sqlite_where=sa.text("predeterminado_modular = true"),
    )
    op.add_column("periodos_academicos", sa.Column("plantilla_modular_id", sa.Uuid()))
    op.create_foreign_key(
        "fk_periodo_plantilla_modular",
        "periodos_academicos",
        "plantillas_modulares",
        ["plantilla_modular_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.add_column("cursos", sa.Column("apertura_plan_id", sa.Uuid()))
    op.add_column("cursos", sa.Column("plantilla_modular_id", sa.Uuid()))
    op.add_column("cursos", sa.Column("turno_modular", sa.String(length=24)))
    op.add_column("cursos", sa.Column("clases_objetivo", sa.Integer()))
    op.create_index("ix_cursos_apertura_plan_id", "cursos", ["apertura_plan_id"])
    op.create_foreign_key(
        "fk_curso_apertura_plan",
        "cursos",
        "aperturas_plan",
        ["apertura_plan_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_curso_plantilla_modular",
        "cursos",
        "plantillas_modulares",
        ["plantilla_modular_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_curso_turno_modular_valido",
        "cursos",
        "turno_modular IS NULL OR turno_modular IN ('MADRUGADA', 'MANANA', 'TARDE', 'NOCHE')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_curso_turno_modular_valido", "cursos", type_="check")
    op.drop_constraint("fk_curso_plantilla_modular", "cursos", type_="foreignkey")
    op.drop_constraint("fk_curso_apertura_plan", "cursos", type_="foreignkey")
    op.drop_index("ix_cursos_apertura_plan_id", table_name="cursos")
    op.drop_column("cursos", "clases_objetivo")
    op.drop_column("cursos", "turno_modular")
    op.drop_column("cursos", "plantilla_modular_id")
    op.drop_column("cursos", "apertura_plan_id")
    op.drop_constraint("fk_periodo_plantilla_modular", "periodos_academicos", type_="foreignkey")
    op.drop_column("periodos_academicos", "plantilla_modular_id")
    op.drop_index("uq_bloque_predeterminado_modular_turno", table_name="bloques_horario")
    op.drop_column("bloques_horario", "predeterminado_modular")
    op.drop_table("plantillas_modulares")
