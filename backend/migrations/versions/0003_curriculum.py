"""Create career, subject, and study plan curriculum structures."""

import sqlalchemy as sa
from alembic import op

revision = "0003_curriculum"
down_revision = "0002_force_password_change"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "carreras",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("codigo", sa.String(length=32), nullable=False),
        sa.Column("nombre", sa.String(length=160), nullable=False),
        sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.CheckConstraint("codigo = upper(codigo)", name="ck_carreras_codigo_mayusculas"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo", name="uq_carreras_codigo"),
    )
    op.create_table(
        "materias",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("codigo", sa.String(length=32), nullable=False),
        sa.Column("nombre", sa.String(length=160), nullable=False),
        sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.CheckConstraint("codigo = upper(codigo)", name="ck_materias_codigo_mayusculas"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo", name="uq_materias_codigo"),
    )
    op.create_table(
        "planes_estudio",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("carrera_id", sa.Uuid(), nullable=False),
        sa.Column("codigo", sa.String(length=32), nullable=False),
        sa.Column("modalidad", sa.String(length=16), nullable=False),
        sa.Column("estado", sa.String(length=16), server_default="BORRADOR", nullable=False),
        sa.CheckConstraint("codigo = upper(codigo)", name="ck_planes_codigo_mayusculas"),
        sa.CheckConstraint(
            "modalidad IN ('MODULAR', 'SEMESTRAL')", name="ck_planes_modalidad_valida"
        ),
        sa.CheckConstraint(
            "estado IN ('BORRADOR', 'VIGENTE', 'INACTIVO')", name="ck_planes_estado_valido"
        ),
        sa.ForeignKeyConstraint(["carrera_id"], ["carreras.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo", name="uq_planes_estudio_codigo"),
    )
    op.create_index("ix_planes_estudio_carrera_id", "planes_estudio", ["carrera_id"])
    op.create_table(
        "unidades_plan",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.CheckConstraint("numero > 0", name="ck_unidades_plan_numero_positivo"),
        sa.ForeignKeyConstraint(["plan_id"], ["planes_estudio.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "id", name="uq_unidades_plan_plan_id"),
        sa.UniqueConstraint("plan_id", "numero", name="uq_unidades_plan_numero"),
    )
    op.create_table(
        "materias_plan",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("unidad_id", sa.Uuid(), nullable=False),
        sa.Column("materia_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["materia_id"], ["materias.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["plan_id"], ["planes_estudio.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["plan_id", "unidad_id"],
            ["unidades_plan.plan_id", "unidades_plan.id"],
            name="fk_materias_plan_unidad_del_plan",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "id", name="uq_materias_plan_plan_id"),
        sa.UniqueConstraint("plan_id", "materia_id", name="uq_materias_plan_materia"),
    )
    op.create_table(
        "prerrequisitos_materia_plan",
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("materia_plan_id", sa.Uuid(), nullable=False),
        sa.Column("requisito_materia_plan_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "materia_plan_id <> requisito_materia_plan_id",
            name="ck_prerrequisito_no_autorreferencia",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id", "materia_plan_id"],
            ["materias_plan.plan_id", "materias_plan.id"],
            name="fk_prerrequisito_materia_plan",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id", "requisito_materia_plan_id"],
            ["materias_plan.plan_id", "materias_plan.id"],
            name="fk_prerrequisito_requisito_plan",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("plan_id", "materia_plan_id", "requisito_materia_plan_id"),
    )
    op.add_column("perfiles_estudiante", sa.Column("plan_estudio_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_perfiles_estudiante_plan_estudio",
        "perfiles_estudiante",
        "planes_estudio",
        ["plan_estudio_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_perfiles_estudiante_plan_estudio", "perfiles_estudiante", type_="foreignkey"
    )
    op.drop_column("perfiles_estudiante", "plan_estudio_id")
    op.drop_table("prerrequisitos_materia_plan")
    op.drop_table("materias_plan")
    op.drop_table("unidades_plan")
    op.drop_index("ix_planes_estudio_carrera_id", table_name="planes_estudio")
    op.drop_table("planes_estudio")
    op.drop_table("materias")
    op.drop_table("carreras")
