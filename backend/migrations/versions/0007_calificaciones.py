"""Add one final grade per enrollment."""

import sqlalchemy as sa
from alembic import op

revision = "0007_calificaciones"
down_revision = "0006_habilitaciones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calificaciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("inscripcion_id", sa.Uuid(), nullable=False),
        sa.Column("nota_final", sa.Integer(), nullable=False),
        sa.Column(
            "fecha_registro",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("nota_final BETWEEN 0 AND 100", name="ck_calificacion_nota_rango"),
        sa.ForeignKeyConstraint(["inscripcion_id"], ["inscripciones.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("inscripcion_id", name="uq_calificacion_inscripcion"),
    )


def downgrade() -> None:
    op.drop_table("calificaciones")
