from collections import defaultdict
from datetime import date, time, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.access.models.user import PerfilDocente, PerfilEstudiante, UserRole, Usuario
from app.modules.curriculum.models.entities import (
    Carrera,
    EstadoPlan,
    Materia,
    MateriaPlan,
    ModalidadPlan,
    PlanEstudio,
)
from app.modules.enrollments.models.entities import EstadoInscripcion, Inscripcion
from app.modules.notifications.services.notification_service import (
    add_course_schedule_notifications,
    add_period_holiday_notifications,
)
from app.modules.parallel.models.entities import (
    Aula,
    Curso,
    ExcepcionHorario,
    FeriadoPeriodo,
    HorarioClase,
)
from app.modules.parallel.schemas.courses import (
    CourseCreate,
    CoursePublic,
    CourseScheduleInput,
    CourseSchedulePublic,
    CourseUpdate,
    HolidayCreate,
    HolidayPublic,
    ScheduleExceptionCreate,
    ScheduleExceptionPublic,
)
from app.modules.parallel.services.calendar import Occurrence, course_occurrences, first_overlap
from app.modules.parallel.services.room_capacity import validate_course_rooms
from app.modules.periods.models.entities import AperturaPlan, PeriodoAcademico, PeriodoPlan


def _course_or_404(db: Session, course_id: UUID) -> Curso:
    course = db.get(Curso, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Paralelo no encontrado")
    return course


def _period_or_404(db: Session, period_id: UUID) -> PeriodoAcademico:
    period = db.get(PeriodoAcademico, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Periodo académico no encontrado")
    return period


def _enrollment_count(db: Session, course_id: UUID, *, active_only: bool = False) -> int:
    query = select(func.count(Inscripcion.id)).where(Inscripcion.curso_id == course_id)
    if active_only:
        query = query.where(Inscripcion.estado == EstadoInscripcion.ACTIVA)
    return int(db.scalar(query) or 0)


def _enrollment_rows(db: Session, *, active_only: bool = True):
    query = select(Inscripcion.estudiante_id, Inscripcion.curso_id)
    if active_only:
        query = query.where(Inscripcion.estado == EstadoInscripcion.ACTIVA)
    return db.execute(query).all()


def _schedules_for(db: Session, course_id: UUID) -> list[HorarioClase]:
    return db.scalars(
        select(HorarioClase)
        .where(HorarioClase.curso_id == course_id)
        .order_by(HorarioClase.dia_semana, HorarioClase.hora_inicio)
    ).all()


def _exceptions_for(db: Session, course_id: UUID) -> list[ExcepcionHorario]:
    return db.scalars(select(ExcepcionHorario).where(ExcepcionHorario.curso_id == course_id)).all()


def _holidays_for(db: Session, period_id: UUID) -> set[date]:
    return set(
        db.scalars(select(FeriadoPeriodo.fecha).where(FeriadoPeriodo.periodo_id == period_id)).all()
    )


def _occurrences_for(db: Session, course: Curso) -> list[Occurrence]:
    return course_occurrences(
        course,
        _schedules_for(db, course.id),
        _holidays_for(db, course.periodo_id),
        _exceptions_for(db, course.id),
    )


def _all_occurrences(db: Session, courses: list[Curso]) -> dict[UUID, list[Occurrence]]:
    if not courses:
        return {}
    course_ids = [course.id for course in courses]
    period_ids = {course.periodo_id for course in courses}
    schedules_by_course: dict[UUID, list[HorarioClase]] = defaultdict(list)
    exceptions_by_course: dict[UUID, list[ExcepcionHorario]] = defaultdict(list)
    holidays_by_period: dict[UUID, set[date]] = defaultdict(set)
    for schedule in db.scalars(
        select(HorarioClase).where(HorarioClase.curso_id.in_(course_ids))
    ).all():
        schedules_by_course[schedule.curso_id].append(schedule)
    for exception in db.scalars(
        select(ExcepcionHorario).where(ExcepcionHorario.curso_id.in_(course_ids))
    ).all():
        exceptions_by_course[exception.curso_id].append(exception)
    for period_id, holiday in db.execute(
        select(FeriadoPeriodo.periodo_id, FeriadoPeriodo.fecha).where(
            FeriadoPeriodo.periodo_id.in_(period_ids)
        )
    ):
        holidays_by_period[period_id].add(holiday)
    return {
        course.id: course_occurrences(
            course,
            schedules_by_course[course.id],
            holidays_by_period[course.periodo_id],
            exceptions_by_course[course.id],
        )
        for course in courses
    }


def _validate_global_conflicts(db: Session, changed_ids: set[UUID]) -> None:
    courses = db.scalars(select(Curso).where(Curso.activo.is_(True))).all()
    if not courses:
        return
    by_id = {course.id: course for course in courses}
    occurrences = _all_occurrences(db, courses)

    def course_label(course: Curso) -> str:
        entry = db.get(MateriaPlan, course.materia_plan_id)
        subject = db.get(Materia, entry.materia_id)
        return f"{subject.codigo} (paralelo {course.paralelo})"

    # Each parallel label has its own modular sequence within the intake group.
    # Other labels may overlap here; room, teacher and student checks still apply.
    for index, left in enumerate(courses):
        if left.apertura_plan_id is None or left.turno_modular is None:
            continue
        for right in courses[index + 1 :]:
            if not ({left.id, right.id} & changed_ids):
                continue
            if (
                left.periodo_id == right.periodo_id
                and left.apertura_plan_id == right.apertura_plan_id
                and left.turno_modular == right.turno_modular
                and left.paralelo == right.paralelo
                and left.materia_plan_id != right.materia_plan_id
                and left.fecha_inicio <= right.fecha_fin
                and right.fecha_inicio <= left.fecha_fin
            ):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Las materias del mismo grupo y turno, dentro del paralelo "
                        f"{left.paralelo}, se superponen del "
                        f"{max(left.fecha_inicio, right.fecha_inicio).isoformat()} al "
                        f"{min(left.fecha_fin, right.fecha_fin).isoformat()}: "
                        f"{course_label(left)} y {course_label(right)}. "
                        "Deben ir una después de otra; revisa el orden, "
                        "la fecha de inicio o el turno."
                    ),
                )

    for course in courses:
        if course.id not in changed_ids:
            continue
        current = occurrences[course.id]
        for index, left in enumerate(current):
            overlap = first_overlap([left], current[index + 1 :])
            if overlap:
                raise HTTPException(
                    status_code=409,
                    detail=f"Dos horarios del paralelo se superponen el {overlap.isoformat()}",
                )

    for index, left in enumerate(courses):
        if left.docente_id is None:
            continue
        for right in courses[index + 1 :]:
            if left.docente_id != right.docente_id or not ({left.id, right.id} & changed_ids):
                continue
            overlap = first_overlap(occurrences[left.id], occurrences[right.id])
            if overlap:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"El docente tiene un cruce el {overlap.isoformat()}: "
                        f"{course_label(left)} y {course_label(right)}. "
                        "Elige otro docente, turno o fecha."
                    ),
                )

    # Classroom conflicts are checked against real dates as well: weekly slots
    # do not conflict when their courses run in different modular blocks.
    room_events: dict[UUID, list[tuple[date, time, time, str]]] = defaultdict(list)
    weekday_numbers = {
        "LUNES": 1,
        "MARTES": 2,
        "MIERCOLES": 3,
        "JUEVES": 4,
        "VIERNES": 5,
        "SABADO": 6,
        "DOMINGO": 7,
    }
    for course in courses:
        schedules = _schedules_for(db, course.id)
        holidays = _holidays_for(db, course.periodo_id)
        exceptions = {item.fecha_original: item for item in _exceptions_for(db, course.id)}
        current = course.fecha_inicio
        while current <= course.fecha_fin:
            if current not in holidays and current not in exceptions:
                for slot in schedules:
                    if slot.aula and current.isoweekday() == weekday_numbers[slot.dia_semana.value]:
                        room_events[course.id].append(
                            (current, slot.hora_inicio, slot.hora_fin, slot.aula)
                        )
            current += timedelta(days=1)
        for exception in exceptions.values():
            if exception.tipo.value != "REPROGRAMADA" or not exception.fecha_reprogramada:
                continue
            room_code = exception.aula
            if room_code is None:
                original_day = exception.fecha_original.isoweekday()
                original_rooms = {
                    slot.aula
                    for slot in schedules
                    if weekday_numbers[slot.dia_semana.value] == original_day and slot.aula
                }
                if len(original_rooms) == 1:
                    room_code = next(iter(original_rooms))
            if room_code and exception.hora_inicio and exception.hora_fin:
                room_events[course.id].append(
                    (
                        exception.fecha_reprogramada,
                        exception.hora_inicio,
                        exception.hora_fin,
                        room_code,
                    )
                )

    ordered = [course for course in courses if course.id in changed_ids]
    for left in ordered:
        for right in courses:
            if (
                left.id == right.id
                or right.id not in by_id
                or not room_events[left.id]
                or not room_events[right.id]
            ):
                continue
            if str(left.id) >= str(right.id) and right in ordered:
                continue
            for day, start, end, room in room_events[left.id]:
                for other_day, other_start, other_end, other_room in room_events[right.id]:
                    if (
                        room == other_room
                        and day == other_day
                        and start < other_end
                        and other_start < end
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                f"El aula {room} tiene un cruce el {day.isoformat()} "
                                f"de {max(start, other_start).strftime('%H:%M')} a "
                                f"{min(end, other_end).strftime('%H:%M')}: "
                                f"{course_label(left)} y {course_label(right)}. "
                                "Elige otra aula, turno o fecha."
                            ),
                        )

    active_courses = set(by_id)
    courses_by_student: dict[UUID, set[UUID]] = defaultdict(set)
    for student_id, course_id in _enrollment_rows(db):
        if course_id in active_courses:
            courses_by_student[student_id].add(course_id)
    for student_courses in courses_by_student.values():
        ordered = sorted(student_courses, key=str)
        for index, left_id in enumerate(ordered):
            for right_id in ordered[index + 1 :]:
                if not ({left_id, right_id} & changed_ids):
                    continue
                overlap = first_overlap(occurrences[left_id], occurrences[right_id])
                if overlap:
                    left, right = by_id[left_id], by_id[right_id]
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"El cambio genera un cruce para un estudiante entre los paralelos "
                            f"{left.paralelo} y {right.paralelo} el {overlap.isoformat()}"
                        ),
                    )


