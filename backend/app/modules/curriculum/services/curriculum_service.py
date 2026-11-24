from collections import defaultdict
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import MetaData, Table, inspect, select
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
    PlanPublic,
    PlanSubjectCreate,
    PlanSubjectPublic,
    PlanSubjectUpdate,
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
from app.modules.periods.models.entities import AperturaPlan, PeriodoAcademico


def _save(db: Session, duplicate_message: str = "El código ya está registrado") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=duplicate_message) from exc


def list_careers(db: Session) -> list[CareerPublic]:
    return [
        CareerPublic.model_validate(row)
        for row in db.scalars(
            select(Carrera).options(selectinload(Carrera.facultad)).order_by(Carrera.codigo)
        ).all()
    ]


def create_career(db: Session, payload: CareerCreate) -> CareerPublic:
    if not db.get(Facultad, payload.facultad_id):
        raise HTTPException(status_code=404, detail="Facultad no encontrada")
    career = Carrera(
        codigo=payload.codigo, nombre=payload.nombre, facultad_id=payload.facultad_id, activo=True
    )
    db.add(career)
    _save(db)
    db.refresh(career)
    return CareerPublic.model_validate(career)


def update_career(db: Session, career_id: UUID, payload: CareerUpdate) -> CareerPublic:
    career = db.get(Carrera, career_id)
    if not career:
        raise HTTPException(status_code=404, detail="Carrera no encontrada")
    if payload.facultad_id and not db.get(Facultad, payload.facultad_id):
        raise HTTPException(status_code=404, detail="Facultad no encontrada")
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(career, name, value)
    _save(db)
    db.refresh(career)
    return CareerPublic.model_validate(career)


def list_faculties(db: Session) -> list[FacultyPublic]:
    return [
        FacultyPublic.model_validate(row)
        for row in db.scalars(select(Facultad).order_by(Facultad.codigo)).all()
    ]


def create_faculty(db: Session, payload: FacultyCreate) -> FacultyPublic:
    faculty = Facultad(codigo=payload.codigo, nombre=payload.nombre, activo=True)
    db.add(faculty)
    _save(db)
    db.refresh(faculty)
    return FacultyPublic.model_validate(faculty)


def update_faculty(db: Session, faculty_id: UUID, payload: FacultyUpdate) -> FacultyPublic:
    faculty = db.get(Facultad, faculty_id)
    if not faculty:
        raise HTTPException(status_code=404, detail="Facultad no encontrada")
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(faculty, name, value)
    _save(db)
    db.refresh(faculty)
    return FacultyPublic.model_validate(faculty)


def delete_faculty(db: Session, faculty_id: UUID) -> None:
    faculty = db.get(Facultad, faculty_id)
    if not faculty:
        raise HTTPException(status_code=404, detail="Facultad no encontrada")
    if db.scalar(select(Carrera.id).where(Carrera.facultad_id == faculty_id).limit(1)):
        raise HTTPException(
            status_code=409, detail="No se puede eliminar una facultad con carreras"
        )
    db.delete(faculty)
    _save(db, "No se puede eliminar una facultad con carreras")


def delete_career(db: Session, career_id: UUID) -> None:
    career = db.get(Carrera, career_id)
    if not career:
        raise HTTPException(status_code=404, detail="Carrera no encontrada")
    if db.scalar(select(PlanEstudio.id).where(PlanEstudio.carrera_id == career_id).limit(1)):
        raise HTTPException(status_code=409, detail="No se puede eliminar una carrera con planes")
    db.delete(career)
    _save(db, "No se puede eliminar una carrera con planes")


def list_subjects(db: Session) -> list[SubjectPublic]:
    return [
        SubjectPublic.model_validate(row)
        for row in db.scalars(select(Materia).order_by(Materia.codigo)).all()
    ]


def create_subject(db: Session, payload: SubjectCreate) -> SubjectPublic:
    subject = Materia(codigo=payload.codigo, nombre=payload.nombre, activo=True)
    db.add(subject)
    _save(db)
    db.refresh(subject)
    return SubjectPublic.model_validate(subject)


def update_subject(db: Session, subject_id: UUID, payload: SubjectUpdate) -> SubjectPublic:
    subject = db.get(Materia, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, name, value)
    _save(db)
    db.refresh(subject)
    return SubjectPublic.model_validate(subject)


