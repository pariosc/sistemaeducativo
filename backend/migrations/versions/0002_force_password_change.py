"""Require all existing accounts to change their password on next access."""

from alembic import op

revision = "0002_force_password_change"
down_revision = "0001_access_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE usuarios SET debe_cambiar_contrasena = TRUE")


def downgrade() -> None:
    op.execute("UPDATE usuarios SET debe_cambiar_contrasena = FALSE")