def _lock_teachers(db: Session, teacher_ids: set[UUID | None]) -> None:
    ids = sorted({teacher_id for teacher_id in teacher_ids if teacher_id}, key=str)
    if ids:
        db.scalars(
            select(PerfilDocente)
            .where(PerfilDocente.usuario_id.in_(ids))
            .order_by(PerfilDocente.usuario_id)
            .with_for_update()
        ).all()


def _lock_rooms(db: Session, course_ids: set[UUID]) -> None:
    room_codes = set(
        db.scalars(
            select(HorarioClase.aula).where(
                HorarioClase.curso_id.in_(course_ids), HorarioClase.aula.is_not(None)
            )
        ).all()
    )
    room_codes.update(
        db.scalars(
            select(ExcepcionHorario.aula).where(
                ExcepcionHorario.curso_id.in_(course_ids), ExcepcionHorario.aula.is_not(None)
            )
        ).all()
    )
    if room_codes:
        db.scalars(
            select(Aula)
            .where(Aula.codigo.in_(room_codes))
            .order_by(Aula.codigo)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).all()


def _lock_modular_groups(db: Session, group_ids: set[UUID | None]) -> None:
    ids = sorted({group_id for group_id in group_ids if group_id}, key=str)
    if ids:
        db.scalars(
            select(AperturaPlan)
            .where(AperturaPlan.id.in_(ids))
            .order_by(AperturaPlan.id)
            .with_for_update()
        ).all()


