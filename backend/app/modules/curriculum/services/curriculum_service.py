from collections import defaultdict
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

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
from app.modules.curriculum.schemas.curriculum import (
    CareerCreate,
    CareerPublic,
    CareerUpdate,
    FacultyCreate,
    FacultyPublic,
    FacultyUpdate,
    PlanCreate,
    PlanDiagnostic,
    PlanDuplicate,
    PlanPublic,
    PlanSubjectCreate,
    PlanSubjectPublic,
    PlanSubjectsBulkCreate,
    PlanSubjectUpdate,
    PlanUnitsGenerate,
    PlanUpdate,
    PrerequisiteCreate,
    StudentPlanPublic,
    SubjectCreate,
    SubjectPublic,
    SubjectUpdate,
    UnitCreate,
    UnitPublic,
    UnitUpdate,
    UnitWithSubjects,
)
from app.modules.enrollments.models.entities import Inscripcion
from app.modules.parallel.models.entities import Curso
from app.modules.periods.models.entities import (
    AperturaPlan,
    PeriodoAcademico,
    PeriodoCarrera,
    PeriodoPlan,
)


def _save(db: Session, duplicate_message: str = "El código ya está registrado") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=duplicate_message) from exc


def _flush(db: Session, duplicate_message: str = "El código ya está registrado") -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=duplicate_message) from exc


def _count(db: Session, statement) -> int:
    return int(db.scalar(statement) or 0)


def _faculty_public(
    faculty: Facultad,
    careers_count: int = 0,
    active_careers_count: int = 0,
    plans_count: int = 0,
    active_plans_count: int = 0,
) -> FacultyPublic:
    output = FacultyPublic.model_validate(faculty)
    output.carreras_count = careers_count
    output.carreras_activas_count = active_careers_count
    output.planes_count = plans_count
    output.planes_vigentes_count = active_plans_count
    return output


def _faculty_output(db: Session, faculty: Facultad) -> FacultyPublic:
    return _faculty_public(
        faculty,
        careers_count=_count(
            db, select(func.count(Carrera.id)).where(Carrera.facultad_id == faculty.id)
        ),
        active_careers_count=_count(
            db,
            select(func.count(Carrera.id)).where(
                Carrera.facultad_id == faculty.id, Carrera.activo.is_(True)
            ),
        ),
        plans_count=_count(
            db,
            select(func.count(PlanEstudio.id))
            .join(Carrera, Carrera.id == PlanEstudio.carrera_id)
            .where(Carrera.facultad_id == faculty.id),
        ),
        active_plans_count=_count(
            db,
            select(func.count(PlanEstudio.id))
            .join(Carrera, Carrera.id == PlanEstudio.carrera_id)
            .where(
                Carrera.facultad_id == faculty.id,
                PlanEstudio.estado == EstadoPlan.VIGENTE,
            ),
        ),
    )


def _career_public(
    career: Carrera,
    plans_count: int = 0,
    active_plans_count: int = 0,
    subjects_count: int = 0,
    students_count: int = 0,
) -> CareerPublic:
    output = CareerPublic.model_validate(career)
    output.planes_count = plans_count
    output.planes_vigentes_count = active_plans_count
    output.materias_count = subjects_count
    output.estudiantes_count = students_count
    return output


def _career_output(db: Session, career: Carrera) -> CareerPublic:
    return _career_public(
        career,
        plans_count=_count(
            db, select(func.count(PlanEstudio.id)).where(PlanEstudio.carrera_id == career.id)
        ),
        active_plans_count=_count(
            db,
            select(func.count(PlanEstudio.id)).where(
                PlanEstudio.carrera_id == career.id, PlanEstudio.estado == EstadoPlan.VIGENTE
            ),
        ),
        subjects_count=_count(
            db,
            select(func.count(func.distinct(MateriaPlan.materia_id)))
            .select_from(MateriaPlan)
            .join(PlanEstudio, PlanEstudio.id == MateriaPlan.plan_id)
            .where(PlanEstudio.carrera_id == career.id),
        ),
        students_count=_count(
            db,
            select(func.count(PerfilEstudiante.usuario_id))
            .join(PlanEstudio, PlanEstudio.id == PerfilEstudiante.plan_estudio_id)
            .where(PlanEstudio.carrera_id == career.id),
        ),
    )


def _subject_public(
    subject: Materia,
    plans_count: int = 0,
    active_plans_count: int = 0,
    careers_count: int = 0,
    courses_count: int = 0,
) -> SubjectPublic:
    output = SubjectPublic.model_validate(subject)
    output.planes_count = plans_count
    output.planes_vigentes_count = active_plans_count
    output.carreras_count = careers_count
    output.ofertas_count = courses_count
    return output


def _subject_output(db: Session, subject: Materia) -> SubjectPublic:
    return _subject_public(
        subject,
        plans_count=_count(
            db, select(func.count(MateriaPlan.id)).where(MateriaPlan.materia_id == subject.id)
        ),
        active_plans_count=_count(
            db,
            select(func.count(MateriaPlan.id))
            .select_from(MateriaPlan)
            .join(PlanEstudio, PlanEstudio.id == MateriaPlan.plan_id)
            .where(
                MateriaPlan.materia_id == subject.id,
                PlanEstudio.estado == EstadoPlan.VIGENTE,
            ),
        ),
        careers_count=_count(
            db,
            select(func.count(func.distinct(PlanEstudio.carrera_id)))
            .select_from(MateriaPlan)
            .join(PlanEstudio, PlanEstudio.id == MateriaPlan.plan_id)
            .where(MateriaPlan.materia_id == subject.id),
        ),
        courses_count=_count(
            db,
            select(func.count(Curso.id))
            .select_from(MateriaPlan)
            .join(Curso, Curso.materia_plan_id == MateriaPlan.id)
            .where(MateriaPlan.materia_id == subject.id),
        ),
    )


