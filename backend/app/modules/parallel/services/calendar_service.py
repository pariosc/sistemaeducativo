"""Dated administrative calendar for all courses in an academic semester."""

from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.access.models.user import UserRole, Usuario
from app.modules.curriculum.models.entities import Carrera, Materia, MateriaPlan, PlanEstudio
from app.modules.enrollments.models.entities import EstadoInscripcion, Inscripcion
from app.modules.parallel.models.entities import (
    Curso,
    ExcepcionHorario,
    FeriadoPeriodo,
    HorarioClase,
    TipoExcepcionHorario,
)
from app.modules.parallel.schemas.calendar import CalendarSessionPublic, PlanningBookingPublic
from app.modules.parallel.services.calendar import WEEKDAY_NUMBER
from app.modules.parallel.services.room_capacity import replacement_room
from app.modules.periods.models.entities import PeriodoAcademico


def period_week(
    db: Session, period_id: UUID, week_start: date, course_ids: set[UUID] | None = None
) -> list[CalendarSessionPublic]:
    period = db.get(PeriodoAcademico, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Semestre académico no encontrado")
    week_end = week_start + timedelta(days=6)
    query = select(Curso).where(Curso.periodo_id == period_id, Curso.activo.is_(True))
    if course_ids is not None:
        query = query.where(Curso.id.in_(course_ids))
    courses = db.scalars(query).all()
    if not courses:
        return []
    course_ids = [course.id for course in courses]
    schedules: dict[UUID, list[HorarioClase]] = defaultdict(list)
    exceptions: dict[UUID, list[ExcepcionHorario]] = defaultdict(list)
    for slot in db.scalars(select(HorarioClase).where(HorarioClase.curso_id.in_(course_ids))):
        schedules[slot.curso_id].append(slot)
    for exception in db.scalars(
        select(ExcepcionHorario).where(ExcepcionHorario.curso_id.in_(course_ids))
    ):
        exceptions[exception.curso_id].append(exception)
    holidays = set(
        db.scalars(select(FeriadoPeriodo.fecha).where(FeriadoPeriodo.periodo_id == period_id))
    )
    result: list[CalendarSessionPublic] = []
    for course in courses:
        original_exceptions = {item.fecha_original for item in exceptions[course.id]}
        current = max(week_start, course.fecha_inicio, period.fecha_inicio)
        end = min(week_end, course.fecha_fin, period.fecha_fin)
        while current <= end:
            if current not in holidays and current not in original_exceptions:
                result.extend(
                    CalendarSessionPublic(
                        curso_id=course.id,
                        fecha=current,
                        hora_inicio=slot.hora_inicio,
                        hora_fin=slot.hora_fin,
                        aula=slot.aula,
                        reprogramada=False,
                    )
                    for slot in schedules[course.id]
                    if WEEKDAY_NUMBER[slot.dia_semana] == current.weekday()
                )
            current += timedelta(days=1)
        for exception in exceptions[course.id]:
            if (
                exception.tipo != TipoExcepcionHorario.REPROGRAMADA
                or exception.fecha_reprogramada is None
                or exception.hora_inicio is None
                or exception.hora_fin is None
                or not week_start <= exception.fecha_reprogramada <= week_end
            ):
                continue
            result.append(
                CalendarSessionPublic(
                    curso_id=course.id,
                    fecha=exception.fecha_reprogramada,
                    hora_inicio=exception.hora_inicio,
                    hora_fin=exception.hora_fin,
                    aula=replacement_room(exception, schedules[course.id]),
                    reprogramada=True,
                )
            )
    return sorted(result, key=lambda item: (item.fecha, item.hora_inicio, str(item.curso_id)))


def personal_week(db: Session, user: Usuario, week_start: date) -> list[CalendarSessionPublic]:
    """Effective classes assigned to the teacher or actively enrolled student."""
    query = select(Curso.id, Curso.periodo_id).where(Curso.activo.is_(True))
    if user.rol == UserRole.DOCENTE:
        query = query.where(Curso.docente_id == user.id)
    else:
        query = query.join(Inscripcion, Inscripcion.curso_id == Curso.id).where(
            Inscripcion.estudiante_id == user.id, Inscripcion.estado == EstadoInscripcion.ACTIVA
        )
    by_period: dict[UUID, set[UUID]] = defaultdict(set)
    for course_id, period_id in db.execute(query):
        by_period[period_id].add(course_id)
    sessions = [
        session
        for period_id, course_ids in by_period.items()
        for session in period_week(db, period_id, week_start, course_ids)
    ]
    return sorted(sessions, key=lambda item: (item.fecha, item.hora_inicio, str(item.curso_id)))


def availability_day(db: Session, target: date) -> list[CalendarSessionPublic]:
    """Show effective sessions from every academic period on one date."""
    period_ids = db.scalars(
        select(PeriodoAcademico.id).where(
            PeriodoAcademico.fecha_inicio <= target,
            PeriodoAcademico.fecha_fin >= target,
        )
    ).all()
    sessions = (
        session
        for period_id in period_ids
        for session in period_week(db, period_id, target)
        if session.fecha == target
    )
    return sorted(sessions, key=lambda item: (item.hora_inicio, str(item.curso_id)))


def availability_range(db: Session, start: date, end: date) -> list[PlanningBookingPublic]:
    """Effective bookings across all academic periods overlapping a planning range."""
    if end < start:
        raise HTTPException(
            status_code=422, detail="La fecha final debe ser igual o posterior a la inicial"
        )
    periods = db.scalars(
        select(PeriodoAcademico).where(
            PeriodoAcademico.fecha_inicio <= end,
            PeriodoAcademico.fecha_fin >= start,
        )
    ).all()
    sessions: list[CalendarSessionPublic] = []
    week = start - timedelta(days=start.weekday())
    while week <= end:
        for period in periods:
            if period.fecha_inicio <= week + timedelta(days=6) and period.fecha_fin >= week:
                sessions.extend(period_week(db, period.id, week))
        week += timedelta(days=7)
    sessions = [item for item in sessions if start <= item.fecha <= end]
    if not sessions:
        return []
    courses = {
        item.id: item
        for item in db.scalars(
            select(Curso).where(Curso.id.in_({session.curso_id for session in sessions}))
        )
    }
    result: list[PlanningBookingPublic] = []
    for session in sessions:
        course = courses[session.curso_id]
        entry = db.get(MateriaPlan, course.materia_plan_id)
        subject = db.get(Materia, entry.materia_id)
        plan = db.get(PlanEstudio, entry.plan_id)
        career = db.get(Carrera, plan.carrera_id)
        teacher = db.get(Usuario, course.docente_id) if course.docente_id else None
        result.append(
            PlanningBookingPublic(
                **session.model_dump(),
                materia_codigo=subject.codigo,
                materia_nombre=subject.nombre,
                paralelo=course.paralelo,
                docente_id=course.docente_id,
                docente_nombre=(f"{teacher.nombres} {teacher.apellidos}" if teacher else None),
                carrera_nombre=career.nombre,
                fecha_inicio_curso=course.fecha_inicio,
                fecha_fin_curso=course.fecha_fin,
            )
        )
    return sorted(result, key=lambda item: (item.fecha, item.hora_inicio, str(item.curso_id)))
