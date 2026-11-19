"""Add faculties and require one faculty for each career."""

import sqlalchemy as sa
from alembic import op

revision = "0008_facultades"
down_revision = "0007_calificaciones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "facultades",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("codigo", sa.String(length=32), nullable=False),
        sa.Column("nombre", sa.String(length=160), nullable=False),
        sa.Column("activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.CheckConstraint("codigo = upper(codigo)", name="ck_facultades_codigo_mayusculas"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo", name="uq_facultades_codigo"),
    )
    op.add_column("carreras", sa.Column("facultad_id", sa.Uuid(), nullable=True))
    op.create_index("ix_carreras_facultad_id", "carreras", ["facultad_id"])
    connection = op.get_bind()
    careers_exist = connection.scalar(sa.text("SELECT EXISTS (SELECT 1 FROM carreras)"))
    if careers_exist:
        faculty_id = connection.execute(
            sa.text(
                "INSERT INTO facultades (id, codigo, nombre, activo) "
                "VALUES (:id, 'PENDIENTE', 'Facultad pendiente de asignación', true) RETURNING id"
            ),
            {"id": "00000000-0000-0000-0000-000000000008"},
        ).scalar_one()
        connection.execute(
            sa.text("UPDATE carreras SET facultad_id = :faculty_id WHERE facultad_id IS NULL"),
            {"faculty_id": faculty_id},
        )
    op.alter_column("carreras", "facultad_id", nullable=False)
    op.create_foreign_key(
        "fk_carreras_facultad_id_facultades",
        "carreras",
        "facultades",
        ["facultad_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_carreras_facultad_id_facultades", "carreras", type_="foreignkey")
    op.drop_index("ix_carreras_facultad_id", table_name="carreras")
    op.drop_column("carreras", "facultad_id")
    op.drop_table("facultades")