def _lock_course_students(db: Session, course_ids: set[UUID]) -> None:
    if not course_ids:
        return
    student_ids = set(
        db.scalars(
            select(Inscripcion.estudiante_id)
            .where(
                Inscripcion.curso_id.in_(course_ids),
                Inscripcion.estado == EstadoInscripcion.ACTIVA,
            )
            .distinct()
        ).all()
    )
    if student_ids:
        db.scalars(
            select(PerfilEstudiante)
            .where(PerfilEstudiante.usuario_id.in_(student_ids))
            .order_by(PerfilEstudiante.usuario_id)
            .with_for_update()
        ).all()


def _lock_courses(db: Session, course_ids: set[UUID]) -> None:
    if course_ids:
        db.scalars(
            select(Curso).where(Curso.id.in_(course_ids)).order_by(Curso.id).with_for_update()
        ).all()


def _commit_with_conflict_check(
    db: Session,
    changed_ids: set[UUID],
    *,
    check_capacity: bool = False,
    require_all_rooms: bool = False,
    allow_unconfigured: bool = False,
) -> None:
    try:
        db.flush()
        changed_courses = db.scalars(select(Curso).where(Curso.id.in_(changed_ids))).all()
        _lock_modular_groups(db, {course.apertura_plan_id for course in changed_courses})
        _lock_teachers(db, {course.docente_id for course in changed_courses})
        _lock_rooms(db, changed_ids)
        if check_capacity:
            for course in changed_courses:
                validate_course_rooms(
                    db,
                    course,
                    require_all=require_all_rooms or course.inscripcion_abierta,
                    allow_unconfigured=allow_unconfigured,
                )
        _validate_global_conflicts(db, changed_ids)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="El paralelo o la relación ya está registrada"
        ) from exc


