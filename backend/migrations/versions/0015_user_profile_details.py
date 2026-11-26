"""Add searchable personal, professional and academic details to user accounts."""

import sqlalchemy as sa
from alembic import op

revision = "0015_user_profile_details"
down_revision = "0014_group_trajectory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usuarios", sa.Column("direccion", sa.String(200), nullable=True))
    op.add_column("usuarios", sa.Column("fecha_nacimiento", sa.Date(), nullable=True))
    op.add_column("perfiles_docente", sa.Column("titulo", sa.String(120), nullable=True))
    op.add_column("perfiles_docente", sa.Column("especialidad", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("perfiles_docente", "especialidad")
    op.drop_column("perfiles_docente", "titulo")
    op.drop_column("usuarios", "fecha_nacimiento")
    op.drop_column("usuarios", "direccion")
