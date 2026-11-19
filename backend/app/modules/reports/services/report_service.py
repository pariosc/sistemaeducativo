from enum import StrEnum
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.access.models.user import PerfilEstudiante, UserRole, Usuario
from app.modules.curriculum.models.entities import (
    Carrera,
    Materia,
    MateriaPlan,
    PlanEstudio,
    UnidadPlan,
)
from app.modules.enrollments.models.entities import EstadoInscripcion, Inscripcion
from app.modules.grades.models.entities import Calificacion
from app.modules.parallel.models.entities import Curso
from app.modules.periods.models.entities import PeriodoAcademico


class ReportCode(StrEnum):
    MATERIAS_POR_PLAN = "RF33"
    NOTAS_ESTUDIANTE = "RF34"
    NOTAS_PARALELO = "RF35"
    HISTORIAL_PROPIO = "RF36"
    NOTAS_PROPIAS = "RF37"
    INSCRITOS_PARALELO = "RF38"
    MATERIAS_INSCRITAS = "RF39"
    MATERIAS_DOCENTE = "RF40"


REPORT_LABELS = {
    ReportCode.MATERIAS_POR_PLAN: "Materias por carrera y plan",
    ReportCode.NOTAS_ESTUDIANTE: "Notas de un estudiante",
    ReportCode.NOTAS_PARALELO: "Notas de un paralelo",
    ReportCode.HISTORIAL_PROPIO: "Historial académico propio",
    ReportCode.NOTAS_PROPIAS: "Calificaciones propias",
    ReportCode.INSCRITOS_PARALELO: "Inscritos por paralelo",
    ReportCode.MATERIAS_INSCRITAS: "Materias inscritas propias",
    ReportCode.MATERIAS_DOCENTE: "Materias del docente",
}


def reports_for_role(role: UserRole) -> set[ReportCode]:
    if role == UserRole.ADMINISTRADOR:
        return {
            ReportCode.MATERIAS_POR_PLAN,
            ReportCode.NOTAS_ESTUDIANTE,
            ReportCode.NOTAS_PARALELO,
            ReportCode.INSCRITOS_PARALELO,
            ReportCode.MATERIAS_DOCENTE,
        }
    if role == UserRole.DOCENTE:
        return {
            ReportCode.NOTAS_ESTUDIANTE,
            ReportCode.NOTAS_PARALELO,
            ReportCode.INSCRITOS_PARALELO,
            ReportCode.MATERIAS_DOCENTE,
        }
    return {
        ReportCode.HISTORIAL_PROPIO,
        ReportCode.NOTAS_PROPIAS,
        ReportCode.MATERIAS_INSCRITAS,
    }


def _required(value: UUID | None, label: str) -> UUID:
    if value is None:
        raise HTTPException(status_code=422, detail=f"Selecciona {label}")
    return value


def _course_for_report(db: Session, user: Usuario, course_id: UUID | None) -> Curso:
    identifier = _required(course_id, "un paralelo")
    course = db.get(Curso, identifier)
    if not course or (user.rol == UserRole.DOCENTE and course.docente_id != user.id):
        raise HTTPException(status_code=404, detail="Paralelo no encontrado")
    return course


def _enrollment_report_rows(
    db: Session,
    *,
    course_id: UUID | None = None,
    student_id: UUID | None = None,
    teacher_id: UUID | None = None,
    active_only: bool = True,
    grades_only: bool = False,
):
    query = (
        select(
            PeriodoAcademico.denominacion,
            Materia.codigo,
            Materia.nombre,
            Curso.paralelo,
            Usuario.ci,
            Usuario.nombres,
            Usuario.apellidos,
            Inscripcion.estado,
            Calificacion.nota_final,
        )
        .join(PerfilEstudiante, PerfilEstudiante.usuario_id == Inscripcion.estudiante_id)
        .join(Usuario, Usuario.id == PerfilEstudiante.usuario_id)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .join(PeriodoAcademico, PeriodoAcademico.id == Curso.periodo_id)
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
        .outerjoin(Calificacion, Calificacion.inscripcion_id == Inscripcion.id)
    )
    if active_only:
        query = query.where(Inscripcion.estado == EstadoInscripcion.ACTIVA)
    if grades_only:
        query = query.where(Calificacion.id.is_not(None))
    if course_id is not None:
        query = query.where(Curso.id == course_id)
    if student_id is not None:
        query = query.where(Inscripcion.estudiante_id == student_id)
    if teacher_id is not None:
        query = query.where(Curso.docente_id == teacher_id)
    return db.execute(
        query.order_by(
            PeriodoAcademico.fecha_inicio,
            Materia.codigo,
            Curso.paralelo,
            Usuario.apellidos,
            Usuario.nombres,
        )
    ).all()


