from collections import defaultdict
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.access.models.user import PerfilEstudiante, UserRole, Usuario
from app.modules.curriculum.models.entities import (
    Carrera,
    EstadoPlan,
    Facultad,
    Materia,
    MateriaPlan,
    PlanEstudio,
    Prerrequisito,
    UnidadPlan,
)
from app.modules.enrollments.models.entities import Inscripcion
from app.modules.grades.models.entities import Calificacion
from app.modules.parallel.models.entities import Curso, PlantillaModular
from app.modules.periods.models.entities import (
    AperturaPlan,
    PeriodoAcademico,
    PeriodoCarrera,
    PeriodoPlan,
    SemestreGrupo,
)
from app.modules.periods.schemas.planning import (
    PeriodPlanningPublic,
    PeriodSubjectOverviewPublic,
    PlanOpeningPublic,
    PlanProjectionSlot,
    SubjectSuggestionPublic,
)
from app.modules.periods.services.group_progression import (
    fill_group_slots,
    group_code,
    group_period_number,
    group_slots,
)


def _period(db: Session, period_id: UUID) -> PeriodoAcademico:
    period = db.get(PeriodoAcademico, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Semestre académico no encontrado")
    return period


def _plan(db: Session, plan_id: UUID) -> PlanEstudio:
    plan = db.get(PlanEstudio, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de estudios no encontrado")
    return plan


def period_planning(db: Session, period_id: UUID) -> PeriodPlanningPublic:
    period = _period(db, period_id)
    return PeriodPlanningPublic(
        periodo_id=period_id,
        carrera_ids=db.scalars(
            select(PeriodoCarrera.carrera_id).where(PeriodoCarrera.periodo_id == period_id)
        ).all(),
        plan_ids=db.scalars(
            select(PeriodoPlan.plan_id).where(PeriodoPlan.periodo_id == period_id)
        ).all(),
        plantilla_modular_id=period.plantilla_modular_id,
    )


def period_subject_overview(db: Session, period_id: UUID) -> list[PeriodSubjectOverviewPublic]:
    _period(db, period_id)
    plans = db.execute(
        select(PlanEstudio, Carrera, Facultad)
        .join(PeriodoPlan, PeriodoPlan.plan_id == PlanEstudio.id)
        .join(Carrera, Carrera.id == PlanEstudio.carrera_id)
        .join(Facultad, Facultad.id == Carrera.facultad_id)
        .where(PeriodoPlan.periodo_id == period_id)
        .order_by(Facultad.nombre, Carrera.nombre, PlanEstudio.codigo)
    ).all()
    return [
        PeriodSubjectOverviewPublic(
            **suggestion.model_dump(),
            facultad_id=faculty.id,
            facultad_nombre=faculty.nombre,
            carrera_id=career.id,
            carrera_nombre=career.nombre,
            plan_id=plan.id,
            plan_codigo=plan.codigo,
            plan_modalidad=plan.modalidad.value,
            plan_estado=plan.estado.value,
        )
        for plan, career, faculty in plans
        for suggestion in subject_suggestions(db, period_id, plan.id)
    ]


def set_modular_template(db: Session, period_id: UUID, template_id: UUID) -> PeriodPlanningPublic:
    period = db.scalar(
        select(PeriodoAcademico).where(PeriodoAcademico.id == period_id).with_for_update()
    )
    if not period:
        raise HTTPException(status_code=404, detail="Semestre académico no encontrado")
    template = db.get(PlantillaModular, template_id)
    if not template or not template.activa:
        raise HTTPException(status_code=422, detail="Selecciona una plantilla modular activa")
    if period.plantilla_modular_id != template_id and db.scalar(
        select(Curso.id)
        .where(Curso.periodo_id == period_id, Curso.plantilla_modular_id.is_not(None))
        .limit(1)
    ):
        raise HTTPException(
            status_code=409,
            detail="El semestre ya tiene módulos programados; conserva su plantilla",
        )
    period.plantilla_modular_id = template_id
    db.commit()
    return period_planning(db, period_id)


def add_career(db: Session, period_id: UUID, career_id: UUID) -> PeriodPlanningPublic:
    _period(db, period_id)
    career = db.get(Carrera, career_id)
    if not career or not career.activo:
        raise HTTPException(status_code=422, detail="Selecciona una carrera activa")
    if not db.get(PeriodoCarrera, (period_id, career_id)):
        db.add(PeriodoCarrera(periodo_id=period_id, carrera_id=career_id))
        db.commit()
    return period_planning(db, period_id)


def remove_career(db: Session, period_id: UUID, career_id: UUID) -> PeriodPlanningPublic:
    _period(db, period_id)
    member = db.get(PeriodoCarrera, (period_id, career_id))
    if not member:
        raise HTTPException(status_code=404, detail="La carrera no participa en este semestre")
    plan_in_period = db.scalar(
        select(PeriodoPlan.plan_id)
        .join(PlanEstudio, PlanEstudio.id == PeriodoPlan.plan_id)
        .where(PeriodoPlan.periodo_id == period_id, PlanEstudio.carrera_id == career_id)
        .limit(1)
    )
    if plan_in_period:
        raise HTTPException(status_code=409, detail="Quita primero los planes de la carrera")
    db.delete(member)
    db.commit()
    return period_planning(db, period_id)


def add_plan(db: Session, period_id: UUID, plan_id: UUID) -> PeriodPlanningPublic:
    _period(db, period_id)
    plan = _plan(db, plan_id)
    if plan.estado != EstadoPlan.VIGENTE:
        raise HTTPException(status_code=409, detail="El plan debe estar VIGENTE")
    if not db.get(PeriodoCarrera, (period_id, plan.carrera_id)):
        raise HTTPException(status_code=409, detail="Incorpora primero la carrera al semestre")
    if not db.get(PeriodoPlan, (period_id, plan_id)):
        db.add(PeriodoPlan(periodo_id=period_id, plan_id=plan_id))
        db.commit()
    return period_planning(db, period_id)


def remove_plan(db: Session, period_id: UUID, plan_id: UUID) -> PeriodPlanningPublic:
    _period(db, period_id)
    member = db.get(PeriodoPlan, (period_id, plan_id))
    if not member:
        raise HTTPException(status_code=404, detail="El plan no participa en este semestre")
    has_courses = db.scalar(
        select(Curso.id)
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .where(Curso.periodo_id == period_id, MateriaPlan.plan_id == plan_id)
        .limit(1)
    )
    has_opening = db.scalar(
        select(AperturaPlan.id)
        .where(AperturaPlan.plan_id == plan_id, AperturaPlan.periodo_inicio_id == period_id)
        .limit(1)
    )
    if has_courses or has_opening:
        raise HTTPException(
            status_code=409,
            detail="El plan tiene paralelos o un grupo de inicio en este semestre",
        )
    db.delete(member)
    db.commit()
    return period_planning(db, period_id)


def create_opening(db: Session, period_id: UUID, plan_id: UUID) -> PlanOpeningPublic:
    period = _period(db, period_id)
    plan = _plan(db, plan_id)
    if plan.estado != EstadoPlan.VIGENTE:
        raise HTTPException(status_code=409, detail="El plan debe estar VIGENTE")
    if not db.get(PeriodoPlan, (period_id, plan_id)):
        raise HTTPException(status_code=409, detail="Incorpora el plan al semestre primero")
    if db.scalar(
        select(AperturaPlan.id).where(
            AperturaPlan.carrera_id == plan.carrera_id,
            AperturaPlan.periodo_inicio_id == period_id,
        )
    ):
        raise HTTPException(
            status_code=409, detail="Esta carrera ya tiene un grupo que inicia aquí"
        )
    opening = AperturaPlan(
        plan_id=plan_id,
        carrera_id=plan.carrera_id,
        periodo_inicio_id=period_id,
        codigo=group_code(db, plan, period),
    )
    db.add(opening)
    try:
        db.flush()
        fill_group_slots(db, opening)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Este grupo ya existe") from exc
    db.refresh(opening)
    return PlanOpeningPublic(
        id=opening.id,
        codigo=opening.codigo,
        plan_id=plan_id,
        periodo_inicio_id=period_id,
        periodo_denominacion=period.denominacion,
        estudiantes=0,
        semestre_proyectado=1,
        proyeccion=_projection(db, opening),
    )


def remove_opening(db: Session, period_id: UUID, opening_id: UUID) -> None:
    _period(db, period_id)
    opening = db.scalar(
        select(AperturaPlan)
        .where(AperturaPlan.id == opening_id, AperturaPlan.periodo_inicio_id == period_id)
        .with_for_update()
    )
    if not opening:
        raise HTTPException(
            status_code=404, detail="Grupo de ingreso no encontrado en este semestre"
        )
    has_students = db.scalar(
        select(PerfilEstudiante.usuario_id)
        .where(PerfilEstudiante.apertura_plan_id == opening_id)
        .limit(1)
    )
    has_courses = db.scalar(select(Curso.id).where(Curso.apertura_plan_id == opening_id).limit(1))
    if has_students or has_courses:
        raise HTTPException(
            status_code=409,
            detail="El grupo ya tiene estudiantes o paralelos; no se puede deshacer su inicio",
        )
    db.execute(delete(SemestreGrupo).where(SemestreGrupo.apertura_plan_id == opening_id))
    db.delete(opening)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El grupo tiene datos asociados") from exc


def _projection(db: Session, opening: AperturaPlan) -> list[PlanProjectionSlot]:
    return [
        PlanProjectionSlot(
            semestre_numero=slot.numero,
            periodo_id=slot.periodo_id,
            periodo_denominacion=(
                db.get(PeriodoAcademico, slot.periodo_id).denominacion if slot.periodo_id else None
            ),
        )
        for slot in group_slots(db, opening)
    ]


def list_openings(
    db: Session, plan_id: UUID, target_period_id: UUID | None = None
) -> list[PlanOpeningPublic]:
    _plan(db, plan_id)
    target = _period(db, target_period_id) if target_period_id else None
    rows = db.scalars(
        select(AperturaPlan)
        .join(PeriodoAcademico, PeriodoAcademico.id == AperturaPlan.periodo_inicio_id)
        .where(AperturaPlan.plan_id == plan_id)
        .order_by(PeriodoAcademico.fecha_inicio)
    ).all()
    result = []
    for opening in rows:
        start = db.get(PeriodoAcademico, opening.periodo_inicio_id)
        count = int(
            db.scalar(
                select(func.count(PerfilEstudiante.usuario_id)).where(
                    PerfilEstudiante.apertura_plan_id == opening.id
                )
            )
            or 0
        )
        result.append(
            PlanOpeningPublic(
                id=opening.id,
                codigo=opening.codigo,
                plan_id=plan_id,
                periodo_inicio_id=start.id,
                periodo_denominacion=start.denominacion,
                estudiantes=count,
                semestre_proyectado=group_period_number(db, opening, target.id) if target else None,
                proyeccion=_projection(db, opening),
            )
        )
    return result


def subject_suggestions(
    db: Session, period_id: UUID, plan_id: UUID
) -> list[SubjectSuggestionPublic]:
    target = _period(db, period_id)
    _plan(db, plan_id)
    if not db.get(PeriodoPlan, (period_id, plan_id)):
        raise HTTPException(status_code=409, detail="Incorpora el plan al semestre primero")
    subjects = db.execute(
        select(MateriaPlan, Materia, UnidadPlan)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
        .join(UnidadPlan, UnidadPlan.id == MateriaPlan.unidad_id)
        .where(MateriaPlan.plan_id == plan_id)
        .order_by(UnidadPlan.numero, Materia.codigo)
    ).all()
    students = db.scalars(
        select(PerfilEstudiante)
        .join(Usuario, Usuario.id == PerfilEstudiante.usuario_id)
        .where(
            PerfilEstudiante.plan_estudio_id == plan_id,
            Usuario.rol == UserRole.ESTUDIANTE,
            Usuario.activo.is_(True),
        )
    ).all()
    requirements: dict[UUID, list[UUID]] = defaultdict(list)
    requirement_codes = {}
    for subject_id, requirement_id, code in db.execute(
        select(
            Prerrequisito.materia_plan_id,
            Prerrequisito.requisito_materia_plan_id,
            Materia.codigo,
        )
        .join(MateriaPlan, MateriaPlan.id == Prerrequisito.requisito_materia_plan_id)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
        .where(Prerrequisito.plan_id == plan_id)
    ):
        requirements[subject_id].append(requirement_id)
        requirement_codes[requirement_id] = code
    records: dict[UUID, dict[UUID, list[int | None]]] = defaultdict(lambda: defaultdict(list))
    for student_id, subject_id, grade in db.execute(
        select(Inscripcion.estudiante_id, Curso.materia_plan_id, Calificacion.nota_final)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .join(PeriodoAcademico, PeriodoAcademico.id == Curso.periodo_id)
        .outerjoin(Calificacion, Calificacion.inscripcion_id == Inscripcion.id)
        .where(MateriaPlan.plan_id == plan_id, PeriodoAcademico.fecha_fin < target.fecha_inicio)
    ):
        records[student_id][subject_id].append(grade)
    openings = list_openings(db, plan_id, period_id)
    cohorts_by_semester: dict[int, int] = defaultdict(int)
    student_semester: dict[UUID, int] = {}
    for opening in openings:
        semester = opening.semestre_proyectado
        if semester is None:
            continue
        cohorts_by_semester[semester] += 1
        for student in students:
            if student.apertura_plan_id == opening.id:
                student_semester[student.usuario_id] = semester
    active_courses = db.execute(
        select(Curso.materia_plan_id, func.count(Curso.id))
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .where(Curso.periodo_id == period_id, MateriaPlan.plan_id == plan_id)
        .group_by(Curso.materia_plan_id)
    ).all()
    course_counts = dict(active_courses)
    suggestions = []
    for entry, subject, unit in subjects:
        approved = eligible = repeat = blocked = pending = nominal_students = 0
        for student in students:
            history = records[student.usuario_id]
            subject_grades = history[entry.id]
            passed = any(grade is not None and grade >= 51 for grade in subject_grades)
            if passed:
                approved += 1
                continue
            if any(grade is None for grade in subject_grades):
                pending += 1
                continue
            missing = any(
                not any(grade is not None and grade >= 51 for grade in history[required])
                for required in requirements[entry.id]
            )
            if missing:
                blocked += 1
                continue
            eligible += 1
            if subject_grades:
                repeat += 1
            if student_semester.get(student.usuario_id) == unit.numero:
                nominal_students += 1
        scheduled_cohorts = cohorts_by_semester[unit.numero]
        suggestions.append(
            SubjectSuggestionPublic(
                materia_plan_id=entry.id,
                codigo=subject.codigo,
                nombre=subject.nombre,
                semestre_numero=unit.numero,
                semestre_nombre=unit.nombre,
                prerrequisitos=[requirement_codes[item] for item in requirements[entry.id]],
                paralelos=course_counts.get(entry.id, 0),
                cohortes_previstas=scheduled_cohorts,
                estudiantes_previstos=nominal_students,
                aptos=eligible,
                repetidores=repeat,
                bloqueados=blocked,
                sin_nota=pending,
                aprobados=approved,
                recomendada=bool(eligible and (nominal_students or repeat)),
            )
        )
    return suggestions
