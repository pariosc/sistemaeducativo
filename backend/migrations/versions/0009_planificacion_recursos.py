"""Add classroom and reusable schedule block catalogs."""

import sqlalchemy as sa
from alembic import op

revision = "0009_planificacion_recursos"
down_revision = "0008_facultades"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "aulas",
        sa.Column("codigo", sa.String(length=120), nullable=False),
        sa.Column("activa", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.CheckConstraint("codigo = upper(codigo)", name="ck_aula_codigo_mayusculas"),
        sa.PrimaryKeyConstraint("codigo"),
    )
    # Preserve the room labels already used in schedules and exceptions.
    op.execute(
        """INSERT INTO aulas (codigo, activa)
        SELECT DISTINCT upper(trim(aula)), true FROM (
            SELECT aula FROM horarios_clase UNION ALL SELECT aula FROM excepciones_horario
        ) AS existentes WHERE aula IS NOT NULL AND trim(aula) <> ''
        ON CONFLICT (codigo) DO NOTHING"""
    )
    op.execute(
        "UPDATE horarios_clase SET aula = upper(trim(aula)) "
        "WHERE aula IS NOT NULL AND aula <> upper(trim(aula))"
    )
    op.execute(
        "UPDATE excepciones_horario SET aula = upper(trim(aula)) "
        "WHERE aula IS NOT NULL AND aula <> upper(trim(aula))"
    )
    op.create_foreign_key(
        "fk_horarios_clase_aula_codigo",
        "horarios_clase",
        "aulas",
        ["aula"],
        ["codigo"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_excepciones_horario_aula_codigo",
        "excepciones_horario",
        "aulas",
        ["aula"],
        ["codigo"],
        ondelete="RESTRICT",
    )
    op.create_table(
        "bloques_horario",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("turno", sa.String(length=24), nullable=False),
        sa.Column("nombre", sa.String(length=48), nullable=False),
        sa.Column("hora_inicio", sa.Time(), nullable=False),
        sa.Column("hora_fin", sa.Time(), nullable=False),
        sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.CheckConstraint("hora_fin > hora_inicio", name="ck_bloque_horario_intervalo_valido"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("turno", "nombre", name="uq_bloque_turno_nombre"),
    )


def downgrade() -> None:
    op.drop_table("bloques_horario")
    op.drop_constraint(
        "fk_excepciones_horario_aula_codigo", "excepciones_horario", type_="foreignkey"
    )
    op.drop_constraint("fk_horarios_clase_aula_codigo", "horarios_clase", type_="foreignkey")
    op.drop_table("aulas")
