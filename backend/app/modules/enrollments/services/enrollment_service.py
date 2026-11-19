from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import MetaData, Table, func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.access.models.user import PerfilEstudiante, UserRole, Usuario
from app.modules.curriculum.models.entities import (
    EstadoPlan,
    Materia,
    MateriaPlan,
    PlanEstudio,
    Prerrequisito,
    UnidadPlan,
)
from app.modules.enrollments.models.entities import (
    EstadoInscripcion,
    HabilitacionInscripcion,
    Inscripcion,
    OrigenHabilitacion,
)
from app.modules.enrollments.schemas.enrollment import (
    AuthorizationPublic,
    CourseOffer,
    EnrollmentPublic,
    PrerequisitePending,
)
from app.modules.notifications.models.entities import Notificacion, TipoNotificacion
from app.modules.parallel.models.entities import Curso
from app.modules.parallel.services.calendar import first_overlap
from app.modules.parallel.services.parallel_service import _all_occurrences, _course_output
from app.modules.periods.models.entities import PeriodoAcademico


def _period_or_404(db: Session, period_id: UUID) -> PeriodoAcademico:
    period = db.get(PeriodoAcademico, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Periodo académico no encontrado")
    return period


def list_authorizations(db: Session, period_id: UUID) -> list[AuthorizationPublic]:
    _period_or_404(db, period_id)
    rows = db.execute(
        select(Usuario, HabilitacionInscripcion)
        .join(PerfilEstudiante, PerfilEstudiante.usuario_id == Usuario.id)
        .outerjoin(
            HabilitacionInscripcion,
            (HabilitacionInscripcion.estudiante_id == Usuario.id)
            & (HabilitacionInscripcion.periodo_id == period_id),
        )
        .where(Usuario.rol == UserRole.ESTUDIANTE)
        .order_by(Usuario.apellidos, Usuario.nombres)
    ).all()
    return [
        AuthorizationPublic(
            id=authorization.id if authorization else None,
            estudiante_id=student.id,
            estudiante_ci=student.ci,
            estudiante_nombre=f"{student.nombres} {student.apellidos}",
            periodo_id=period_id,
            habilitada=bool(authorization and authorization.activa),
            origen=authorization.origen if authorization else None,
            fecha_autorizacion=authorization.fecha_autorizacion if authorization else None,
        )
        for student, authorization in rows
    ]


def set_authorization(
    db: Session,
    period_id: UUID,
    student_id: UUID,
    active: bool,
    actor: Usuario,
) -> AuthorizationPublic:
    _period_or_404(db, period_id)
    student = db.scalar(
        select(Usuario)
        .join(PerfilEstudiante, PerfilEstudiante.usuario_id == Usuario.id)
        .where(Usuario.id == student_id, Usuario.rol == UserRole.ESTUDIANTE)
        .with_for_update()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    authorization = db.scalar(
        select(HabilitacionInscripcion)
        .where(
            HabilitacionInscripcion.estudiante_id == student_id,
            HabilitacionInscripcion.periodo_id == period_id,
        )
        .with_for_update()
    )
    if authorization is None:
        authorization = HabilitacionInscripcion(
            estudiante_id=student_id,
            periodo_id=period_id,
            activa=active,
            origen=OrigenHabilitacion.ADMINISTRADOR,
            fecha_autorizacion=datetime.now(UTC),
            autorizada_por_id=actor.id,
        )
        db.add(authorization)
    else:
        authorization.activa = active
        authorization.origen = OrigenHabilitacion.ADMINISTRADOR
        authorization.fecha_autorizacion = datetime.now(UTC)
        authorization.autorizada_por_id = actor.id
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="La habilitación ya fue actualizada") from exc
    db.refresh(authorization)
    return AuthorizationPublic(
        id=authorization.id,
        estudiante_id=student.id,
        estudiante_ci=student.ci,
        estudiante_nombre=f"{student.nombres} {student.apellidos}",
        periodo_id=period_id,
        habilitada=authorization.activa,
        origen=authorization.origen,
        fecha_autorizacion=authorization.fecha_autorizacion,
    )


def student_offer(db: Session, student_id: UUID) -> list[CourseOffer]:
    profile = db.get(PerfilEstudiante, student_id)
    if not profile or profile.plan_estudio_id is None:
        return []
    courses = db.scalars(
        select(Curso)
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .join(PlanEstudio, PlanEstudio.id == MateriaPlan.plan_id)
        .where(
            MateriaPlan.plan_id == profile.plan_estudio_id,
            PlanEstudio.estado == EstadoPlan.VIGENTE,
            Curso.activo.is_(True),
        )
        .order_by(Curso.periodo_id, Curso.paralelo)
    ).all()
    enrollments = db.scalars(
        select(Inscripcion.curso_id).where(
            Inscripcion.estudiante_id == student_id,
            Inscripcion.estado == EstadoInscripcion.ACTIVA,
        )
    ).all()
    enrolled = set(enrollments)
    offers = []
    for course in courses:
        entry = db.get(MateriaPlan, course.materia_plan_id)
        semester = db.get(UnidadPlan, entry.unidad_id)
        active_count = int(
            db.scalar(
                select(func.count(Inscripcion.id)).where(
                    Inscripcion.curso_id == course.id,
                    Inscripcion.estado == EstadoInscripcion.ACTIVA,
                )
            )
            or 0
        )
        offers.append(
            CourseOffer(
                curso=_course_output(db, course),
                semestre_numero=semester.numero,
                semestre_nombre=semester.nombre,
                cupos_disponibles=max(course.cupo - active_count, 0),
                inscrito=course.id in enrolled,
                prerrequisitos_pendientes=_missing_prerequisites(
                    db, student_id, entry.plan_id, entry.id
                ),
            )
        )
    return offers


def list_student_enrollments(db: Session, student_id: UUID) -> list[EnrollmentPublic]:
    enrollments = db.scalars(
        select(Inscripcion)
        .where(Inscripcion.estudiante_id == student_id)
        .order_by(Inscripcion.fecha_inscripcion.desc())
    ).all()
    return [
        EnrollmentPublic(
            id=enrollment.id,
            curso_id=enrollment.curso_id,
            fecha_inscripcion=enrollment.fecha_inscripcion,
            estado=enrollment.estado,
            curso=_course_output(db, db.get(Curso, enrollment.curso_id)),
        )
        for enrollment in enrollments
    ]


def _prerequisite_approved(db: Session, student_id: UUID, prerequisite_id: UUID) -> bool:
    connection = db.connection()
    inspector = inspect(connection)
    if not inspector.has_table("calificaciones"):
        return False
    grade_table = Table("calificaciones", MetaData(), autoload_with=connection)
    enrollment_fk = next(
        (
            column
            for column in grade_table.c
            if any(fk.target_fullname == "inscripciones.id" for fk in column.foreign_keys)
        ),
        None,
    )
    if enrollment_fk is None or "nota_final" not in grade_table.c:
        raise RuntimeError("calificaciones debe referenciar inscripciones.id y definir nota_final")
    query = (
        select(func.max(grade_table.c.nota_final))
        .select_from(
            grade_table.join(Inscripcion.__table__, enrollment_fk == Inscripcion.id).join(
                Curso.__table__, Inscripcion.curso_id == Curso.id
            )
        )
        .where(
            Inscripcion.estudiante_id == student_id,
            Curso.materia_plan_id == prerequisite_id,
        )
    )
    grade = db.scalar(query)
    return grade is not None and grade >= 51


def _missing_prerequisites(
    db: Session, student_id: UUID, plan_id: UUID, subject_plan_id: UUID
) -> list[PrerequisitePending]:
    requirements = db.execute(
        select(MateriaPlan.id, Materia.codigo, Materia.nombre)
        .join(Prerrequisito, Prerrequisito.requisito_materia_plan_id == MateriaPlan.id)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
        .where(
            Prerrequisito.plan_id == plan_id,
            Prerrequisito.materia_plan_id == subject_plan_id,
        )
        .order_by(Materia.codigo)
    ).all()
    return [
        PrerequisitePending(materia_plan_id=row.id, codigo=row.codigo, nombre=row.nombre)
        for row in requirements
        if not _prerequisite_approved(db, student_id, row.id)
    ]


def enroll_student(db: Session, student_id: UUID, course_id: UUID) -> EnrollmentPublic:
    profile = db.scalar(
        select(PerfilEstudiante).where(PerfilEstudiante.usuario_id == student_id).with_for_update()
    )
    if not profile:
        raise HTTPException(status_code=403, detail="La cuenta no tiene perfil de estudiante")
    student = db.get(Usuario, student_id)
    if not student or student.rol != UserRole.ESTUDIANTE or not student.activo:
        raise HTTPException(status_code=403, detail="La cuenta de estudiante no está activa")
    if not profile.plan_estudio_id:
        raise HTTPException(status_code=409, detail="Debes tener un plan de estudios asignado")

    course = db.scalar(select(Curso).where(Curso.id == course_id).with_for_update())
    if not course:
        raise HTTPException(status_code=404, detail="Paralelo no encontrado")
    entry = db.get(MateriaPlan, course.materia_plan_id)
    plan = db.get(PlanEstudio, entry.plan_id)
    if profile.plan_estudio_id != entry.plan_id:
        raise HTTPException(status_code=409, detail="El paralelo no pertenece a tu plan asignado")
    if plan.estado != EstadoPlan.VIGENTE:
        raise HTTPException(status_code=409, detail="Tu plan de estudios no está VIGENTE")
    if not course.activo or not course.inscripcion_abierta:
        raise HTTPException(
            status_code=409, detail="El paralelo está inactivo o tiene inscripciones cerradas"
        )
    authorization = db.scalar(
        select(HabilitacionInscripcion).where(
            HabilitacionInscripcion.estudiante_id == student_id,
            HabilitacionInscripcion.periodo_id == course.periodo_id,
            HabilitacionInscripcion.activa.is_(True),
        )
    )
    if not authorization:
        raise HTTPException(
            status_code=409, detail="No tienes habilitación activa para este periodo"
        )
    existing = db.scalar(
        select(Inscripcion).where(
            Inscripcion.estudiante_id == student_id,
            Inscripcion.curso_id == course_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "Ya existe un registro de inscripción para este paralelo; "
                "el reingreso no está habilitado"
            ),
        )
    active_count = int(
        db.scalar(
            select(func.count(Inscripcion.id)).where(
                Inscripcion.curso_id == course_id,
                Inscripcion.estado == EstadoInscripcion.ACTIVA,
            )
        )
        or 0
    )
    if active_count >= course.cupo:
        raise HTTPException(status_code=409, detail="El paralelo ya alcanzó su cupo")
    duplicate_subject = db.scalar(
        select(Inscripcion.id)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .where(
            Inscripcion.estudiante_id == student_id,
            Inscripcion.estado == EstadoInscripcion.ACTIVA,
            Curso.periodo_id == course.periodo_id,
            Curso.materia_plan_id == course.materia_plan_id,
        )
        .limit(1)
    )
    if duplicate_subject:
        raise HTTPException(
            status_code=409,
            detail="Ya tienes una inscripción activa en esta materia para el periodo",
        )
    requirements = db.scalars(
        select(Prerrequisito.requisito_materia_plan_id).where(
            Prerrequisito.plan_id == entry.plan_id,
            Prerrequisito.materia_plan_id == entry.id,
        )
    ).all()
    missing = [
        requirement_id
        for requirement_id in requirements
        if not _prerequisite_approved(db, student_id, requirement_id)
    ]
    if missing:
        raise HTTPException(
            status_code=409,
            detail="Debes aprobar todos los prerrequisitos con nota final de 51 o más",
        )

    other_course_ids = db.scalars(
        select(Inscripcion.curso_id)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .where(
            Inscripcion.estudiante_id == student_id,
            Inscripcion.estado == EstadoInscripcion.ACTIVA,
            Curso.activo.is_(True),
        )
    ).all()
    other_courses = db.scalars(
        select(Curso).where(Curso.id.in_(other_course_ids), Curso.activo.is_(True))
    ).all()
    overlaps = _all_occurrences(db, [course, *other_courses])
    for other in other_courses:
        overlap = first_overlap(overlaps[course.id], overlaps[other.id])
        if overlap:
            raise HTTPException(
                status_code=409,
                detail=f"El horario se cruza con otra inscripción el {overlap.isoformat()}",
            )

    enrollment = Inscripcion(
        estudiante_id=student_id,
        curso_id=course_id,
        estado=EstadoInscripcion.ACTIVA,
    )
    db.add(enrollment)
    db.add(
        Notificacion(
            destinatario_id=student_id,
            curso_id=course_id,
            tipo=TipoNotificacion.INSCRIPCION,
            titulo="Inscripción confirmada",
            mensaje=(
                f"Tu inscripción en {entry.materia.nombre} — paralelo {course.paralelo} "
                "fue confirmada."
            ),
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="No se pudo confirmar la inscripción") from exc
    db.refresh(enrollment)
    return EnrollmentPublic(
        id=enrollment.id,
        curso_id=course.id,
        fecha_inscripcion=enrollment.fecha_inscripcion,
        estado=enrollment.estado,
        curso=_course_output(db, course),
    )
