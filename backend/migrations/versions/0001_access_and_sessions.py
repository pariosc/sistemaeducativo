"""Create users, role profiles, and revocable sessions."""

import sqlalchemy as sa
from alembic import op

revision = "0001_access_sessions"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usuarios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("ci", sa.String(length=32), nullable=False),
        sa.Column("nombres", sa.String(length=120), nullable=False),
        sa.Column("apellidos", sa.String(length=120), nullable=False),
        sa.Column("correo", sa.String(length=254), nullable=False),
        sa.Column("telefono", sa.String(length=40), nullable=False),
        sa.Column("contrasena_hash", sa.String(length=512), nullable=False),
        sa.Column(
            "rol",
            sa.Enum(
                "ADMINISTRADOR",
                "DOCENTE",
                "ESTUDIANTE",
                name="rol_usuario",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "es_administrador_principal", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "debe_cambiar_contrasena", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "creado_en", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "NOT es_administrador_principal OR rol = 'ADMINISTRADOR'",
            name="ck_principal_es_administrador",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ci", name="uq_usuarios_ci"),
        sa.UniqueConstraint("correo", name="uq_usuarios_correo"),
    )
    op.create_index(
        "uq_unico_administrador_principal",
        "usuarios",
        ["es_administrador_principal"],
        unique=True,
        postgresql_where=sa.text("es_administrador_principal"),
    )
    op.create_table(
        "perfiles_docente",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("usuario_id"),
    )
    op.create_table(
        "perfiles_estudiante",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("usuario_id"),
    )
    op.create_table(
        "sesiones_autenticacion",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "fecha_inicio", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("fecha_expiracion", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revocada_en", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_sesiones_autenticacion_usuario_id", "sesiones_autenticacion", ["usuario_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_sesiones_autenticacion_usuario_id", table_name="sesiones_autenticacion")
    op.drop_table("sesiones_autenticacion")
    op.drop_table("perfiles_estudiante")
    op.drop_table("perfiles_docente")
    op.drop_index("uq_unico_administrador_principal", table_name="usuarios")
    op.drop_table("usuarios")
