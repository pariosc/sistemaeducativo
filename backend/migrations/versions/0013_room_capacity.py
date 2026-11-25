"""Store physical classroom capacity without guessing legacy room sizes."""

import sqlalchemy as sa
from alembic import op

revision = "0013_room_capacity"
down_revision = "0012_modular_planning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("aulas", sa.Column("capacidad", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_aula_capacidad_positiva", "aulas", "capacidad IS NULL OR capacidad > 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_aula_capacidad_positiva", "aulas", type_="check")
    op.drop_column("aulas", "capacidad")
