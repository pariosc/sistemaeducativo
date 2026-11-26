"""Genera vistas legibles del esquema PostgreSQL 0014 inspeccionado en vivo."""

from __future__ import annotations

import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCHEMA = json.loads((ROOT / "postgres_schema_0014.json").read_text())
FKS = json.loads((ROOT / "postgres_fks_0014.json").read_text())

VIEWS = {
    "curriculo": [
        "facultades", "carreras", "planes_estudio", "unidades_plan",
    ],
    "malla": [
        "materias", "materias_plan", "prerrequisitos_materia_plan",
    ],
    "grupos": [
        "periodos_carreras", "periodos_planes", "aperturas_plan",
        "semestres_grupo",
    ],
    "calendario": [
        "periodos_academicos", "plantillas_modulares", "bloques_horario",
        "feriados_periodo",
    ],
    "oferta": [
        "aulas", "cursos", "horarios_clase", "excepciones_horario",
    ],
    "acceso": [
        "usuarios", "perfiles_docente", "perfiles_estudiante",
        "sesiones_autenticacion",
    ],
    "resultados": [
        "habilitaciones_inscripcion",
        "inscripciones", "calificaciones", "notificaciones",
    ],
}

COLORS = {
    "curriculo": ("#eaf1fc", "#315a8d"),
    "malla": ("#eaf1fc", "#315a8d"),
    "grupos": ("#eaf1fc", "#315a8d"),
    "calendario": ("#eaf7ee", "#2d7d53"),
    "oferta": ("#eaf7ee", "#2d7d53"),
    "acceso": ("#f3edfc", "#72519c"),
    "resultados": ("#f3edfc", "#72519c"),
}

PRIMARY = {(k["table"], k["column"]) for k in SCHEMA["keys"] if k["kind"] == "PRIMARY KEY"}
FOREIGN = {(f["from_table"], c) for f in FKS for c in f["from_columns"]}
COLUMNS = {}
for col in SCHEMA["columns"]:
    COLUMNS.setdefault(col["table"], []).append(col)


def label(table: str, view: str, stub: bool = False) -> str:
    fill, stroke = COLORS[view]
    if stub:
        return (
            f'<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" '
            f'COLOR="#9aa8b5" BGCOLOR="#f5f7f9" CELLPADDING="6">'
            f'<TR><TD><FONT POINT-SIZE="13">{html.escape(table)} ↗</FONT></TD></TR></TABLE>'
        )
    rows = [
        f'<TR><TD COLSPAN="2" BGCOLOR="{fill}"><FONT COLOR="{stroke}" '
        f'POINT-SIZE="15"><B>{html.escape(table)}</B></FONT></TD></TR>'
    ]
    columns = COLUMNS[table]
    key_cols = [c for c in columns if (table, c["column"]) in PRIMARY | FOREIGN]
    ordinary = [c for c in columns if c not in key_cols]
    shown = key_cols + ordinary[:3]
    for col in shown:
        name = col["column"]
        is_primary = (table, name) in PRIMARY
        is_foreign = (table, name) in FOREIGN
        kind = "PK/FK" if is_primary and is_foreign else "PK" if is_primary else "FK" if is_foreign else ""
        typ = col["type"].replace("character varying", "varchar").replace("timestamp with time zone", "timestamptz").replace("USER-DEFINED", "enum")
        if len(typ) > 14:
            typ = typ[:12] + "…"
        rows.append(
            f'<TR><TD ALIGN="LEFT"><FONT POINT-SIZE="11">{kind} {html.escape(name)}</FONT></TD>'
            f'<TD ALIGN="LEFT"><FONT POINT-SIZE="10" COLOR="#526174">{html.escape(typ)}</FONT></TD></TR>'
        )
    omitted = len(ordinary) - min(len(ordinary), 3)
    if omitted:
        rows.append(f'<TR><TD COLSPAN="2" ALIGN="LEFT"><FONT POINT-SIZE="10" COLOR="#6e7a88">+{omitted} atributos</FONT></TD></TR>')
    return (
        f'<TABLE BORDER="1" CELLBORDER="1" CELLSPACING="0" '
        f'COLOR="{stroke}" BGCOLOR="white" CELLPADDING="4">'
        + "".join(rows)
        + "</TABLE>"
    )


def build(view: str, tables: list[str]) -> None:
    included = set(tables)
    # Each foreign key appears in the view containing its source table.
    related = [f for f in FKS if f["from_table"] in included]
    stubs = {f["to_table"] for f in related if f["to_table"] not in included}
    title = {
        "curriculo": "PostgreSQL 0014 · currículo",
        "malla": "PostgreSQL 0014 · materias y prerrequisitos",
        "grupos": "PostgreSQL 0014 · grupos y planes por periodo",
        "calendario": "PostgreSQL 0014 · periodos y calendario",
        "oferta": "PostgreSQL 0014 · paralelos y aulas",
        "acceso": "PostgreSQL 0014 · usuarios y sesiones",
        "resultados": "PostgreSQL 0014 · inscripciones, notas y avisos",
    }[view]
    out = [
        "digraph ERD {",
        f'graph [label="{title}", labelloc=t, fontsize=22, fontname="DejaVu Sans", '
        'rankdir=TB, splines=polyline, nodesep=0.55, ranksep=0.75, pad=0.25, bgcolor="white"];',
        'node [shape=plain, fontname="DejaVu Sans"];',
        'edge [color="#68788c", arrowsize=0.7, penwidth=1.25];',
    ]
    for table in tables:
        out.append(f'"{table}" [label=<{label(table, view)}>];')
    for table in sorted(stubs):
        out.append(f'"{table}" [label=<{label(table, view, True)}>, style=dashed];')
    for fk in related:
        src, dst = fk["from_table"], fk["to_table"]
        composite = len(fk["from_columns"]) > 1
        attrs = 'arrowhead="vee"'
        if composite:
            joined_columns = ", ".join(fk["from_columns"])
            attrs += f', label="({joined_columns})", fontsize=10'
        if dst in stubs:
            attrs += ', style=dashed'
        out.append(f'"{src}" -> "{dst}" [{attrs}];')
    out.append("}")
    source = ROOT / f"erd_postgres_{view}.dot"
    source.write_text("\n".join(out) + "\n")
    subprocess.run(["dot", "-Tpng", "-Gdpi=240", str(source), "-o", str(source.with_suffix(".png"))], check=True)


if __name__ == "__main__":
    for name, tables in VIEWS.items():
        build(name, tables)
    assert set().union(*(set(t) for t in VIEWS.values())) == set(SCHEMA["tables"])
    print(f"{len(SCHEMA['tables'])} tablas y {len(FKS)} claves foráneas en siete vistas")