def _validate_course_period(db: Session, course: Curso) -> PeriodoAcademico:
    period = _period_or_404(db, course.periodo_id)
    if course.fecha_inicio < period.fecha_inicio or course.fecha_fin > period.fecha_fin:
        raise HTTPException(
            status_code=422,
            detail="Las fechas del paralelo deben quedar dentro del periodo académico",
        )
    if course.fecha_fin < course.fecha_inicio:
        raise HTTPException(
            status_code=422, detail="La fecha final no puede ser anterior a la fecha inicial"
        )
    return period


def _validate_teacher(db: Session, teacher_id: UUID | None) -> None:
    if teacher_id is None:
        return
    profile = db.get(PerfilDocente, teacher_id)
    user = db.get(Usuario, teacher_id)
    if not profile or not user or user.rol != UserRole.DOCENTE or not user.activo:
        raise HTTPException(status_code=422, detail="Selecciona un docente activo")


def _validate_exception_bounds(db: Session, course: Curso) -> None:
    period = _period_or_404(db, course.periodo_id)
    scheduled_weekdays = {schedule.dia_semana for schedule in _schedules_for(db, course.id)}
    holidays = _holidays_for(db, period.id)
    for exception in _exceptions_for(db, course.id):
        if not course.fecha_inicio <= exception.fecha_original <= course.fecha_fin:
            raise HTTPException(
                status_code=409,
                detail="El intervalo no puede excluir la fecha original de una excepción",
            )
        if exception.fecha_original in holidays or exception.fecha_original.isoweekday() not in {
            {
                "LUNES": 1,
                "MARTES": 2,
                "MIERCOLES": 3,
                "JUEVES": 4,
                "VIERNES": 5,
                "SABADO": 6,
                "DOMINGO": 7,
            }[day.value]
            for day in scheduled_weekdays
        }:
            raise HTTPException(
                status_code=409,
                detail="El horario no puede dejar sin clase la fecha original de una excepción",
            )
        if exception.fecha_reprogramada and not (
            period.fecha_inicio <= exception.fecha_reprogramada <= period.fecha_fin
        ):
            raise HTTPException(
                status_code=409,
                detail="La reprogramación debe permanecer dentro del periodo",
            )


def _course_output(db: Session, course: Curso) -> CoursePublic:
    entry = db.get(MateriaPlan, course.materia_plan_id)
    plan = db.get(PlanEstudio, entry.plan_id)
    career = db.get(Carrera, plan.carrera_id)
    subject = db.get(Materia, entry.materia_id)
    period = db.get(PeriodoAcademico, course.periodo_id)
    teacher = db.get(Usuario, course.docente_id) if course.docente_id else None
    schedules = _schedules_for(db, course.id)
    actual_classes = (
        len(
            {
                event[0]
                for event in course_occurrences(
                    course,
                    schedules,
                    _holidays_for(db, course.periodo_id),
                    _exceptions_for(db, course.id),
                )
            }
        )
        if course.clases_objetivo is not None
        else None
    )
    return CoursePublic(
        id=course.id,
        materia_plan_id=course.materia_plan_id,
        plan_id=plan.id,
        carrera_id=career.id,
        facultad_id=career.facultad_id,
        materia_codigo=subject.codigo,
        materia_nombre=subject.nombre,
        plan_codigo=plan.codigo,
        plan_estado=plan.estado,
        carrera_codigo=career.codigo,
        carrera_nombre=career.nombre,
        periodo_id=period.id,
        periodo_denominacion=period.denominacion,
        apertura_plan_id=course.apertura_plan_id,
        plantilla_modular_id=course.plantilla_modular_id,
        turno_modular=course.turno_modular,
        clases_objetivo=course.clases_objetivo,
        clases_programadas=actual_classes,
        paralelo=course.paralelo,
        cupo=course.cupo,
        fecha_inicio=course.fecha_inicio,
        fecha_fin=course.fecha_fin,
        docente_id=course.docente_id,
        docente_nombre=(f"{teacher.nombres} {teacher.apellidos}" if teacher else None),
        inscripcion_abierta=course.inscripcion_abierta,
        activo=course.activo,
        horarios=[
            CourseSchedulePublic(
                id=schedule.id,
                dia_semana=schedule.dia_semana,
                hora_inicio=schedule.hora_inicio,
                hora_fin=schedule.hora_fin,
                aula=schedule.aula,
            )
            for schedule in schedules
        ],
    )


