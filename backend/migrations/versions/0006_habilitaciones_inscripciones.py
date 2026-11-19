"""Add student authorizations, enrollments, and enrollment notifications."""

import sqlalchemy as sa
from alembic import op

revision = "0006_habilitaciones"
down_revision = "0005_paralelos_calendario"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "habilitaciones_inscripcion",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("estudiante_id", sa.Uuid(), nullable=False),
        sa.Column("periodo_id", sa.Uuid(), nullable=False),
        sa.Column("activa", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "origen",
            sa.String(length=16),
            server_default="ADMINISTRADOR",
            nullable=False,
        ),
        sa.Column(
            "fecha_autorizacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("autorizada_por_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["autorizada_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["estudiante_id"], ["perfiles_estudiante.usuario_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_academicos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "estudiante_id", "periodo_id", name="uq_habilitacion_estudiante_periodo"
        ),
    )
    op.create_index(
        "ix_habilitaciones_inscripcion_estudiante_id",
        "habilitaciones_inscripcion",
        ["estudiante_id"],
    )
    op.create_index(
        "ix_habilitaciones_inscripcion_periodo_id",
        "habilitaciones_inscripcion",
        ["periodo_id"],
    )
    op.create_table(
        "inscripciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("estudiante_id", sa.Uuid(), nullable=False),
        sa.Column("curso_id", sa.Uuid(), nullable=False),
        sa.Column(
            "fecha_inscripcion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("estado", sa.String(length=16), server_default="ACTIVA", nullable=False),
        sa.CheckConstraint("estado IN ('ACTIVA', 'RETIRADA')", name="ck_inscripcion_estado_valido"),
        sa.ForeignKeyConstraint(["curso_id"], ["cursos.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["estudiante_id"], ["perfiles_estudiante.usuario_id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("estudiante_id", "curso_id", name="uq_inscripcion_estudiante_curso"),
    )
    op.create_index("ix_inscripciones_estudiante_id", "inscripciones", ["estudiante_id"])
    op.create_index("ix_inscripciones_curso_id", "inscripciones", ["curso_id"])
    op.create_table(
        "notificaciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("destinatario_id", sa.Uuid(), nullable=False),
        sa.Column("curso_id", sa.Uuid(), nullable=True),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("titulo", sa.String(length=160), nullable=False),
        sa.Column("mensaje", sa.String(length=500), nullable=False),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("leida", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(["curso_id"], ["cursos.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["destinatario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notificaciones_destinatario_id", "notificaciones", ["destinatario_id"])
    op.create_index("ix_notificaciones_curso_id", "notificaciones", ["curso_id"])


def downgrade() -> None:
    op.drop_index("ix_notificaciones_curso_id", table_name="notificaciones")
    op.drop_index("ix_notificaciones_destinatario_id", table_name="notificaciones")
    op.drop_table("notificaciones")
    op.drop_index("ix_inscripciones_curso_id", table_name="inscripciones")
    op.drop_index("ix_inscripciones_estudiante_id", table_name="inscripciones")
    op.drop_table("inscripciones")
    op.drop_index(
        "ix_habilitaciones_inscripcion_periodo_id", table_name="habilitaciones_inscripcion"
    )
    op.drop_index(
        "ix_habilitaciones_inscripcion_estudiante_id", table_name="habilitaciones_inscripcion"
    )
    op.drop_table("habilitaciones_inscripcion")