def list_careers(db: Session) -> list[CareerPublic]:
    careers = db.scalars(
        select(Carrera).options(selectinload(Carrera.facultad)).order_by(Carrera.codigo)
    ).all()
    plan_counts = dict(
        db.execute(
            select(PlanEstudio.carrera_id, func.count(PlanEstudio.id)).group_by(
                PlanEstudio.carrera_id
            )
        ).all()
    )
    active_plan_counts = dict(
        db.execute(
            select(PlanEstudio.carrera_id, func.count(PlanEstudio.id))
            .where(PlanEstudio.estado == EstadoPlan.VIGENTE)
            .group_by(PlanEstudio.carrera_id)
        ).all()
    )
    subject_counts = dict(
        db.execute(
            select(PlanEstudio.carrera_id, func.count(func.distinct(MateriaPlan.materia_id)))
            .select_from(PlanEstudio)
            .join(MateriaPlan, MateriaPlan.plan_id == PlanEstudio.id)
            .group_by(PlanEstudio.carrera_id)
        ).all()
    )
    student_counts = dict(
        db.execute(
            select(PlanEstudio.carrera_id, func.count(PerfilEstudiante.usuario_id))
            .select_from(PlanEstudio)
            .join(PerfilEstudiante, PerfilEstudiante.plan_estudio_id == PlanEstudio.id)
            .group_by(PlanEstudio.carrera_id)
        ).all()
    )
    return [
        _career_public(
            career,
            plans_count=plan_counts.get(career.id, 0),
            active_plans_count=active_plan_counts.get(career.id, 0),
            subjects_count=subject_counts.get(career.id, 0),
            students_count=student_counts.get(career.id, 0),
        )
        for career in careers
    ]


def create_career(db: Session, payload: CareerCreate) -> CareerPublic:
    faculty = db.get(Facultad, payload.facultad_id)
    if not faculty:
        raise HTTPException(status_code=404, detail="Facultad no encontrada")
    if not faculty.activo:
        raise HTTPException(
            status_code=409,
            detail="No se puede registrar una carrera en una facultad inactiva",
        )
    career = Carrera(
        codigo=payload.codigo, nombre=payload.nombre, facultad_id=payload.facultad_id, activo=True
    )
    db.add(career)
    _save(db)
    db.refresh(career)
    return _career_output(db, career)


def update_career(db: Session, career_id: UUID, payload: CareerUpdate) -> CareerPublic:
    career = db.get(Carrera, career_id)
    if not career:
        raise HTTPException(status_code=404, detail="Carrera no encontrada")
    changes = payload.model_dump(exclude_unset=True)
    target_faculty = career.facultad
    if "facultad_id" in changes:
        faculty = db.get(Facultad, changes["facultad_id"])
        if not faculty:
            raise HTTPException(status_code=404, detail="Facultad no encontrada")
        if changes["facultad_id"] != career.facultad_id and not faculty.activo:
            raise HTTPException(
                status_code=409,
                detail="No se puede mover una carrera a una facultad inactiva",
            )
        target_faculty = faculty
    if changes.get("activo") is True and not target_faculty.activo:
        raise HTTPException(
            status_code=409,
            detail="No se puede reactivar una carrera cuya facultad está inactiva",
        )
    if changes.get("activo") is False:
        active_plans = _count(
            db,
            select(func.count(PlanEstudio.id)).where(
                PlanEstudio.carrera_id == career.id, PlanEstudio.estado == EstadoPlan.VIGENTE
            ),
        )
        if active_plans:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No se puede inactivar la carrera {career.codigo}: tiene "
                    f"{active_plans} plan(es) vigente(s). Desactiva primero esos planes."
                ),
            )
    for name, value in changes.items():
        setattr(career, name, value)
    _save(db)
    db.refresh(career)
    return _career_output(db, career)


def list_faculties(db: Session) -> list[FacultyPublic]:
    faculties = db.scalars(select(Facultad).order_by(Facultad.codigo)).all()
    career_counts = dict(
        db.execute(
            select(Carrera.facultad_id, func.count(Carrera.id)).group_by(Carrera.facultad_id)
        ).all()
    )
    active_career_counts = dict(
        db.execute(
            select(Carrera.facultad_id, func.count(Carrera.id))
            .where(Carrera.activo.is_(True))
            .group_by(Carrera.facultad_id)
        ).all()
    )
    plan_counts = dict(
        db.execute(
            select(Carrera.facultad_id, func.count(PlanEstudio.id))
            .join(PlanEstudio, PlanEstudio.carrera_id == Carrera.id)
            .group_by(Carrera.facultad_id)
        ).all()
    )
    return [
        _faculty_public(
            faculty,
            careers_count=career_counts.get(faculty.id, 0),
            active_careers_count=active_career_counts.get(faculty.id, 0),
            plans_count=plan_counts.get(faculty.id, 0),
        )
        for faculty in faculties
    ]


def create_faculty(db: Session, payload: FacultyCreate) -> FacultyPublic:
    faculty = Facultad(codigo=payload.codigo, nombre=payload.nombre, activo=True)
    db.add(faculty)
    _save(db)
    db.refresh(faculty)
    return _faculty_output(db, faculty)


def update_faculty(db: Session, faculty_id: UUID, payload: FacultyUpdate) -> FacultyPublic:
    faculty = db.get(Facultad, faculty_id)
    if not faculty:
        raise HTTPException(status_code=404, detail="Facultad no encontrada")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("activo") is False:
        active_careers = _count(
            db,
            select(func.count(Carrera.id)).where(
                Carrera.facultad_id == faculty.id, Carrera.activo.is_(True)
            ),
        )
        if active_careers:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No se puede inactivar la facultad {faculty.codigo}: tiene "
                    f"{active_careers} carrera(s) activa(s). Inactívalas primero."
                ),
            )
    for name, value in changes.items():
        setattr(faculty, name, value)
    _save(db)
    db.refresh(faculty)
    return _faculty_output(db, faculty)