def list_courses(db: Session, user: Usuario) -> list[CoursePublic]:
    query = select(Curso).order_by(Curso.periodo_id, Curso.paralelo)
    if user.rol == UserRole.DOCENTE:
        query = query.where(Curso.docente_id == user.id)
    elif user.rol == UserRole.ESTUDIANTE:
        enrollment_query = select(Inscripcion.curso_id).where(
            Inscripcion.estudiante_id == user.id,
            Inscripcion.estado == EstadoInscripcion.ACTIVA,
        )
        course_ids = db.scalars(enrollment_query).all()
        query = query.where(Curso.id.in_(course_ids))
    courses = db.scalars(query).all()
    return [_course_output(db, course) for course in courses]


def create_course(db: Session, payload: CourseCreate) -> CoursePublic:
    entry = db.get(MateriaPlan, payload.materia_plan_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Materia del plan no encontrada")
    period = _period_or_404(db, payload.periodo_id)
    plan = db.get(PlanEstudio, entry.plan_id)
    if plan.estado != EstadoPlan.VIGENTE:
        raise HTTPException(status_code=409, detail="El plan debe estar VIGENTE")
    if plan.modalidad == ModalidadPlan.MODULAR and period.plantilla_modular_id is not None:
        raise HTTPException(
            status_code=409,
            detail="Programa materias modulares desde la secuencia del grupo y turno",
        )
    if not db.get(PeriodoPlan, (period.id, plan.id)):
        raise HTTPException(
            status_code=409, detail="Incorpora el plan al semestre antes de crear paralelos"
        )
    if payload.fecha_inicio < period.fecha_inicio or payload.fecha_fin > period.fecha_fin:
        raise HTTPException(
            status_code=422,
            detail="Las fechas del paralelo deben quedar dentro del periodo académico",
        )
    if payload.fecha_fin < payload.fecha_inicio:
        raise HTTPException(
            status_code=422, detail="La fecha final no puede ser anterior a la fecha inicial"
        )
    _validate_teacher(db, payload.docente_id)
    course = Curso(
        materia_plan_id=payload.materia_plan_id,
        periodo_id=payload.periodo_id,
        paralelo=payload.paralelo.upper(),
        cupo=payload.cupo,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        docente_id=payload.docente_id,
        activo=True,
        inscripcion_abierta=False,
    )
    db.add(course)
    db.flush()
    for schedule in payload.horarios:
        db.add(
            HorarioClase(
                curso_id=course.id,
                dia_semana=schedule.dia_semana,
                hora_inicio=schedule.hora_inicio,
                hora_fin=schedule.hora_fin,
                aula=schedule.aula,
            )
        )
    _commit_with_conflict_check(db, {course.id}, check_capacity=bool(payload.horarios))
    db.refresh(course)
    return _course_output(db, course)


def update_course(db: Session, course_id: UUID, payload: CourseUpdate) -> CoursePublic:
    course = _course_or_404(db, course_id)
    _lock_course_students(db, {course.id})
    _lock_courses(db, {course.id})
    changes = payload.model_dump(exclude_unset=True)
    meaningful = {name for name, value in changes.items() if getattr(course, name) != value}
    allow_unconfigured = meaningful == {"cupo"} and changes["cupo"] < course.cupo
    for name, value in changes.items():
        setattr(course, name, value)
    if changes.get("activo") is False:
        course.inscripcion_abierta = False
    if "paralelo" in changes:
        course.paralelo = changes["paralelo"].upper()
    _validate_course_period(db, course)
    _validate_exception_bounds(db, course)
    _validate_teacher(db, course.docente_id)
    if course.inscripcion_abierta and course.docente_id is None:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Asigna un docente o cierra inscripciones antes de guardar el cambio",
        )
    if course.cupo < _enrollment_count(db, course.id, active_only=True):
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El cupo no puede ser menor que la cantidad de inscripciones activas",
        )
    _commit_with_conflict_check(
        db,
        {course.id},
        check_capacity=course.activo
        and bool(meaningful & {"cupo", "fecha_inicio", "fecha_fin", "activo"}),
        allow_unconfigured=allow_unconfigured,
    )
    db.refresh(course)
    return _course_output(db, course)


