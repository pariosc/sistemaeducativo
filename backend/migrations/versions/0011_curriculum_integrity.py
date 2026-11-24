"""Add curriculum indexes used by usage checks and catalog counts."""

from alembic import op

revision = "0011_curriculum_integrity"
down_revision = "0010_aperturas_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_materias_plan_materia_id", "materias_plan", ["materia_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_materias_plan_materia_id", table_name="materias_plan")