def delete_faculty(db: Session, faculty_id: UUID) -> None:
    faculty = db.get(Facultad, faculty_id)
    if not faculty:
        raise HTTPException(status_code=404, detail="Facultad no encontrada")
    careers_count = _count(
        db, select(func.count(Carrera.id)).where(Carrera.facultad_id == faculty_id)
    )
    if careers_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar la facultad {faculty.codigo}: tiene "
                f"{careers_count} carrera(s) asociada(s)."
            ),
        )
    db.delete(faculty)
    _save(db, "No se puede eliminar una facultad con carreras")


def delete_career(db: Session, career_id: UUID) -> None:
    career = db.get(Carrera, career_id)
    if not career:
        raise HTTPException(status_code=404, detail="Carrera no encontrada")
    plans_count = _count(
        db, select(func.count(PlanEstudio.id)).where(PlanEstudio.carrera_id == career_id)
    )
    if plans_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar la carrera {career.codigo}: tiene "
                f"{plans_count} plan(es) asociado(s)."
            ),
        )
    periods_count = _count(
        db,
        select(func.count(PeriodoCarrera.periodo_id)).where(PeriodoCarrera.carrera_id == career_id),
    )
    if periods_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar la carrera {career.codigo}: participa en "
                f"{periods_count} semestre(s) académico(s)."
            ),
        )
    db.delete(career)
    _save(db, "No se puede eliminar una carrera con planes")


def list_subjects(db: Session) -> list[SubjectPublic]:
    subjects = db.scalars(select(Materia).order_by(Materia.codigo)).all()
    plan_counts = dict(
        db.execute(
            select(MateriaPlan.materia_id, func.count(MateriaPlan.id)).group_by(
                MateriaPlan.materia_id
            )
        ).all()
    )
    active_plan_counts = dict(
        db.execute(
            select(MateriaPlan.materia_id, func.count(MateriaPlan.id))
            .select_from(MateriaPlan)
            .join(PlanEstudio, PlanEstudio.id == MateriaPlan.plan_id)
            .where(PlanEstudio.estado == EstadoPlan.VIGENTE)
            .group_by(MateriaPlan.materia_id)
        ).all()
    )
    career_counts = dict(
        db.execute(
            select(MateriaPlan.materia_id, func.count(func.distinct(PlanEstudio.carrera_id)))
            .select_from(MateriaPlan)
            .join(PlanEstudio, PlanEstudio.id == MateriaPlan.plan_id)
            .group_by(MateriaPlan.materia_id)
        ).all()
    )
    course_counts = dict(
        db.execute(
            select(MateriaPlan.materia_id, func.count(Curso.id))
            .select_from(MateriaPlan)
            .join(Curso, Curso.materia_plan_id == MateriaPlan.id)
            .group_by(MateriaPlan.materia_id)
        ).all()
    )
    return [
        _subject_public(
            subject,
            plans_count=plan_counts.get(subject.id, 0),
            active_plans_count=active_plan_counts.get(subject.id, 0),
            careers_count=career_counts.get(subject.id, 0),
            courses_count=course_counts.get(subject.id, 0),
        )
        for subject in subjects
    ]


def create_subject(db: Session, payload: SubjectCreate) -> SubjectPublic:
    subject = Materia(codigo=payload.codigo, nombre=payload.nombre, activo=True)
    db.add(subject)
    _save(db)
    db.refresh(subject)
    return _subject_output(db, subject)


def update_subject(db: Session, subject_id: UUID, payload: SubjectUpdate) -> SubjectPublic:
    subject = db.get(Materia, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("activo") is False:
        active_plans = _count(
            db,
            select(func.count(MateriaPlan.id))
            .select_from(MateriaPlan)
            .join(PlanEstudio, PlanEstudio.id == MateriaPlan.plan_id)
            .where(
                MateriaPlan.materia_id == subject.id,
                PlanEstudio.estado == EstadoPlan.VIGENTE,
            ),
        )
        if active_plans:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No se puede inactivar la materia {subject.codigo}: forma parte de "
                    f"{active_plans} plan(es) vigente(s). Desactiva primero esos planes "
                    "o crea una nueva versión sin ella."
                ),
            )
    for name, value in changes.items():
        setattr(subject, name, value)
    _save(db)
    db.refresh(subject)
    return _subject_output(db, subject)


def delete_subject(db: Session, subject_id: UUID) -> None:
    subject = db.get(Materia, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    plans_count = _count(
        db, select(func.count(MateriaPlan.id)).where(MateriaPlan.materia_id == subject_id)
    )
    if plans_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar la materia {subject.codigo}: está incorporada a "
                f"{plans_count} plan(es). Retírala de los planes o inactívala."
            ),
        )
    courses_count = _count(
        db,
        select(func.count(Curso.id))
        .select_from(MateriaPlan)
        .join(Curso, Curso.materia_plan_id == MateriaPlan.id)
        .where(MateriaPlan.materia_id == subject_id),
    )
    if courses_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar la materia {subject.codigo}: tiene "
                f"{courses_count} paralelo(s)/oferta(s) vinculados."
            ),
        )
    db.delete(subject)
    _save(db, "No se puede eliminar una materia vinculada a un plan u oferta")