def validate_course_update_preview(
    db: Session, course_id: UUID, payload: CourseUpdate
) -> dict[str, bool]:
    course = _course_or_404(db, course_id)
    changes = payload.model_dump(exclude_unset=True)
    meaningful = {name for name, value in changes.items() if getattr(course, name) != value}
    allow_unconfigured = meaningful == {"cupo"} and changes["cupo"] < course.cupo
    preview = db.begin_nested()
    try:
        for name, value in changes.items():
            setattr(course, name, value)
        _validate_course_period(db, course)
        _validate_teacher(db, course.docente_id)
        _validate_exception_bounds(db, course)
        if course.cupo < _enrollment_count(db, course.id, active_only=True):
            raise HTTPException(
                status_code=409,
                detail="El cupo no puede ser menor que la cantidad de inscripciones activas",
            )
        db.flush()
        if meaningful & {"cupo", "fecha_inicio", "fecha_fin", "activo"} and course.activo:
            validate_course_rooms(
                db,
                course,
                require_all=course.inscripcion_abierta,
                allow_unconfigured=allow_unconfigured,
            )
        _validate_global_conflicts(db, {course.id})
    except IntegrityError as exc:
        preview.rollback()
        raise HTTPException(
            status_code=409, detail="La configuración del paralelo ya existe"
        ) from exc
    except Exception:
        preview.rollback()
        raise
    preview.rollback()
    return {"valido": True}


def replace_schedules(
    db: Session, course_id: UUID, schedules: list[CourseScheduleInput]
) -> CoursePublic:
    course = _course_or_404(db, course_id)
    _lock_course_students(db, {course.id})
    _lock_courses(db, {course.id})
    old_schedules = sorted(
        (item.dia_semana.value, item.hora_inicio, item.hora_fin, item.aula)
        for item in _schedules_for(db, course.id)
    )
    new_schedules = sorted(
        (item.dia_semana.value, item.hora_inicio, item.hora_fin, item.aula) for item in schedules
    )
    if course.inscripcion_abierta and not schedules:
        raise HTTPException(
            status_code=409,
            detail="Agrega al menos un horario o cierra inscripciones antes de quitar el horario",
        )
    room_codes = {schedule.aula for schedule in schedules if schedule.aula}
    active_rooms = (
        set(
            db.scalars(
                select(Aula.codigo).where(Aula.codigo.in_(room_codes), Aula.activa.is_(True))
            ).all()
        )
        if room_codes
        else set()
    )
    if room_codes - active_rooms:
        raise HTTPException(status_code=422, detail="Selecciona un aula activa del catálogo")
    for schedule in _schedules_for(db, course.id):
        db.delete(schedule)
    # Remove existing unique keys before inserting the replacement set.
    db.flush()
    for schedule in schedules:
        db.add(
            HorarioClase(
                curso_id=course.id,
                dia_semana=schedule.dia_semana,
                hora_inicio=schedule.hora_inicio,
                hora_fin=schedule.hora_fin,
                aula=schedule.aula,
            )
        )
    if old_schedules != new_schedules:
        add_course_schedule_notifications(db, course)
    _validate_exception_bounds(db, course)
    _commit_with_conflict_check(db, {course.id}, check_capacity=True)
    db.refresh(course)
    return _course_output(db, course)


