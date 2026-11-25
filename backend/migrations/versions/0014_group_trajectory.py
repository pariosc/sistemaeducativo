"""Give intake groups stable codes and semester-to-period assignments."""

import re

import sqlalchemy as sa
from alembic import op

revision = "0014_group_trajectory"
down_revision = "0013_room_capacity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("aperturas_plan", sa.Column("codigo", sa.String(120), nullable=True))
    op.add_column("aperturas_plan", sa.Column("carrera_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint(
        "uq_planes_estudio_id_carrera", "planes_estudio", ["id", "carrera_id"]
    )
    op.create_table(
        "semestres_grupo",
        sa.Column("apertura_plan_id", sa.Uuid(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("periodo_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint("numero > 0", name="ck_semestre_grupo_numero_positivo"),
        sa.ForeignKeyConstraint(["apertura_plan_id"], ["aperturas_plan.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_academicos.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("apertura_plan_id", "numero"),
        sa.UniqueConstraint("apertura_plan_id", "periodo_id", name="uq_semestre_grupo_periodo"),
    )
    db = op.get_bind()
    periods = (
        db.execute(
            sa.text(
                "SELECT id, fecha_inicio, fecha_fin FROM periodos_academicos "
                "ORDER BY fecha_inicio, id"
            )
        )
        .mappings()
        .all()
    )
    by_id = {str(period["id"]): period for period in periods}
    openings = (
        db.execute(
            sa.text(
                "SELECT a.id, a.plan_id, a.periodo_inicio_id, pe.carrera_id, "
                "c.codigo AS carrera_codigo, "
                "p.denominacion FROM aperturas_plan a "
                "JOIN planes_estudio pe ON pe.id = a.plan_id "
                "JOIN carreras c ON c.id = pe.carrera_id "
                "JOIN periodos_academicos p ON p.id = a.periodo_inicio_id "
                "ORDER BY p.fecha_inicio, a.id"
            )
        )
        .mappings()
        .all()
    )
    duplicated_careers = db.execute(
        sa.text(
            "SELECT pe.carrera_id, a.periodo_inicio_id "
            "FROM aperturas_plan a JOIN planes_estudio pe ON pe.id = a.plan_id "
            "GROUP BY pe.carrera_id, a.periodo_inicio_id HAVING count(*) > 1"
        )
    ).first()
    if duplicated_careers:
        raise RuntimeError(
            "Hay más de un grupo de una carrera en un mismo semestre; revisar antes de migrar"
        )
    used_codes: set[str] = set()
    for opening in openings:
        prefix = f"{opening['carrera_codigo']}-{opening['denominacion']}"
        base = re.sub(r"[^A-Z0-9]+", "-", prefix.upper()).strip("-")[:108].rstrip("-")
        number = 1
        while f"{base}-G{number}" in used_codes:
            number += 1
        code = f"{base}-G{number}"
        used_codes.add(code)
        db.execute(
            sa.text(
                "UPDATE aperturas_plan SET codigo = :code, carrera_id = :career_id WHERE id = :id"
            ),
            {"code": code, "career_id": opening["carrera_id"], "id": opening["id"]},
        )
        duration = (
            db.scalar(
                sa.text("SELECT max(numero) FROM unidades_plan WHERE plan_id = :plan_id"),
                {"plan_id": opening["plan_id"]},
            )
            or 0
        )
        previous = by_id[str(opening["periodo_inicio_id"])]
        used_periods = {str(previous["id"])}
        for semester in range(1, int(duration) + 1):
            if semester == 1:
                period_id = opening["periodo_inicio_id"]
            else:
                candidate = next(
                    (
                        period
                        for period in periods
                        if str(period["id"]) not in used_periods
                        and period["fecha_inicio"] > previous["fecha_fin"]
                    ),
                    None,
                )
                period_id = candidate["id"] if candidate else None
                if candidate:
                    previous = candidate
                    used_periods.add(str(candidate["id"]))
            db.execute(
                sa.text(
                    "INSERT INTO semestres_grupo (apertura_plan_id, numero, periodo_id) "
                    "VALUES (:opening_id, :semester, :period_id)"
                ),
                {
                    "opening_id": opening["id"],
                    "semester": semester,
                    "period_id": period_id,
                },
            )
    op.alter_column("aperturas_plan", "codigo", nullable=False)
    op.alter_column("aperturas_plan", "carrera_id", nullable=False)
    op.create_unique_constraint("uq_apertura_plan_codigo", "aperturas_plan", ["codigo"])
    op.create_unique_constraint(
        "uq_apertura_carrera_periodo", "aperturas_plan", ["carrera_id", "periodo_inicio_id"]
    )
    op.drop_constraint("aperturas_plan_plan_id_fkey", "aperturas_plan", type_="foreignkey")
    op.create_foreign_key(
        "fk_apertura_plan_carrera",
        "aperturas_plan",
        "planes_estudio",
        ["plan_id", "carrera_id"],
        ["id", "carrera_id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_apertura_plan_carrera", "aperturas_plan", type_="foreignkey")
    op.create_foreign_key(
        "aperturas_plan_plan_id_fkey",
        "aperturas_plan",
        "planes_estudio",
        ["plan_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint("uq_apertura_carrera_periodo", "aperturas_plan", type_="unique")
    op.drop_constraint("uq_apertura_plan_codigo", "aperturas_plan", type_="unique")
    op.drop_table("semestres_grupo")
    op.drop_column("aperturas_plan", "carrera_id")
    op.drop_column("aperturas_plan", "codigo")
    op.drop_constraint("uq_planes_estudio_id_carrera", "planes_estudio", type_="unique")