def _plan_or_404(db: Session, plan_id: UUID) -> PlanEstudio:
    plan = db.get(PlanEstudio, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de estudio no encontrado")
    return plan


def _require_draft(plan: PlanEstudio) -> None:
    if plan.estado != EstadoPlan.BORRADOR:
        raise HTTPException(
            status_code=409,
            detail="La estructura solo puede editarse mientras el plan esté en BORRADOR",
        )


def _prerequisite_cycles(prerequisites: dict[UUID, list[UUID]]) -> list[list[UUID]]:
    """Devuelve cada ciclo del grafo de prerrequisitos una sola vez.

    El grafo va de materia dependiente a materia requisito. Se recorre en
    profundidad con marcas blanco/gris/negro para detectar aristas que vuelven
    a un nodo todavía en la ruta actual.
    """
    color: dict[UUID, int] = {}
    cycles: list[list[UUID]] = []
    seen: set[frozenset[UUID]] = set()
    for start in prerequisites:
        if color.get(start, 0) != 0:
            continue
        stack: list[tuple[UUID, int]] = [(start, 0)]
        path: list[UUID] = []
        while stack:
            node, index = stack[-1]
            if index == 0:
                color[node] = 1
                path.append(node)
            requirements = prerequisites.get(node, [])
            if index < len(requirements):
                stack[-1] = (node, index + 1)
                requirement = requirements[index]
                state = color.get(requirement, 0)
                if state == 0:
                    stack.append((requirement, 0))
                elif state == 1:
                    cycle = path[path.index(requirement) :]
                    key = frozenset(cycle)
                    if key not in seen:
                        seen.add(key)
                        cycles.append(list(cycle))
            else:
                color[node] = 2
                path.pop()
                stack.pop()
    return cycles


def _plan_diagnostics(
    plan: PlanEstudio,
    units: list[UnidadPlan],
    entry_unit: dict[UUID, UnidadPlan],
    entry_by_id: dict[UUID, MateriaPlan],
    prerequisites: dict[UUID, list[UUID]],
) -> list[PlanDiagnostic]:
    diagnostics: list[PlanDiagnostic] = []
    publication_context = plan.estado in {EstadoPlan.BORRADOR, EstadoPlan.INACTIVO}

    def add(
        code: str,
        message: str,
        severity: str = "error",
        *,
        unit_id: UUID | None = None,
        subject_plan_id: UUID | None = None,
    ) -> None:
        diagnostics.append(
            PlanDiagnostic(
                tipo=severity,
                codigo=code,
                mensaje=message,
                unidad_id=unit_id,
                materia_plan_id=subject_plan_id,
            )
        )

    if not plan.carrera.activo:
        add(
            "carrera_inactiva",
            f"La carrera {plan.carrera.codigo} está inactiva.",
            "error" if publication_context else "warning",
        )
    if not plan.carrera.facultad.activo:
        add(
            "facultad_inactiva",
            f"La facultad {plan.carrera.facultad.codigo} está inactiva.",
            "error" if publication_context else "warning",
        )

    if not units:
        add("sin_semestres", "El plan no tiene semestres. Agrega al menos uno.")
    else:
        numbers = [unit.numero for unit in units]
        if numbers != list(range(1, len(numbers) + 1)):
            add(
                "semestres_no_consecutivos",
                (
                    "Los semestres deben numerarse 1, 2, 3… sin huecos. "
                    f"Numeración actual: {', '.join(str(number) for number in numbers)}."
                ),
            )
        empty = [str(unit.numero) for unit in units if not unit.materias_plan]
        if empty:
            add(
                "semestre_vacio",
                (
                    f"Semestres sin materias: {', '.join(empty)}. "
                    "Agrega materias o elimina el semestre."
                ),
            )

    if not entry_by_id:
        add("sin_materias", "El plan no tiene materias. Agrega materias a sus semestres.")

    inactive = sorted(
        {entry.materia.codigo for entry in entry_by_id.values() if not entry.materia.activo}
    )
    if inactive:
        add(
            "materia_inactiva",
            f"Materias inactivas en el catálogo: {', '.join(inactive)}.",
            "error" if publication_context else "warning",
        )

    for dependent_id, requirement_ids in prerequisites.items():
        dependent = entry_by_id.get(dependent_id)
        dependent_unit = entry_unit.get(dependent_id)
        if not dependent or not dependent_unit:
            continue
        for requirement_id in requirement_ids:
            requirement = entry_by_id.get(requirement_id)
            requirement_unit = entry_unit.get(requirement_id)
            if not requirement or not requirement_unit:
                continue
            if requirement_unit.numero > dependent_unit.numero:
                add(
                    "prerrequisito_posterior",
                    (
                        f"{dependent.materia.codigo} (semestre {dependent_unit.numero}) requiere "
                        f"{requirement.materia.codigo} (semestre {requirement_unit.numero}), "
                        "que está en un semestre posterior."
                    ),
                    "warning",
                    subject_plan_id=dependent.id,
                )
            elif requirement_unit.numero == dependent_unit.numero:
                add(
                    "prerrequisito_mismo_semestre",
                    (
                        f"{dependent.materia.codigo} y {requirement.materia.codigo} están en el "
                        f"semestre {dependent_unit.numero}; verifica que se curse primero."
                    ),
                    "warning",
                    subject_plan_id=dependent.id,
                )

    for cycle in _prerequisite_cycles(prerequisites):
        codes = [entry_by_id[item].materia.codigo for item in cycle if item in entry_by_id]
        if codes:
            add(
                "prerrequisito_ciclo",
                (
                    "Dependencia circular de prerrequisitos entre: "
                    f"{', '.join(codes)}. Corrige el orden antes de publicar."
                ),
                "error",
                subject_plan_id=cycle[0],
            )
    return diagnostics


def _plan_output(
    db: Session,
    plan: PlanEstudio,
    prerequisites_by_plan: dict[UUID, list[tuple[UUID, UUID]]] | None = None,
) -> PlanPublic:
    if prerequisites_by_plan is None:
        prerequisite_rows = db.execute(
            select(
                Prerrequisito.materia_plan_id,
                Prerrequisito.requisito_materia_plan_id,
            ).where(Prerrequisito.plan_id == plan.id)
        ).all()
    else:
        prerequisite_rows = prerequisites_by_plan.get(plan.id, [])

    prerequisites: dict[UUID, list[UUID]] = defaultdict(list)
    for dependent_id, requirement_id in prerequisite_rows:
        prerequisites[dependent_id].append(requirement_id)

    units = sorted(plan.unidades, key=lambda unit: unit.numero)
    entry_unit: dict[UUID, UnidadPlan] = {}
    entry_by_id: dict[UUID, MateriaPlan] = {}
    for unit in units:
        for entry in unit.materias_plan:
            entry_unit[entry.id] = unit
            entry_by_id[entry.id] = entry

    units_output: list[UnitWithSubjects] = []
    for unit in units:
        subjects = [
            PlanSubjectPublic(
                id=entry.id,
                materia_id=entry.materia_id,
                codigo=entry.materia.codigo,
                nombre=entry.materia.nombre,
                activo=entry.materia.activo,
                prerrequisitos=sorted(prerequisites[entry.id], key=str),
            )
            for entry in sorted(unit.materias_plan, key=lambda item: item.materia.codigo)
        ]
        units_output.append(
            UnitWithSubjects(
                id=unit.id,
                plan_id=unit.plan_id,
                numero=unit.numero,
                nombre=unit.nombre,
                materias=subjects,
            )
        )

    diagnostics = _plan_diagnostics(plan, units, entry_unit, entry_by_id, prerequisites)
    return PlanPublic(
        id=plan.id,
        carrera_id=plan.carrera_id,
        carrera_codigo=plan.carrera.codigo,
        carrera_nombre=plan.carrera.nombre,
        carrera_activa=plan.carrera.activo,
        facultad_activa=plan.carrera.facultad.activo,
        codigo=plan.codigo,
        modalidad=plan.modalidad,
        estado=plan.estado,
        total_semestres=len(units),
        total_materias=len(entry_by_id),
        puede_publicarse=not any(item.tipo == "error" for item in diagnostics),
        diagnosticos=diagnostics,
        unidades=units_output,
    )


def _ensure_publishable(db: Session, plan: PlanEstudio) -> None:
    output = _plan_output(db, plan)
    errors = [item.mensaje for item in output.diagnosticos if item.tipo == "error"]
    if errors:
        raise HTTPException(
            status_code=409,
            detail="No se puede publicar el plan: " + " ".join(errors),
        )


def list_plans(db: Session) -> list[PlanPublic]:
    plans = db.scalars(
        select(PlanEstudio)
        .options(
            selectinload(PlanEstudio.carrera).selectinload(Carrera.facultad),
            selectinload(PlanEstudio.unidades)
            .selectinload(UnidadPlan.materias_plan)
            .selectinload(MateriaPlan.materia),
        )
        .order_by(PlanEstudio.codigo)
    ).all()
    prerequisites_by_plan: dict[UUID, list[tuple[UUID, UUID]]] = defaultdict(list)
    for plan_id, dependent_id, requirement_id in db.execute(
        select(
            Prerrequisito.plan_id,
            Prerrequisito.materia_plan_id,
            Prerrequisito.requisito_materia_plan_id,
        )
    ):
        prerequisites_by_plan[plan_id].append((dependent_id, requirement_id))
    return [_plan_output(db, plan, prerequisites_by_plan) for plan in plans]


def create_plan(db: Session, payload: PlanCreate) -> PlanPublic:
    career = db.get(Carrera, payload.carrera_id)
    if not career:
        raise HTTPException(status_code=404, detail="Carrera no encontrada")
    if not career.activo:
        raise HTTPException(
            status_code=409,
            detail=f"La carrera {career.codigo} está inactiva: no admite planes nuevos",
        )
    if not career.facultad.activo:
        raise HTTPException(
            status_code=409,
            detail=(f"La facultad {career.facultad.codigo} está inactiva: no admite planes nuevos"),
        )
    plan = PlanEstudio(
        carrera_id=payload.carrera_id,
        codigo=payload.codigo,
        modalidad=payload.modalidad,
        estado=EstadoPlan.BORRADOR,
    )
    db.add(plan)
    _flush(db, "El código del plan ya está registrado en el sistema")
    for number in range(1, payload.semestres_iniciales + 1):
        db.add(UnidadPlan(plan_id=plan.id, numero=number, nombre=f"Semestre {number}"))
    _save(db, "El código del plan ya está registrado en el sistema")
    db.refresh(plan)
    return _plan_output(db, plan)


def update_plan(db: Session, plan_id: UUID, payload: PlanUpdate) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    changes = payload.model_dump(exclude_unset=True)
    if "codigo" in changes:
        _require_draft(plan)
        plan.codigo = changes["codigo"]
    if "estado" in changes:
        target = changes["estado"]
        allowed = {
            EstadoPlan.BORRADOR: {EstadoPlan.VIGENTE, EstadoPlan.INACTIVO},
            EstadoPlan.VIGENTE: {EstadoPlan.INACTIVO},
            EstadoPlan.INACTIVO: {EstadoPlan.VIGENTE},
        }
        if target != plan.estado and target not in allowed[plan.estado]:
            raise HTTPException(status_code=409, detail="Cambio de estado del plan no permitido")
        if target == EstadoPlan.VIGENTE and target != plan.estado:
            _ensure_publishable(db, plan)
        plan.estado = target
    _save(db, "El código del plan ya está registrado en el sistema")
    db.refresh(plan)
    return _plan_output(db, plan)


def delete_plan(db: Session, plan_id: UUID) -> None:
    plan = _plan_or_404(db, plan_id)
    students_count = _count(
        db,
        select(func.count(PerfilEstudiante.usuario_id)).where(
            PerfilEstudiante.plan_estudio_id == plan_id
        ),
    )
    if students_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar el plan {plan.codigo}: tiene "
                f"{students_count} estudiante(s) asignado(s)."
            ),
        )
    openings_count = _count(
        db, select(func.count(AperturaPlan.id)).where(AperturaPlan.plan_id == plan_id)
    )
    if openings_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar el plan {plan.codigo}: tiene "
                f"{openings_count} grupo(s) de ingreso."
            ),
        )
    periods_count = _count(
        db, select(func.count(PeriodoPlan.periodo_id)).where(PeriodoPlan.plan_id == plan_id)
    )
    if periods_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar el plan {plan.codigo}: está incorporado a "
                f"{periods_count} semestre(s) académico(s)."
            ),
        )
    courses_count = _count(
        db,
        select(func.count(Curso.id))
        .select_from(MateriaPlan)
        .join(Curso, Curso.materia_plan_id == MateriaPlan.id)
        .where(MateriaPlan.plan_id == plan_id),
    )
    if courses_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede eliminar el plan {plan.codigo}: tiene "
                f"{courses_count} paralelo(s)/oferta(s) vinculados."
            ),
        )
    db.delete(plan)
    _save(db, "No se puede eliminar un plan con estudiantes, ofertas o registros vinculados")