def build_report(
    db: Session,
    user: Usuario,
    code: ReportCode,
    *,
    career_id: UUID | None = None,
    plan_id: UUID | None = None,
    student_id: UUID | None = None,
    course_id: UUID | None = None,
    teacher_id: UUID | None = None,
) -> tuple[str, list[str], list[list[object]]]:
    if code not in reports_for_role(user.rol):
        raise HTTPException(status_code=403, detail="No tienes permiso para generar este reporte")

    if code == ReportCode.MATERIAS_POR_PLAN:
        career = db.get(Carrera, _required(career_id, "una carrera"))
        plan = db.get(PlanEstudio, _required(plan_id, "un plan de estudio"))
        if not career or not plan or plan.carrera_id != career.id:
            raise HTTPException(status_code=404, detail="Plan no encontrado para la carrera")
        rows = db.execute(
            select(Materia.codigo, Materia.nombre, UnidadPlan.numero, UnidadPlan.nombre)
            .join(MateriaPlan, MateriaPlan.materia_id == Materia.id)
            .join(UnidadPlan, UnidadPlan.id == MateriaPlan.unidad_id)
            .where(MateriaPlan.plan_id == plan.id)
            .order_by(UnidadPlan.numero, Materia.codigo)
        ).all()
        return (
            f"Materias de {career.nombre} — Plan {plan.codigo}",
            ["Código", "Materia", "Unidad N°", "Unidad"],
            [list(row) for row in rows],
        )

    if code == ReportCode.NOTAS_ESTUDIANTE:
        identifier = _required(student_id, "un estudiante")
        if not db.get(PerfilEstudiante, identifier):
            raise HTTPException(status_code=404, detail="Estudiante no encontrado")
        rows = _enrollment_report_rows(
            db,
            student_id=identifier,
            teacher_id=user.id if user.rol == UserRole.DOCENTE else None,
            active_only=False,
            grades_only=True,
        )
        return (
            "Notas del estudiante",
            ["Periodo", "Código", "Materia", "Paralelo", "Nota final"],
            [[row[0], row[1], row[2], row[3], row[8]] for row in rows],
        )

    if code in (ReportCode.NOTAS_PARALELO, ReportCode.INSCRITOS_PARALELO):
        course = _course_for_report(db, user, course_id)
        subject_entry = db.get(MateriaPlan, course.materia_plan_id)
        subject = db.get(Materia, subject_entry.materia_id)
        rows = _enrollment_report_rows(db, course_id=course.id, active_only=True)
        if code == ReportCode.NOTAS_PARALELO:
            return (
                f"Notas — {subject.codigo} paralelo {course.paralelo}",
                ["CI", "Estudiante", "Periodo", "Código", "Materia", "Nota final"],
                [[row[4], f"{row[5]} {row[6]}", row[0], row[1], row[2], row[8]] for row in rows],
            )
        return (
            f"Inscritos — paralelo {course.paralelo}",
            ["CI", "Estudiante", "Periodo", "Código", "Materia", "Estado"],
            [[row[4], f"{row[5]} {row[6]}", row[0], row[1], row[2], row[7]] for row in rows],
        )

    if code == ReportCode.HISTORIAL_PROPIO:
        rows = _enrollment_report_rows(db, student_id=user.id, active_only=False)
        return (
            "Historial académico propio",
            ["Periodo", "Código", "Materia", "Paralelo", "Estado", "Nota final"],
            [
                [
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[7],
                    row[8] if row[8] is not None else "Sin nota",
                ]
                for row in rows
            ],
        )

    if code == ReportCode.NOTAS_PROPIAS:
        rows = _enrollment_report_rows(db, student_id=user.id, active_only=False, grades_only=True)
        return (
            "Calificaciones propias",
            ["Periodo", "Código", "Materia", "Paralelo", "Nota final"],
            [[row[0], row[1], row[2], row[3], row[8]] for row in rows],
        )

    if code == ReportCode.MATERIAS_INSCRITAS:
        rows = _enrollment_report_rows(db, student_id=user.id, active_only=True)
        return (
            "Materias inscritas propias",
            ["Periodo", "Código", "Materia", "Paralelo"],
            [[row[0], row[1], row[2], row[3]] for row in rows],
        )

    if code == ReportCode.MATERIAS_DOCENTE:
        identifier = (
            user.id if user.rol == UserRole.DOCENTE else _required(teacher_id, "un docente")
        )
        teacher = db.get(Usuario, identifier)
        if not teacher or teacher.rol != UserRole.DOCENTE:
            raise HTTPException(status_code=404, detail="Docente no encontrado")
        rows = db.execute(
            select(
                PeriodoAcademico.denominacion,
                Materia.codigo,
                Materia.nombre,
                Curso.paralelo,
                Curso.fecha_inicio,
                Curso.fecha_fin,
            )
            .join(Curso, Curso.periodo_id == PeriodoAcademico.id)
            .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
            .join(Materia, Materia.id == MateriaPlan.materia_id)
            .where(Curso.docente_id == identifier)
            .order_by(PeriodoAcademico.fecha_inicio, Materia.codigo, Curso.paralelo)
        ).all()
        return (
            f"Materias asignadas a {teacher.nombres} {teacher.apellidos}",
            ["Periodo", "Código", "Materia", "Paralelo", "Inicio", "Fin"],
            [list(row) for row in rows],
        )

    raise HTTPException(status_code=422, detail="Tipo de reporte no válido")