def validate_schedule_preview(
    db: Session, course_id: UUID, schedules: list[CourseScheduleInput]
) -> dict[str, bool]:
    """Run the same date/resource checks as save, then roll the preview back."""
    course = _course_or_404(db, course_id)
    room_codes = {schedule.aula for schedule in schedules if schedule.aula}
    active_rooms = (
        set(
            db.scalars(
                select(Aula.codigo).where(Aula.codigo.in_(room_codes), Aula.activa.is_(True))
            ).all()
        )
        if room_codes
        else set()
    )
    if room_codes - active_rooms:
        raise HTTPException(status_code=422, detail="Selecciona un aula activa del catálogo")

    preview = db.begin_nested()
    try:
        for current in _schedules_for(db, course.id):
            db.delete(current)
        db.flush()
        db.add_all(
            [
                HorarioClase(
                    curso_id=course.id,
                    dia_semana=item.dia_semana,
                    hora_inicio=item.hora_inicio,
                    hora_fin=item.hora_fin,
                    aula=item.aula,
                )
                for item in schedules
            ]
        )
        db.flush()
        _validate_exception_bounds(db, course)
        validate_course_rooms(db, course, require_all=course.inscripcion_abierta)
        _validate_global_conflicts(db, {course.id})
    except Exception:
        preview.rollback()
        raise
    preview.rollback()
    return {"valido": True}


def set_registration_open(db: Session, course_id: UUID, opened: bool) -> CoursePublic:
    course = _course_or_404(db, course_id)
    _lock_courses(db, {course.id})
    if opened:
        _require_openable(db, course)
    course.inscripcion_abierta = opened
    _commit_with_conflict_check(db, {course.id}, check_capacity=opened, require_all_rooms=opened)
    db.refresh(course)
    return _course_output(db, course)


def _require_openable(db: Session, course: Curso) -> None:
    _validate_course_period(db, course)
    _validate_teacher(db, course.docente_id)
    if not course.activo:
        raise HTTPException(
            status_code=409, detail="Activa el paralelo antes de abrir inscripciones"
        )
    if course.docente_id is None:
        raise HTTPException(
            status_code=409, detail="Asigna un docente antes de abrir inscripciones"
        )
    if not _schedules_for(db, course.id):
        raise HTTPException(
            status_code=409, detail="Agrega un horario antes de abrir inscripciones"
        )
    entry = db.get(MateriaPlan, course.materia_plan_id)
    plan = db.get(PlanEstudio, entry.plan_id)
    if plan.estado != EstadoPlan.VIGENTE:
        raise HTTPException(status_code=409, detail="El plan debe estar VIGENTE")


def set_registration_open_many(
    db: Session, period_id: UUID, course_ids: set[UUID], opened: bool
) -> list[CoursePublic]:
    _period_or_404(db, period_id)
    _lock_courses(db, course_ids)
    courses = db.scalars(select(Curso).where(Curso.id.in_(course_ids)).order_by(Curso.id)).all()
    if len(courses) != len(course_ids) or any(course.periodo_id != period_id for course in courses):
        raise HTTPException(
            status_code=404, detail="Uno o más paralelos no pertenecen a este semestre"
        )
    if opened:
        for course in courses:
            _require_openable(db, course)
    for course in courses:
        course.inscripcion_abierta = opened
    _commit_with_conflict_check(db, course_ids, check_capacity=opened, require_all_rooms=opened)
    return [_course_output(db, course) for course in courses]


def delete_course(db: Session, course_id: UUID) -> None:
    course = _course_or_404(db, course_id)
    if _enrollment_count(db, course.id) > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "El paralelo tiene inscripciones; consérvalo e inactívalo "
                "para mantener el historial"
            ),
        )
    db.delete(course)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El paralelo tiene calificaciones o registros vinculados y no puede eliminarse",
        ) from exc


def list_holidays(db: Session, period_id: UUID) -> list[HolidayPublic]:
    _period_or_404(db, period_id)
    holidays = db.scalars(
        select(FeriadoPeriodo)
        .where(FeriadoPeriodo.periodo_id == period_id)
        .order_by(FeriadoPeriodo.fecha)
    ).all()
    return [HolidayPublic.model_validate(holiday) for holiday in holidays]