def duplicate_plan(db: Session, plan_id: UUID, payload: PlanDuplicate) -> PlanPublic:
    source = _plan_or_404(db, plan_id)
    if not source.carrera.activo:
        raise HTTPException(
            status_code=409,
            detail=f"La carrera {source.carrera.codigo} está inactiva: no admite planes nuevos",
        )
    if not source.carrera.facultad.activo:
        raise HTTPException(
            status_code=409,
            detail=(
                f"La facultad {source.carrera.facultad.codigo} está inactiva: "
                "no admite planes nuevos"
            ),
        )
    if db.scalar(select(PlanEstudio.id).where(PlanEstudio.codigo == payload.codigo).limit(1)):
        raise HTTPException(
            status_code=409, detail="El código del plan ya está registrado en el sistema"
        )
    clone = PlanEstudio(
        carrera_id=source.carrera_id,
        codigo=payload.codigo,
        modalidad=source.modalidad,
        estado=EstadoPlan.BORRADOR,
    )
    db.add(clone)
    _flush(db, "El código del plan ya está registrado en el sistema")

    unit_map: dict[UUID, UnidadPlan] = {}
    for unit in sorted(source.unidades, key=lambda item: item.numero):
        new_unit = UnidadPlan(plan_id=clone.id, numero=unit.numero, nombre=unit.nombre)
        db.add(new_unit)
        _flush(db, "No se pudo duplicar la estructura del plan")
        unit_map[unit.id] = new_unit

    entry_map: dict[UUID, MateriaPlan] = {}
    for entry in source.materias_plan:
        new_entry = MateriaPlan(
            plan_id=clone.id,
            unidad_id=unit_map[entry.unidad_id].id,
            materia_id=entry.materia_id,
        )
        db.add(new_entry)
        _flush(db, "No se pudo duplicar la estructura del plan")
        entry_map[entry.id] = new_entry

    for prerequisite in db.scalars(
        select(Prerrequisito).where(Prerrequisito.plan_id == source.id)
    ).all():
        db.add(
            Prerrequisito(
                plan_id=clone.id,
                materia_plan_id=entry_map[prerequisite.materia_plan_id].id,
                requisito_materia_plan_id=entry_map[prerequisite.requisito_materia_plan_id].id,
            )
        )
    _save(db, "No se pudo duplicar el plan")
    db.refresh(clone)
    return _plan_output(db, clone)


