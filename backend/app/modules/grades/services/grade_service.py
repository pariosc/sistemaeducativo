from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.access.models.user import PerfilEstudiante, Usuario
from app.modules.curriculum.models.entities import Materia, MateriaPlan
from app.modules.enrollments.models.entities import EstadoInscripcion, Inscripcion
from app.modules.grades.models.entities import Calificacion
from app.modules.grades.schemas.grade import GradePublic, GradeWorkItem
from app.modules.parallel.models.entities import Curso
from app.modules.periods.models.entities import PeriodoAcademico


def _grade_rows(db: Session, *, teacher_id: UUID | None = None, student_id: UUID | None = None):
    query = (
        select(
            Inscripcion.id.label("inscripcion_id"),
            Usuario.id.label("estudiante_id"),
            Usuario.ci.label("estudiante_ci"),
            Usuario.nombres.label("nombres"),
            Usuario.apellidos.label("apellidos"),
            Materia.codigo.label("materia_codigo"),
            Materia.nombre.label("materia_nombre"),
            Curso.paralelo.label("paralelo"),
            PeriodoAcademico.denominacion.label("periodo_denominacion"),
            Calificacion.id.label("calificacion_id"),
            Calificacion.nota_final.label("nota_final"),
            Calificacion.fecha_registro.label("fecha_registro"),
        )
        .join(PerfilEstudiante, PerfilEstudiante.usuario_id == Inscripcion.estudiante_id)
        .join(Usuario, Usuario.id == PerfilEstudiante.usuario_id)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
        .join(PeriodoAcademico, PeriodoAcademico.id == Curso.periodo_id)
        .outerjoin(Calificacion, Calificacion.inscripcion_id == Inscripcion.id)
    )
    if teacher_id is not None:
        query = query.where(
            Curso.docente_id == teacher_id,
            Inscripcion.estado == EstadoInscripcion.ACTIVA,
        )
    if student_id is not None:
        query = query.where(Inscripcion.estudiante_id == student_id, Calificacion.id.is_not(None))
    return db.execute(
        query.order_by(PeriodoAcademico.denominacion, Materia.codigo, Usuario.apellidos)
    ).all()


def teacher_gradebook(db: Session, teacher: Usuario) -> list[GradeWorkItem]:
    return [
        GradeWorkItem(
            inscripcion_id=row.inscripcion_id,
            estudiante_id=row.estudiante_id,
            estudiante_ci=row.estudiante_ci,
            estudiante_nombre=f"{row.nombres} {row.apellidos}",
            materia_codigo=row.materia_codigo,
            materia_nombre=row.materia_nombre,
            paralelo=row.paralelo,
            periodo_denominacion=row.periodo_denominacion,
            nota_final=row.nota_final,
            fecha_registro=row.fecha_registro,
        )
        for row in _grade_rows(db, teacher_id=teacher.id)
    ]


def student_grades(db: Session, student: Usuario) -> list[GradePublic]:
    return [
        GradePublic(
            id=row.calificacion_id,
            inscripcion_id=row.inscripcion_id,
            estudiante_id=row.estudiante_id,
            materia_codigo=row.materia_codigo,
            materia_nombre=row.materia_nombre,
            paralelo=row.paralelo,
            periodo_denominacion=row.periodo_denominacion,
            nota_final=row.nota_final,
            fecha_registro=row.fecha_registro,
        )
        for row in _grade_rows(db, student_id=student.id)
    ]


def _authorized_enrollment(db: Session, teacher: Usuario, enrollment_id: UUID) -> Inscripcion:
    enrollment = db.scalar(
        select(Inscripcion)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .where(
            Inscripcion.id == enrollment_id,
            Inscripcion.estado == EstadoInscripcion.ACTIVA,
            Curso.docente_id == teacher.id,
        )
        .with_for_update()
    )
    if not enrollment:
        raise HTTPException(
            status_code=404,
            detail="Inscripción no encontrada en un paralelo asignado al docente",
        )
    return enrollment


def register_grade(db: Session, teacher: Usuario, enrollment_id: UUID, value: int) -> GradePublic:
    enrollment = _authorized_enrollment(db, teacher, enrollment_id)
    if db.scalar(select(Calificacion.id).where(Calificacion.inscripcion_id == enrollment.id)):
        raise HTTPException(
            status_code=409, detail="La inscripción ya tiene calificación; corrígela"
        )
    grade = Calificacion(
        inscripcion_id=enrollment.id,
        nota_final=value,
        fecha_registro=datetime.now(UTC),
    )
    db.add(grade)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="La inscripción ya tiene calificación") from exc
    db.refresh(grade)
    return _grade_output(db, grade)


def correct_grade(db: Session, teacher: Usuario, enrollment_id: UUID, value: int) -> GradePublic:
    enrollment = _authorized_enrollment(db, teacher, enrollment_id)
    grade = db.scalar(
        select(Calificacion).where(Calificacion.inscripcion_id == enrollment.id).with_for_update()
    )
    if not grade:
        raise HTTPException(status_code=404, detail="La calificación todavía no está registrada")
    grade.nota_final = value
    grade.fecha_registro = datetime.now(UTC)
    db.commit()
    db.refresh(grade)
    return _grade_output(db, grade)


def _grade_output(db: Session, grade: Calificacion) -> GradePublic:
    row = next(
        row
        for row in _grade_rows(
            db, student_id=db.get(Inscripcion, grade.inscripcion_id).estudiante_id
        )
        if row.inscripcion_id == grade.inscripcion_id
    )
    return GradePublic(
        id=grade.id,
        inscripcion_id=grade.inscripcion_id,
        estudiante_id=row.estudiante_id,
        materia_codigo=row.materia_codigo,
        materia_nombre=row.materia_nombre,
        paralelo=row.paralelo,
        periodo_denominacion=row.periodo_denominacion,
        nota_final=grade.nota_final,
        fecha_registro=grade.fecha_registro,
    )
