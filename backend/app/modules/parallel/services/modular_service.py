from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.curriculum.models.entities import (
    EstadoPlan,
    MateriaPlan,
    ModalidadPlan,
    PlanEstudio,
    UnidadPlan,
)
from app.modules.parallel.models.entities import (
    BloqueHorario,
    Curso,
    DiaSemana,
    FeriadoPeriodo,
    HorarioClase,
    PlantillaModular,
)
from app.modules.parallel.schemas.courses import CoursePublic
from app.modules.parallel.schemas.modular import (
    ModularBatchInput,
    ModularBatchPreview,
    ModularModulePreview,
    ModularPlanInput,
    ModularPlanPreview,
)
from app.modules.parallel.services import parallel_service
from app.modules.parallel.services.room_capacity import validate_course_rooms, validate_room
from app.modules.periods.models.entities import AperturaPlan, PeriodoAcademico, PeriodoPlan
from app.modules.periods.services.group_progression import group_period_number

MODULAR_DAYS = (
    DiaSemana.LUNES,
    DiaSemana.MARTES,
    DiaSemana.MIERCOLES,
    DiaSemana.JUEVES,
    DiaSemana.VIERNES,
)


@dataclass
class PreparedPlan:
    preview: ModularPlanPreview
    block: BloqueHorario
    template: PlantillaModular


def _class_dates(start: date, count: int, holidays: set[date]) -> list[date]:
    result: list[date] = []
    current = start
    while len(result) < count:
        if current.weekday() < 5 and current not in holidays:
            result.append(current)
        current += timedelta(days=1)
    return result


