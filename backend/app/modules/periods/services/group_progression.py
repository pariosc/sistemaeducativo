"""Stable semester slots for one plan intake group."""

import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.curriculum.models.entities import Carrera, PlanEstudio, UnidadPlan
from app.modules.periods.models.entities import AperturaPlan, PeriodoAcademico, SemestreGrupo


def group_code(db: Session, plan: PlanEstudio, period: PeriodoAcademico) -> str:
    career = db.get(Carrera, plan.carrera_id)
    prefix = f"{career.codigo if career else plan.codigo}-{period.denominacion}"
    base = re.sub(r"[^A-Z0-9]+", "-", prefix.upper()).strip("-")[:108].rstrip("-")
    used = set(
        db.scalars(select(AperturaPlan.codigo).where(AperturaPlan.codigo.like(f"{base}-G%")))
    )
    number = 1
    while f"{base}-G{number}" in used:
        number += 1
    return f"{base}-G{number}"


def group_slots(db: Session, opening: AperturaPlan) -> list[SemestreGrupo]:
    slots = db.scalars(
        select(SemestreGrupo)
        .where(SemestreGrupo.apertura_plan_id == opening.id)
        .order_by(SemestreGrupo.numero)
    ).all()
    if slots:
        return list(slots)
    duration = int(
        db.scalar(select(func.max(UnidadPlan.numero)).where(UnidadPlan.plan_id == opening.plan_id))
        or 0
    )
    slots = [
        SemestreGrupo(
            apertura_plan_id=opening.id,
            numero=number,
            periodo_id=opening.periodo_inicio_id if number == 1 else None,
        )
        for number in range(1, duration + 1)
    ]
    db.add_all(slots)
    db.flush()
    return slots


def fill_group_slots(db: Session, opening: AperturaPlan) -> None:
    """Fill empty slots in date order; never move an already assigned semester."""
    slots = group_slots(db, opening)
    periods = db.scalars(
        select(PeriodoAcademico).order_by(PeriodoAcademico.fecha_inicio, PeriodoAcademico.id)
    ).all()
    by_id = {period.id: period for period in periods}
    used = {slot.periodo_id for slot in slots if slot.periodo_id}
    previous: PeriodoAcademico | None = None
    for slot in slots:
        if slot.periodo_id:
            previous = by_id[slot.periodo_id]
            continue
        if previous is None:
            break
        candidate = next(
            (
                period
                for period in periods
                if period.id not in used and period.fecha_inicio > previous.fecha_fin
            ),
            None,
        )
        if candidate is None:
            break
        slot.periodo_id = candidate.id
        used.add(candidate.id)
        previous = candidate


def fill_all_group_slots(db: Session) -> None:
    for opening in db.scalars(select(AperturaPlan)).all():
        fill_group_slots(db, opening)


def group_period_number(db: Session, opening: AperturaPlan, period_id) -> int | None:
    return db.scalar(
        select(SemestreGrupo.numero).where(
            SemestreGrupo.apertura_plan_id == opening.id,
            SemestreGrupo.periodo_id == period_id,
        )
    )
