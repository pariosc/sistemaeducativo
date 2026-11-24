"""Select careers and plans per period and register plan start groups."""

import sqlalchemy as sa
from alembic import op

revision = "0010_aperturas_plan"
down_revision = "0009_planificacion_recursos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "periodos_carreras",
        sa.Column("periodo_id", sa.Uuid(), nullable=False),
        sa.Column("carrera_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_academicos.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["carrera_id"], ["carreras.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("periodo_id", "carrera_id"),
    )
    op.create_table(
        "periodos_planes",
        sa.Column("periodo_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_academicos.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["plan_id"], ["planes_estudio.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("periodo_id", "plan_id"),
    )
    op.create_table(
        "aperturas_plan",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("periodo_inicio_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["planes_estudio.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["periodo_inicio_id"], ["periodos_academicos.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "periodo_inicio_id", name="uq_apertura_plan_periodo_inicio"),
    )
    op.add_column("perfiles_estudiante", sa.Column("apertura_plan_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_perfil_estudiante_apertura_plan",
        "perfiles_estudiante",
        "aperturas_plan",
        ["apertura_plan_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    # Preserve existing offers when the new explicit participation rule starts.
    op.execute(
        """INSERT INTO periodos_carreras (periodo_id, carrera_id)
        SELECT DISTINCT cursos.periodo_id, planes_estudio.carrera_id
        FROM cursos
        JOIN materias_plan ON materias_plan.id = cursos.materia_plan_id
        JOIN planes_estudio ON planes_estudio.id = materias_plan.plan_id
        ON CONFLICT DO NOTHING"""
    )
    op.execute(
        """INSERT INTO periodos_planes (periodo_id, plan_id)
        SELECT DISTINCT cursos.periodo_id, materias_plan.plan_id
        FROM cursos JOIN materias_plan ON materias_plan.id = cursos.materia_plan_id
        ON CONFLICT DO NOTHING"""
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_perfil_estudiante_apertura_plan", "perfiles_estudiante", type_="foreignkey"
    )
    op.drop_column("perfiles_estudiante", "apertura_plan_id")
    op.drop_table("aperturas_plan")
    op.drop_table("periodos_planes")
    op.drop_table("periodos_carreras")