def _prepare(db: Session, period_id: UUID, payload: ModularPlanInput) -> PreparedPlan:
    period = db.get(PeriodoAcademico, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Semestre académico no encontrado")
    if payload.fecha_inicio < period.fecha_inicio or payload.fecha_inicio > period.fecha_fin:
        raise HTTPException(status_code=422, detail="El inicio debe quedar dentro del semestre")
    template = db.get(PlantillaModular, period.plantilla_modular_id)
    if not template:
        raise HTTPException(
            status_code=409, detail="Selecciona una plantilla modular para este semestre"
        )
    plan = db.get(PlanEstudio, payload.plan_id)
    if not plan or plan.estado != EstadoPlan.VIGENTE or plan.modalidad != ModalidadPlan.MODULAR:
        raise HTTPException(status_code=422, detail="Selecciona un plan MODULAR vigente")
    if not db.get(PeriodoPlan, (period_id, plan.id)):
        raise HTTPException(status_code=409, detail="Incorpora el plan al semestre primero")
    group = db.get(AperturaPlan, payload.apertura_plan_id)
    initial_period = db.get(PeriodoAcademico, group.periodo_inicio_id) if group else None
    if (
        not group
        or group.plan_id != plan.id
        or initial_period is None
        or initial_period.fecha_inicio > period.fecha_inicio
    ):
        raise HTTPException(status_code=422, detail="Selecciona un grupo de ingreso del plan")
    group_semester = group_period_number(db, group, period_id)
    if group_semester is None:
        raise HTTPException(
            status_code=409,
            detail="El grupo no tiene un semestre planificado en este periodo académico",
        )
    block = db.scalar(
        select(BloqueHorario).where(
            BloqueHorario.turno == payload.turno,
            BloqueHorario.predeterminado_modular.is_(True),
            BloqueHorario.activo.is_(True),
        )
    )
    if not block:
        raise HTTPException(
            status_code=409,
            detail=(
                "Falta definir la hora de inicio y fin del turno modular. "
                "Configura su horario antes de programar."
            ),
        )
    minutes = int(
        (
            datetime.combine(date.min, block.hora_fin)
            - datetime.combine(date.min, block.hora_inicio)
        ).total_seconds()
        // 60
    )
    if minutes != template.minutos_por_clase:
        raise HTTPException(
            status_code=409,
            detail="La duración del turno no coincide con la plantilla modular",
        )
    holidays = set(
        db.scalars(select(FeriadoPeriodo.fecha).where(FeriadoPeriodo.periodo_id == period_id))
    )
    modules: list[ModularModulePreview] = []
    cursor = payload.fecha_inicio
    for subject in payload.materias:
        entry = db.get(MateriaPlan, subject.materia_plan_id)
        if not entry or entry.plan_id != plan.id:
            raise HTTPException(status_code=422, detail="La materia no pertenece al plan")
        unit = db.get(UnidadPlan, entry.unidad_id)
        if not unit or unit.numero > group_semester:
            raise HTTPException(
                status_code=409,
                detail="La materia pertenece a un semestre futuro para este grupo de ingreso",
            )
        parallel_service._validate_teacher(db, subject.docente_id)
        validate_room(db, subject.aula, subject.cupo)
        count = subject.clases or template.clases_por_modulo
        dates = _class_dates(cursor, count, holidays)
        modules.append(
            ModularModulePreview(
                materia_plan_id=entry.id,
                paralelo=subject.paralelo.upper(),
                fecha_inicio=dates[0],
                fecha_fin=dates[-1],
                fechas_clase=dates,
                clases=count,
            )
        )
        cursor = dates[-1] + timedelta(days=1)
    last = modules[-1].fecha_fin
    return PreparedPlan(
        preview=ModularPlanPreview(
            periodo_id=period_id,
            plantilla_modular_id=template.id,
            grupo_id=group.id,
            turno=payload.turno,
            cabe_en_semestre=last <= period.fecha_fin,
            fin_estimado=last,
            materias=modules,
        ),
        block=block,
        template=template,
    )


def _build_courses(
    period_id: UUID, payload: ModularPlanInput, prepared: PreparedPlan
) -> list[tuple[Curso, list[HorarioClase]]]:
    result: list[tuple[Curso, list[HorarioClase]]] = []
    for subject, module in zip(payload.materias, prepared.preview.materias, strict=True):
        course = Curso(
            id=uuid4(),
            materia_plan_id=subject.materia_plan_id,
            periodo_id=period_id,
            apertura_plan_id=payload.apertura_plan_id,
            plantilla_modular_id=prepared.template.id,
            turno_modular=payload.turno,
            clases_objetivo=module.clases,
            paralelo=module.paralelo,
            cupo=subject.cupo,
            fecha_inicio=module.fecha_inicio,
            fecha_fin=module.fecha_fin,
            docente_id=subject.docente_id,
            activo=True,
            inscripcion_abierta=False,
        )
        schedules = [
            HorarioClase(
                curso_id=course.id,
                dia_semana=day,
                hora_inicio=prepared.block.hora_inicio,
                hora_fin=prepared.block.hora_fin,
                aula=subject.aula,
            )
            for day in MODULAR_DAYS
        ]
        result.append((course, schedules))
    return result


def _check_conflicts(db: Session, courses: list[tuple[Curso, list[HorarioClase]]]) -> None:
    preview = db.begin_nested()
    try:
        for course, schedules in courses:
            db.add(course)
            db.add_all(schedules)
        db.flush()
        for course, _ in courses:
            validate_course_rooms(db, course)
        parallel_service._validate_global_conflicts(db, {course.id for course, _ in courses})
    except IntegrityError as exc:
        preview.rollback()
        raise HTTPException(status_code=409, detail="El paralelo ya está programado") from exc
    except Exception:
        preview.rollback()
        raise
    preview.rollback()


def preview_modular_plan(
    db: Session, period_id: UUID, payload: ModularPlanInput
) -> ModularPlanPreview:
    prepared = _prepare(db, period_id, payload)
    if prepared.preview.cabe_en_semestre:
        _check_conflicts(db, _build_courses(period_id, payload, prepared))
    return prepared.preview


def create_modular_plan(
    db: Session, period_id: UUID, payload: ModularPlanInput
) -> list[CoursePublic]:
    db.scalar(select(PeriodoAcademico).where(PeriodoAcademico.id == period_id).with_for_update())
    prepared = _prepare(db, period_id, payload)
    if not prepared.preview.cabe_en_semestre:
        raise HTTPException(
            status_code=422,
            detail=(
                f"La secuencia terminaría el {prepared.preview.fin_estimado.isoformat()}, "
                "fuera del semestre"
            ),
        )
    courses = _build_courses(period_id, payload, prepared)
    for course, schedules in courses:
        db.add(course)
        db.add_all(schedules)
    parallel_service._commit_with_conflict_check(
        db, {course.id for course, _ in courses}, check_capacity=True
    )
    return [parallel_service._course_output(db, course) for course, _ in courses]


def _prepare_batch(
    db: Session, period_id: UUID, payload: ModularBatchInput
) -> tuple[list[ModularPlanPreview], list[tuple[Curso, list[HorarioClase]]]]:
    previews: list[ModularPlanPreview] = []
    courses: list[tuple[Curso, list[HorarioClase]]] = []
    for sequence in payload.secuencias:
        prepared = _prepare(db, period_id, sequence)
        previews.append(prepared.preview)
        if prepared.preview.cabe_en_semestre:
            courses.extend(_build_courses(period_id, sequence, prepared))
    return previews, courses


def preview_modular_batch(
    db: Session, period_id: UUID, payload: ModularBatchInput
) -> ModularBatchPreview:
    previews, courses = _prepare_batch(db, period_id, payload)
    all_fit = all(item.cabe_en_semestre for item in previews)
    if all_fit:
        _check_conflicts(db, courses)
    return ModularBatchPreview(periodo_id=period_id, cabe_en_semestre=all_fit, secuencias=previews)


def create_modular_batch(
    db: Session, period_id: UUID, payload: ModularBatchInput
) -> list[CoursePublic]:
    db.scalar(select(PeriodoAcademico).where(PeriodoAcademico.id == period_id).with_for_update())
    previews, courses = _prepare_batch(db, period_id, payload)
    outside = next((item for item in previews if not item.cabe_en_semestre), None)
    if outside:
        raise HTTPException(
            status_code=422,
            detail=(
                f"La secuencia terminaría el {outside.fin_estimado.isoformat()}, fuera del semestre"
            ),
        )
    for course, schedules in courses:
        db.add(course)
        db.add_all(schedules)
    parallel_service._commit_with_conflict_check(
        db, {course.id for course, _ in courses}, check_capacity=True
    )
    return [parallel_service._course_output(db, course) for course, _ in courses]
