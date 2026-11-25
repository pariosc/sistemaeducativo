"""Physical room limits used by every course scheduling path."""

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.parallel.models.entities import (
    Aula,
    Curso,
    ExcepcionHorario,
    FeriadoPeriodo,
    HorarioClase,
    TipoExcepcionHorario,
)
from app.modules.parallel.services.calendar import WEEKDAY_NUMBER


def validate_room(db: Session, code: str, cupo: int, *, allow_unconfigured: bool = False) -> None:
    room = db.get(Aula, code)
    if not room or not room.activa:
        raise HTTPException(status_code=422, detail=f"El aula {code} no está activa")
    if room.capacidad is None:
        if allow_unconfigured:
            return
        raise HTTPException(
            status_code=409, detail=f"Define la capacidad física del aula {code} antes de usarla"
        )
    if cupo > room.capacidad:
        raise HTTPException(
            status_code=409,
            detail=f"El cupo {cupo} supera la capacidad {room.capacidad} del aula {code}",
        )


def replacement_room(exception: ExcepcionHorario, schedules: list[HorarioClase]) -> str | None:
    if exception.aula:
        return exception.aula
    rooms = {
        schedule.aula
        for schedule in schedules
        if WEEKDAY_NUMBER[schedule.dia_semana] == exception.fecha_original.weekday()
    }
    return next(iter(rooms)) if len(rooms) == 1 else None


def validate_course_rooms(
    db: Session,
    course: Curso,
    *,
    require_all: bool = False,
    allow_unconfigured: bool = False,
) -> None:
    schedules = list(
        db.scalars(select(HorarioClase).where(HorarioClase.curso_id == course.id)).all()
    )
    if require_all and not schedules:
        raise HTTPException(
            status_code=409, detail="Agrega un horario antes de abrir inscripciones"
        )
    for schedule in schedules:
        if schedule.aula is None:
            if require_all:
                raise HTTPException(
                    status_code=409,
                    detail="Asigna un aula a cada horario antes de abrir inscripciones",
                )
            continue
        validate_room(db, schedule.aula, course.cupo, allow_unconfigured=allow_unconfigured)
    exceptions = db.scalars(
        select(ExcepcionHorario).where(
            ExcepcionHorario.curso_id == course.id,
            ExcepcionHorario.tipo == TipoExcepcionHorario.REPROGRAMADA,
        )
    ).all()
    for exception in exceptions:
        code = replacement_room(exception, schedules)
        if code is None:
            if require_all:
                raise HTTPException(
                    status_code=409,
                    detail="Asigna un aula a cada clase reprogramada antes de abrir inscripciones",
                )
            continue
        validate_room(db, code, course.cupo, allow_unconfigured=allow_unconfigured)


def uses_room_from(db: Session, course: Curso, code: str, from_date: date) -> bool:
    """Check actual future dates, including holiday and exception changes."""
    if not course.activo:
        return False
    schedules = list(
        db.scalars(select(HorarioClase).where(HorarioClase.curso_id == course.id)).all()
    )
    exceptions = list(
        db.scalars(select(ExcepcionHorario).where(ExcepcionHorario.curso_id == course.id)).all()
    )
    cancelled_dates = {exception.fecha_original for exception in exceptions}
    holidays = set(
        db.scalars(
            select(FeriadoPeriodo.fecha).where(FeriadoPeriodo.periodo_id == course.periodo_id)
        ).all()
    )
    current = max(course.fecha_inicio, from_date)
    while current <= course.fecha_fin:
        if (
            current not in holidays
            and current not in cancelled_dates
            and any(
                schedule.aula == code and WEEKDAY_NUMBER[schedule.dia_semana] == current.weekday()
                for schedule in schedules
            )
        ):
            return True
        current += timedelta(days=1)
    return any(
        exception.tipo == TipoExcepcionHorario.REPROGRAMADA
        and exception.fecha_reprogramada is not None
        and exception.fecha_reprogramada >= from_date
        and replacement_room(exception, schedules) == code
        for exception in exceptions
    )
