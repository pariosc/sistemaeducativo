"""Create academic periods."""

import sqlalchemy as sa
from alembic import op

revision = "0004_periodos_academicos"
down_revision = "0003_curriculum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "periodos_academicos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("denominacion", sa.String(length=160), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.CheckConstraint("fecha_fin >= fecha_inicio", name="ck_periodos_fechas_validas"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("periodos_academicos")