def create_unit(db: Session, plan_id: UUID, payload: UnitCreate) -> UnitPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    unit = UnidadPlan(plan_id=plan_id, numero=payload.numero, nombre=payload.nombre)
    db.add(unit)
    _save(db, "Ya existe ese número de unidad en el plan")
    db.refresh(unit)
    return UnitPublic.model_validate(unit)


def generate_units(db: Session, plan_id: UUID, payload: PlanUnitsGenerate) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    current_max = max((unit.numero for unit in plan.unidades), default=0)
    base = payload.nombre_base or "Semestre"
    for offset in range(1, payload.cantidad + 1):
        number = current_max + offset
        db.add(UnidadPlan(plan_id=plan_id, numero=number, nombre=f"{base} {number}"))
    _save(db, "No se pudieron generar los semestres")
    db.refresh(plan)
    return _plan_output(db, plan)


def renumber_units(db: Session, plan_id: UUID) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    units = sorted(plan.unidades, key=lambda unit: unit.numero)
    if not units:
        return _plan_output(db, plan)
    # El desplazamiento supera cualquier número existente para que la renumeración
    # temporal no choque con la restricción única (plan_id, numero).
    offset = max(unit.numero for unit in units) + len(units) + 1
    for index, unit in enumerate(units, start=1):
        unit.numero = offset + index
    db.flush()
    for index, unit in enumerate(units, start=1):
        unit.numero = index
    _save(db, "No se pudieron renumerar los semestres")
    db.refresh(plan)
    return _plan_output(db, plan)


def update_unit(db: Session, plan_id: UUID, unit_id: UUID, payload: UnitUpdate) -> UnitPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    unit = db.scalar(
        select(UnidadPlan).where(UnidadPlan.id == unit_id, UnidadPlan.plan_id == plan_id)
    )
    if not unit:
        raise HTTPException(status_code=404, detail="Unidad no encontrada en el plan")
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(unit, name, value)
    _save(db, "Ya existe ese número de unidad en el plan")
    db.refresh(unit)
    return UnitPublic.model_validate(unit)


def delete_unit(db: Session, plan_id: UUID, unit_id: UUID) -> None:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    unit = db.scalar(
        select(UnidadPlan).where(UnidadPlan.id == unit_id, UnidadPlan.plan_id == plan_id)
    )
    if not unit:
        raise HTTPException(status_code=404, detail="Unidad no encontrada en el plan")
    if unit.materias_plan:
        raise HTTPException(
            status_code=409, detail="Retira las materias antes de eliminar la unidad"
        )
    db.delete(unit)
    _save(db, "No se pudo eliminar la unidad")