def delete_subject(db: Session, subject_id: UUID) -> None:
    subject = db.get(Materia, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if db.scalar(select(MateriaPlan.id).where(MateriaPlan.materia_id == subject_id).limit(1)):
        raise HTTPException(
            status_code=409, detail="No se puede eliminar una materia incorporada a un plan"
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


def _plan_output(db: Session, plan: PlanEstudio) -> PlanPublic:
    prerequisites: dict[UUID, list[UUID]] = defaultdict(list)
    rows = db.execute(
        select(Prerrequisito.materia_plan_id, Prerrequisito.requisito_materia_plan_id).where(
            Prerrequisito.plan_id == plan.id
        )
    ).all()
    for dependent_id, requirement_id in rows:
        prerequisites[dependent_id].append(requirement_id)

    units_output: list[UnitWithSubjects] = []
    for unit in plan.unidades:
        subjects = [
            PlanSubjectPublic(
                id=entry.id,
                materia_id=entry.materia_id,
                codigo=entry.materia.codigo,
                nombre=entry.materia.nombre,
                prerrequisitos=sorted(prerequisites[entry.id], key=str),
            )
            for entry in unit.materias_plan
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
    return PlanPublic(
        id=plan.id,
        carrera_id=plan.carrera_id,
        carrera_codigo=plan.carrera.codigo,
        carrera_nombre=plan.carrera.nombre,
        codigo=plan.codigo,
        modalidad=plan.modalidad,
        estado=plan.estado,
        unidades=units_output,
    )


def list_plans(db: Session) -> list[PlanPublic]:
    plans = db.scalars(
        select(PlanEstudio)
        .options(
            selectinload(PlanEstudio.carrera),
            selectinload(PlanEstudio.unidades)
            .selectinload(UnidadPlan.materias_plan)
            .selectinload(MateriaPlan.materia),
        )
        .order_by(PlanEstudio.codigo)
    ).all()
    return [_plan_output(db, plan) for plan in plans]


def create_plan(db: Session, payload: PlanCreate) -> PlanPublic:
    if not db.get(Carrera, payload.carrera_id):
        raise HTTPException(status_code=404, detail="Carrera no encontrada")
    plan = PlanEstudio(
        carrera_id=payload.carrera_id,
        codigo=payload.codigo,
        modalidad=payload.modalidad,
        estado=EstadoPlan.BORRADOR,
    )
    db.add(plan)
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
        plan.estado = target
    _save(db, "El código del plan ya está registrado en el sistema")
    db.refresh(plan)
    return _plan_output(db, plan)


def delete_plan(db: Session, plan_id: UUID) -> None:
    plan = _plan_or_404(db, plan_id)
    if db.scalar(
        select(PerfilEstudiante.usuario_id)
        .where(PerfilEstudiante.plan_estudio_id == plan_id)
        .limit(1)
    ):
        raise HTTPException(status_code=409, detail="No se puede eliminar un plan asignado")
    db.delete(plan)
    _save(db, "No se puede eliminar un plan con estudiantes, ofertas o registros vinculados")


def create_unit(db: Session, plan_id: UUID, payload: UnitCreate) -> UnitPublic:
    plan = _plan_or_404(db, plan_id)
    _require_draft(plan)
    unit = UnidadPlan(plan_id=plan_id, numero=payload.numero, nombre=payload.nombre)
    db.add(unit)
    _save(db, "Ya existe ese número de unidad en el plan")
    db.refresh(unit)
    return UnitPublic.model_validate(unit)


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
    db.commit()
    db.refresh(plan)
    return _plan_output(db, plan)


def _student_plan_output(
    db: Session, profile: PerfilEstudiante, user: Usuario, plan: PlanEstudio | None
) -> StudentPlanPublic:
    opening = db.get(AperturaPlan, profile.apertura_plan_id) if profile.apertura_plan_id else None
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
    return [_student_plan_output(db, profile, user, plan) for profile, user, plan in rows]


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
            return assign_student_opening(db, user_id, opening.id)
        return _student_plan_output(db, profile, profile.usuario, plan)
    # Inscripciones se incorpora en la fase siguiente; su FK al perfil permite
    # activar la regla de corrección sin depender del nombre de su columna.
    connection = db.connection()
    inspector = inspect(connection)
    if inspector.has_table("inscripciones"):
        enrollment_table = Table("inscripciones", MetaData(), autoload_with=connection)
        student_columns = [
            column
            for column in enrollment_table.c
            if any(
                foreign_key.target_fullname == "perfiles_estudiante.usuario_id"
                for foreign_key in column.foreign_keys
            )
        ]
        if not student_columns:
            raise RuntimeError(
                "La tabla inscripciones debe referenciar perfiles_estudiante.usuario_id"
            )
        if (
            db.scalar(select(enrollment_table.c[0]).where(student_columns[0] == user_id).limit(1))
            is not None
        ):
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
    if profile.plan_estudio_id != opening.plan_id:
        raise HTTPException(status_code=409, detail="El grupo no pertenece al plan del estudiante")
    start = db.get(PeriodoAcademico, opening.periodo_inicio_id)
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
    db.commit()
    return _student_plan_output(db, profile, profile.usuario, db.get(PlanEstudio, opening.plan_id))