def create_holiday(db: Session, period_id: UUID, payload: HolidayCreate) -> HolidayPublic:
    period = _period_or_404(db, period_id)
    if not period.fecha_inicio <= payload.fecha <= period.fecha_fin:
        raise HTTPException(status_code=422, detail="El feriado debe quedar dentro del periodo")
    replacement_exists = db.scalar(
        select(ExcepcionHorario.id)
        .join(Curso, Curso.id == ExcepcionHorario.curso_id)
        .where(
            Curso.periodo_id == period_id,
            ExcepcionHorario.fecha_reprogramada == payload.fecha,
        )
        .limit(1)
    )
    if replacement_exists:
        raise HTTPException(
            status_code=409,
            detail="No se puede marcar como feriado una fecha con clases reprogramadas",
        )
    holiday = FeriadoPeriodo(
        periodo_id=period_id, fecha=payload.fecha, descripcion=payload.descripcion
    )
    db.add(holiday)
    add_period_holiday_notifications(db, period_id, payload.fecha)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un feriado en esa fecha") from exc
    db.refresh(holiday)
    return HolidayPublic.model_validate(holiday)


def delete_holiday(db: Session, period_id: UUID, holiday_id: UUID) -> None:
    holiday = db.scalar(
        select(FeriadoPeriodo).where(
            FeriadoPeriodo.id == holiday_id, FeriadoPeriodo.periodo_id == period_id
        )
    )
    if not holiday:
        raise HTTPException(status_code=404, detail="Feriado no encontrado")
    changed_ids = set(
        db.scalars(
            select(Curso.id).where(Curso.periodo_id == period_id, Curso.activo.is_(True))
        ).all()
    )
    _lock_course_students(db, changed_ids)
    _lock_courses(db, changed_ids)
    db.delete(holiday)
    add_period_holiday_notifications(db, period_id, holiday.fecha)
    _commit_with_conflict_check(db, changed_ids)


def list_exceptions(db: Session, course_id: UUID) -> list[ScheduleExceptionPublic]:
    _course_or_404(db, course_id)
    exceptions = db.scalars(
        select(ExcepcionHorario)
        .where(ExcepcionHorario.curso_id == course_id)
        .order_by(ExcepcionHorario.fecha_original)
    ).all()
    return [ScheduleExceptionPublic.model_validate(exception) for exception in exceptions]


def create_exception(
    db: Session, course_id: UUID, payload: ScheduleExceptionCreate
) -> ScheduleExceptionPublic:
    course = _course_or_404(db, course_id)
    _lock_course_students(db, {course.id})
    _lock_courses(db, {course.id})
    period = _period_or_404(db, course.periodo_id)
    if not course.fecha_inicio <= payload.fecha_original <= course.fecha_fin:
        raise HTTPException(
            status_code=422, detail="La fecha original debe quedar dentro del paralelo"
        )
    original = {day for day, _, _ in _occurrences_for(db, course)}
    if payload.fecha_original not in original:
        raise HTTPException(
            status_code=422,
            detail="La fecha original debe ser una clase programada y no puede ser feriado",
        )
    if payload.fecha_reprogramada:
        if not period.fecha_inicio <= payload.fecha_reprogramada <= period.fecha_fin:
            raise HTTPException(
                status_code=422, detail="La reprogramación debe quedar dentro del periodo"
            )
        if payload.fecha_reprogramada in _holidays_for(db, period.id):
            raise HTTPException(status_code=422, detail="No se puede reprogramar en un feriado")
        if payload.fecha_reprogramada == payload.fecha_original:
            raise HTTPException(
                status_code=422, detail="La fecha de reemplazo debe ser distinta a la original"
            )
    if payload.aula and not db.scalar(
        select(Aula.codigo).where(Aula.codigo == payload.aula, Aula.activa.is_(True))
    ):
        raise HTTPException(status_code=422, detail="Selecciona un aula activa del catálogo")
    exception = ExcepcionHorario(curso_id=course.id, **payload.model_dump())
    db.add(exception)
    add_course_schedule_notifications(db, course)
    _commit_with_conflict_check(db, {course.id}, check_capacity=True)
    db.refresh(exception)
    return ScheduleExceptionPublic.model_validate(exception)


def delete_exception(db: Session, course_id: UUID, exception_id: UUID) -> None:
    _course_or_404(db, course_id)
    _lock_course_students(db, {course_id})
    _lock_courses(db, {course_id})
    exception = db.scalar(
        select(ExcepcionHorario).where(
            ExcepcionHorario.id == exception_id, ExcepcionHorario.curso_id == course_id
        )
    )
    if not exception:
        raise HTTPException(status_code=404, detail="Excepción de horario no encontrada")
    db.delete(exception)
    add_course_schedule_notifications(db, _course_or_404(db, course_id))
    _commit_with_conflict_check(db, {course_id}, check_capacity=True)