def add_subject_to_plan(db: Session, plan_id: UUID, payload: PlanSubjectCreate) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    subject = db.get(Materia, payload.materia_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if not subject.activo:
        raise HTTPException(
            status_code=409,
            detail=f"La materia {subject.codigo} está inactiva: reactívala o elige otra",
        )
    unit = db.scalar(
        select(UnidadPlan).where(UnidadPlan.id == payload.unidad_id, UnidadPlan.plan_id == plan_id)
    )
    if not unit:
        raise HTTPException(status_code=422, detail="La unidad no pertenece al plan")
    entry = MateriaPlan(plan_id=plan_id, unidad_id=unit.id, materia_id=subject.id)
    db.add(entry)
    _save(db, "La materia ya está incorporada a ese plan")
    db.refresh(plan)
    return _plan_output(db, plan)


def add_subjects_to_plan(db: Session, plan_id: UUID, payload: PlanSubjectsBulkCreate) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    unit = db.scalar(
        select(UnidadPlan).where(UnidadPlan.id == payload.unidad_id, UnidadPlan.plan_id == plan_id)
    )
    if not unit:
        raise HTTPException(status_code=422, detail="La unidad no pertenece al plan")

    subject_ids = list(dict.fromkeys(payload.materia_ids))
    subjects = db.scalars(select(Materia).where(Materia.id.in_(subject_ids))).all()
    if len(subjects) != len(subject_ids):
        raise HTTPException(status_code=404, detail="Una o más materias no existen")
    inactive = sorted(subject.codigo for subject in subjects if not subject.activo)
    if inactive:
        raise HTTPException(
            status_code=409,
            detail=(
                "No se pueden agregar materias inactivas: "
                f"{', '.join(inactive)}. Reactívalas o elige otras."
            ),
        )
    existing = sorted(
        db.scalars(
            select(Materia.codigo)
            .join(MateriaPlan, MateriaPlan.materia_id == Materia.id)
            .where(
                MateriaPlan.plan_id == plan_id,
                MateriaPlan.materia_id.in_(subject_ids),
            )
        ).all()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Ya están incorporadas al plan: {', '.join(existing)}",
        )
    for subject in sorted(subjects, key=lambda item: item.codigo):
        db.add(MateriaPlan(plan_id=plan_id, unidad_id=unit.id, materia_id=subject.id))
    _save(db, "No se pudieron agregar las materias")
    db.refresh(plan)
    return _plan_output(db, plan)


def move_subject_in_plan(
    db: Session, plan_id: UUID, subject_plan_id: UUID, payload: PlanSubjectUpdate
) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    entry = db.scalar(
        select(MateriaPlan).where(MateriaPlan.id == subject_plan_id, MateriaPlan.plan_id == plan_id)
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Materia no encontrada en el plan")
    unit = db.scalar(
        select(UnidadPlan).where(UnidadPlan.id == payload.unidad_id, UnidadPlan.plan_id == plan_id)
    )
    if not unit:
        raise HTTPException(status_code=422, detail="La unidad no pertenece al plan")
    entry.unidad_id = unit.id
    _save(db, "No se pudo mover la materia")
    db.refresh(plan)
    return _plan_output(db, plan)


def remove_subject_from_plan(db: Session, plan_id: UUID, subject_plan_id: UUID) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    entry = db.scalar(
        select(MateriaPlan).where(MateriaPlan.id == subject_plan_id, MateriaPlan.plan_id == plan_id)
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Materia no encontrada en el plan")
    courses_count = _count(
        db, select(func.count(Curso.id)).where(Curso.materia_plan_id == entry.id)
    )
    if courses_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede retirar {entry.materia.codigo} del plan: tiene "
                f"{courses_count} paralelo(s)/oferta(s) vinculados."
            ),
        )
    db.execute(
        delete(Prerrequisito).where(
            Prerrequisito.plan_id == plan_id,
            or_(
                Prerrequisito.materia_plan_id == entry.id,
                Prerrequisito.requisito_materia_plan_id == entry.id,
            ),
        )
    )
    db.delete(entry)
    _save(db, "No se pudo retirar la materia del plan")
    db.refresh(plan)
    return _plan_output(db, plan)


def _depends_on(adjacency: dict[UUID, set[UUID]], start: UUID, sought: UUID) -> bool:
    pending = [start]
    seen: set[UUID] = set()
    while pending:
        current = pending.pop()
        if current == sought:
            return True
        if current not in seen:
            seen.add(current)
            pending.extend(adjacency[current] - seen)
    return False


def add_prerequisite(
    db: Session, plan_id: UUID, subject_plan_id: UUID, payload: PrerequisiteCreate
) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    entries = set(db.scalars(select(MateriaPlan.id).where(MateriaPlan.plan_id == plan_id)).all())
    requirement_id = payload.requisito_materia_plan_id
    if subject_plan_id not in entries or requirement_id not in entries:
        raise HTTPException(status_code=422, detail="Ambas materias deben pertenecer al mismo plan")
    if subject_plan_id == requirement_id:
        raise HTTPException(
            status_code=409, detail="Una materia no puede ser prerrequisito de sí misma"
        )
    adjacency: dict[UUID, set[UUID]] = defaultdict(set)
    for dependent, prerequisite in db.execute(
        select(Prerrequisito.materia_plan_id, Prerrequisito.requisito_materia_plan_id).where(
            Prerrequisito.plan_id == plan_id
        )
    ):
        adjacency[dependent].add(prerequisite)
    if _depends_on(adjacency, requirement_id, subject_plan_id):
        raise HTTPException(status_code=409, detail="El prerrequisito crearía un ciclo")
    db.add(
        Prerrequisito(
            plan_id=plan_id,
            materia_plan_id=subject_plan_id,
            requisito_materia_plan_id=requirement_id,
        )
    )
    _save(db, "Ese prerrequisito ya está registrado")
    db.refresh(plan)
    return _plan_output(db, plan)


def remove_prerequisite(
    db: Session, plan_id: UUID, subject_plan_id: UUID, requirement_id: UUID
) -> PlanPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    prerequisite = db.get(Prerrequisito, (plan_id, subject_plan_id, requirement_id))
    if not prerequisite:
        raise HTTPException(status_code=404, detail="Prerrequisito no encontrado")
    db.delete(prerequisite)
    _save(db, "No se pudo retirar el prerrequisito")
    db.refresh(plan)
    return _plan_output(db, plan)


def _ensure_plan_assignable(plan: PlanEstudio) -> None:
    if plan.estado == EstadoPlan.INACTIVO:
        raise HTTPException(
            status_code=409,
            detail=f"El plan {plan.codigo} está inactivo: no se puede asignar a un estudiante",
        )
    if not plan.carrera.activo:
        raise HTTPException(
            status_code=409,
            detail=f"La carrera {plan.carrera.codigo} está inactiva: no admite nuevas asignaciones",
        )
    if not plan.carrera.facultad.activo:
        raise HTTPException(
            status_code=409,
            detail=(
                f"La facultad {plan.carrera.facultad.codigo} está inactiva: "
                "no admite nuevas asignaciones"
            ),
        )


def _student_plan_output(
    db: Session,
    profile: PerfilEstudiante,
    user: Usuario,
    plan: PlanEstudio | None,
    opening: AperturaPlan | None = None,
    start: PeriodoAcademico | None = None,
    *,
    preloaded: bool = False,
) -> StudentPlanPublic:
    if not preloaded:
        opening = (
            db.get(AperturaPlan, profile.apertura_plan_id) if profile.apertura_plan_id else None
        )
        start = db.get(PeriodoAcademico, opening.periodo_inicio_id) if opening else None
    return StudentPlanPublic(
        usuario_id=user.id,
        ci=user.ci,
        nombres=user.nombres,
        apellidos=user.apellidos,
        plan_estudio_id=plan.id if plan else None,
        plan_codigo=plan.codigo if plan else None,
        plan_estado=plan.estado if plan else None,
        apertura_plan_id=opening.id if opening else None,
        apertura_periodo_denominacion=start.denominacion if start else None,
    )


def list_student_plans(db: Session) -> list[StudentPlanPublic]:
    rows = db.execute(
        select(PerfilEstudiante, Usuario, PlanEstudio)
        .join(Usuario, Usuario.id == PerfilEstudiante.usuario_id)
        .outerjoin(PlanEstudio, PlanEstudio.id == PerfilEstudiante.plan_estudio_id)
        .where(Usuario.rol == UserRole.ESTUDIANTE)
        .order_by(Usuario.apellidos, Usuario.nombres)
    )
    # Los grupos y periodos se cargan una sola vez para evitar dos consultas por
    # estudiante al listar cursos numerosos.
    openings = {item.id: item for item in db.scalars(select(AperturaPlan)).all()}
    periods = {item.id: item for item in db.scalars(select(PeriodoAcademico)).all()}

    def output(profile: PerfilEstudiante, user: Usuario, plan: PlanEstudio | None):
        opening = openings.get(profile.apertura_plan_id) if profile.apertura_plan_id else None
        start = periods.get(opening.periodo_inicio_id) if opening else None
        return _student_plan_output(db, profile, user, plan, opening, start, preloaded=True)

    return [output(profile, user, plan) for profile, user, plan in rows]


def assign_student_plan(
    db: Session, user_id: UUID, plan_id: UUID, opening_id: UUID | None = None
) -> StudentPlanPublic:
    profile = db.get(PerfilEstudiante, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil de estudiante no encontrado")
    plan = db.get(PlanEstudio, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de estudio no encontrado")
    opening = db.get(AperturaPlan, opening_id) if opening_id else None
    if opening_id and not opening:
        raise HTTPException(status_code=404, detail="Grupo de inicio no encontrado")
    if opening and opening.plan_id != plan_id:
        raise HTTPException(status_code=409, detail="El grupo no pertenece al plan seleccionado")
    if profile.plan_estudio_id == plan_id:
        if opening and profile.apertura_plan_id != opening.id:
            _ensure_plan_assignable(plan)
            return assign_student_opening(db, user_id, opening.id)
        return _student_plan_output(db, profile, profile.usuario, plan)
    _ensure_plan_assignable(plan)
    enrollment = db.scalar(
        select(Inscripcion.id).where(Inscripcion.estudiante_id == user_id).limit(1)
    )
    if enrollment is not None:
        raise HTTPException(
            status_code=409,
            detail="No se puede cambiar el plan de un estudiante con inscripciones",
        )
    profile.plan_estudio_id = plan_id
    profile.apertura_plan_id = opening.id if opening else None
    _save(db, "No se pudo asignar el plan al estudiante")
    db.refresh(profile)
    user = db.get(Usuario, user_id)
    return _student_plan_output(db, profile, user, plan)


def assign_student_opening(db: Session, user_id: UUID, opening_id: UUID) -> StudentPlanPublic:
    profile = db.get(PerfilEstudiante, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    opening = db.get(AperturaPlan, opening_id)
    if not opening:
        raise HTTPException(status_code=404, detail="Grupo de inicio no encontrado")
    plan = db.get(PlanEstudio, opening.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de estudio no encontrado")
    if profile.plan_estudio_id != plan.id:
        raise HTTPException(status_code=409, detail="El grupo no pertenece al plan del estudiante")
    _ensure_plan_assignable(plan)
    start = db.get(PeriodoAcademico, opening.periodo_inicio_id)
    if not start:
        raise HTTPException(status_code=409, detail="El periodo del grupo de inicio no existe")
    earlier_enrollment = db.scalar(
        select(Inscripcion.id)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .join(PeriodoAcademico, PeriodoAcademico.id == Curso.periodo_id)
        .where(
            Inscripcion.estudiante_id == user_id,
            PeriodoAcademico.fecha_inicio < start.fecha_inicio,
        )
        .limit(1)
    )
    if earlier_enrollment:
        raise HTTPException(
            status_code=409,
            detail="El grupo inicia después de la primera inscripción del estudiante",
        )
    profile.apertura_plan_id = opening.id
    _save(db, "No se pudo cambiar el grupo de ingreso")
    return _student_plan_output(db, profile, profile.usuario, plan)
