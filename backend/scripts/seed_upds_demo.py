"""Carga idempotente de un escenario académico ficticio en PostgreSQL local.

Ejecutar desde backend con DEMO_USER_PASSWORD definido en el entorno. Los
contenidos de los planes son muestras parciales inspiradas en UPDS, no mallas
oficiales. No modifica registros ajenos al prefijo QA-UPDS.
"""

import os
from datetime import date, time
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.modules.access.models.user import UserRole, Usuario
from app.modules.access.schemas.user import UserCreate
from app.modules.access.services import access_service
from app.modules.curriculum.models.entities import (
    Carrera,
    EstadoPlan,
    Facultad,
    Materia,
    MateriaPlan,
    ModalidadPlan,
    PlanEstudio,
    Prerrequisito,
    UnidadPlan,
)
from app.modules.curriculum.schemas.curriculum import (
    CareerCreate,
    FacultyCreate,
    PlanCreate,
    PlanSubjectCreate,
    PlanUpdate,
    PrerequisiteCreate,
    SubjectCreate,
)
from app.modules.curriculum.services import curriculum_service
from app.modules.enrollments.models.entities import HabilitacionInscripcion, Inscripcion
from app.modules.enrollments.services import enrollment_service
from app.modules.grades.models.entities import Calificacion
from app.modules.grades.services import grade_service
from app.modules.parallel.models.entities import Aula, BloqueHorario, Curso, PlantillaModular
from app.modules.parallel.schemas.courses import CourseCreate, CourseScheduleInput
from app.modules.parallel.schemas.modular import ModularPlanInput, ModularSubjectInput
from app.modules.parallel.schemas.planning import (
    ModularTemplateCreate,
    RoomCreate,
    ScheduleBlockCreate,
)
from app.modules.parallel.services import modular_service, parallel_service, planning_config
from app.modules.periods.models.entities import AperturaPlan, PeriodoAcademico, PeriodoPlan
from app.modules.periods.schemas.period import PeriodCreate
from app.modules.periods.schemas.planning import PeriodCareerPlanBatchItem
from app.modules.periods.services import period_service, planning_service
from app.modules.reports.services.export_renderers import render_pdf, render_xlsx
from app.modules.reports.services.report_service import ReportCode, build_report

DATA = (
    {
        "key": "SIS",
        "faculty": ("QA-UPDS-ING", "Ingeniería (Prueba UPDS)"),
        "career": "Ingeniería de Sistemas (Prueba UPDS)",
        "mode": ModalidadPlan.MODULAR,
        "subjects": (
            ("MET", "Metodología de la Investigación Científica", 1),
            ("PROGB", "Programación Básica", 1),
            ("PROG1", "Programación I", 2),
            ("SO1", "Sistemas Operativos I", 2),
        ),
        "prerequisite": ("PROG1", "PROGB"),
        "teacher": ("Elena", "Vargas"),
        "room": "QA SIS 101",
        "shift": "MANANA",
    },
    {
        "key": "ADM",
        "faculty": ("QA-UPDS-EMP", "Ciencias Empresariales (Prueba UPDS)"),
        "career": "Administración de Empresas (Prueba UPDS)",
        "mode": ModalidadPlan.SEMESTRAL,
        "subjects": (
            ("ADM1", "Administración I", 1),
            ("CONT1", "Contabilidad Empresarial I", 1),
            ("ADM2", "Administración II", 2),
            ("CONT2", "Contabilidad Empresarial II", 2),
        ),
        "prerequisite": ("ADM2", "ADM1"),
        "teacher": ("Marco", "Salinas"),
        "room": "QA ADM 201",
        "shift": None,
    },
    {
        "key": "PSI",
        "faculty": ("QA-UPDS-HUM", "Humanidades (Prueba UPDS)"),
        "career": "Psicología (Prueba UPDS)",
        "mode": ModalidadPlan.MODULAR,
        "subjects": (
            ("INTRO", "Introducción a la Psicología", 1),
            ("DES1", "Psicología del Desarrollo Humano I", 1),
            ("DES2", "Psicología del Desarrollo Humano II", 2),
            ("NEURO", "Fundamentos de Neurociencia", 2),
        ),
        "prerequisite": ("DES2", "DES1"),
        "teacher": ("Lucía", "Mendoza"),
        "room": "QA PSI 301",
        "shift": "TARDE",
    },
)

PERIODS = (
    ("Prueba UPDS 2028-1", date(2028, 1, 10), date(2028, 6, 30)),
    ("Prueba UPDS 2028-2", date(2028, 7, 3), date(2028, 12, 20)),
)


def require_local_database() -> str:
    target = urlparse(settings.database_url.replace("postgresql+psycopg://", "postgresql://"))
    if (
        settings.app_env != "development"
        or target.scheme != "postgresql"
        or target.hostname not in {"localhost", "127.0.0.1"}
        or target.port != 55432
    ):
        raise RuntimeError("Esta carga solo se admite en PostgreSQL local de desarrollo :55432")
    password = os.getenv("DEMO_USER_PASSWORD", "")
    if not password or len(password) > 128:
        raise RuntimeError("Define DEMO_USER_PASSWORD para las cuentas ficticias")
    return password


def first_or_create(db, model, key: dict, create):
    found = db.scalar(select(model).filter_by(**key))
    if found:
        return found
    create()
    found = db.scalar(select(model).filter_by(**key))
    assert found is not None
    return found


def demo_user(db, key: str, first: str, last: str, role: UserRole, password: str):
    ci = f"QA-UPDS-{key}"
    found = db.scalar(select(Usuario).where(Usuario.ci == ci))
    if found:
        assert found.rol == role and found.correo == f"qa.upds.{key.lower()}@example.com"
        return found
    payload = UserCreate(
        ci=ci,
        nombres=first,
        apellidos=last,
        correo=f"qa.upds.{key.lower()}@example.com",
        telefono="70000000",
        rol=role,
        **(
            {"titulo": "Licenciatura", "especialidad": "Docencia"}
            if role == UserRole.DOCENTE
            else {}
        ),
    )
    user, _ = access_service.create_user(db, payload)
    user.contrasena_hash = hash_password(password)
    user.debe_cambiar_contrasena = True
    db.commit()
    return user


def plan_entries(db, plan):
    rows = db.execute(
        select(MateriaPlan, Materia.codigo)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
        .where(MateriaPlan.plan_id == plan.id)
    ).all()
    return {code.rsplit("-", 1)[-1]: entry for entry, code in rows}


def ensure_curriculum(db, row):
    key = row["key"]
    faculty_code, faculty_name = row["faculty"]
    faculty = first_or_create(
        db,
        Facultad,
        {"codigo": faculty_code},
        lambda: curriculum_service.create_faculty(
            db, FacultyCreate(codigo=faculty_code, nombre=faculty_name)
        ),
    )
    career_code = f"QA-UPDS-{key}"
    career = first_or_create(
        db,
        Carrera,
        {"codigo": career_code},
        lambda: curriculum_service.create_career(
            db, CareerCreate(codigo=career_code, nombre=row["career"], facultad_id=faculty.id)
        ),
    )
    assert career.facultad_id == faculty.id
    plan_code = f"QA-UPDS-{key}-2028"
    plan = first_or_create(
        db,
        PlanEstudio,
        {"codigo": plan_code},
        lambda: curriculum_service.create_plan(
            db,
            PlanCreate(
                carrera_id=career.id, codigo=plan_code, modalidad=row["mode"], semestres_iniciales=2
            ),
        ),
    )
    assert plan.carrera_id == career.id and plan.modalidad == row["mode"]
    units = {
        u.numero: u for u in db.scalars(select(UnidadPlan).where(UnidadPlan.plan_id == plan.id))
    }
    assert set(units) == {1, 2}
    for short, name, semester in row["subjects"]:
        code = f"QA-{key}-{short}"
        subject = first_or_create(
            db,
            Materia,
            {"codigo": code},
            lambda code=code, name=name: curriculum_service.create_subject(
                db, SubjectCreate(codigo=code, nombre=name)
            ),
        )
        if not db.scalar(
            select(MateriaPlan.id).where(
                MateriaPlan.plan_id == plan.id, MateriaPlan.materia_id == subject.id
            )
        ):
            assert plan.estado == EstadoPlan.BORRADOR
            curriculum_service.add_subject_to_plan(
                db, plan.id, PlanSubjectCreate(materia_id=subject.id, unidad_id=units[semester].id)
            )
    entries = plan_entries(db, plan)
    dependent, required = row["prerequisite"]
    if not db.get(Prerrequisito, (plan.id, entries[dependent].id, entries[required].id)):
        assert plan.estado == EstadoPlan.BORRADOR
        curriculum_service.add_prerequisite(
            db,
            plan.id,
            entries[dependent].id,
            PrerequisiteCreate(requisito_materia_plan_id=entries[required].id),
        )
    if plan.estado == EstadoPlan.BORRADOR:
        curriculum_service.update_plan(db, plan.id, PlanUpdate(estado=EstadoPlan.VIGENTE))
    assert plan.estado == EstadoPlan.VIGENTE
    return career, plan, entries


def ensure_period(db, label, start, end):
    existing = db.scalar(select(PeriodoAcademico).where(PeriodoAcademico.denominacion == label))
    if existing:
        assert (existing.fecha_inicio, existing.fecha_fin) == (start, end)
        return existing
    created = period_service.create_period(
        db, PeriodCreate(denominacion=label, fecha_inicio=start, fecha_fin=end)
    )
    return db.get(PeriodoAcademico, created.id)


def ensure_room(db, code):
    room = db.get(Aula, code)
    if room:
        assert room.capacidad == 30 and room.activa
        return room
    return planning_config.create_room(db, RoomCreate(codigo=code, capacidad=30))


def ensure_modular_setup(db, periods):
    template = first_or_create(
        db,
        PlantillaModular,
        {"nombre": "QA UPDS 2028"},
        lambda: planning_config.create_modular_template(
            db,
            ModularTemplateCreate(
                nombre="QA UPDS 2028", clases_por_modulo=21, minutos_por_clase=180
            ),
        ),
    )
    for period in periods:
        if period.plantilla_modular_id is None:
            planning_service.set_modular_template(db, period.id, template.id)
        assert period.plantilla_modular_id == template.id
    for shift, start, end in (("MANANA", time(8), time(11)), ("TARDE", time(14), time(17))):
        current = db.scalar(
            select(BloqueHorario).where(
                BloqueHorario.turno == shift, BloqueHorario.predeterminado_modular.is_(True)
            )
        )
        if current:
            duration = (
                current.hora_fin.hour * 60
                + current.hora_fin.minute
                - current.hora_inicio.hour * 60
                - current.hora_inicio.minute
            )
            assert duration == template.minutos_por_clase
            continue
        planning_config.create_schedule_block(
            db,
            ScheduleBlockCreate(
                turno=shift,
                nombre=f"QA UPDS {shift}",
                hora_inicio=start,
                hora_fin=end,
                predeterminado_modular=True,
            ),
        )


def ensure_course(db, row, plan, opening, period, entry, teacher, *, first_period):
    code = "A"
    existing = db.scalar(
        select(Curso).where(
            Curso.materia_plan_id == entry.id, Curso.periodo_id == period.id, Curso.paralelo == code
        )
    )
    if existing:
        return existing
    if row["mode"] == ModalidadPlan.MODULAR:
        start = date(2028, 2, 1) if first_period else date(2028, 8, 1)
        payload = ModularPlanInput(
            plan_id=plan.id,
            apertura_plan_id=opening.id,
            turno=row["shift"],
            fecha_inicio=start,
            materias=[
                ModularSubjectInput(
                    materia_plan_id=entry.id,
                    paralelo=code,
                    cupo=12,
                    docente_id=teacher.id,
                    aula=row["room"],
                )
            ],
        )
        created = modular_service.create_modular_plan(db, period.id, payload)[0]
        return db.get(Curso, created.id)
    start = date(2028, 2, 1) if first_period else date(2028, 8, 1)
    end = date(2028, 6, 20) if first_period else date(2028, 12, 10)
    created = parallel_service.create_course(
        db,
        CourseCreate(
            materia_plan_id=entry.id,
            periodo_id=period.id,
            paralelo=code,
            cupo=12,
            fecha_inicio=start,
            fecha_fin=end,
            docente_id=teacher.id,
        ),
    )
    parallel_service.replace_schedules(
        db,
        created.id,
        [
            CourseScheduleInput(
                dia_semana="LUNES", hora_inicio=time(8), hora_fin=time(11), aula=row["room"]
            )
        ],
    )
    return db.get(Curso, created.id)


def main():
    password = require_local_database()
    with SessionLocal() as db:
        admin = db.scalar(
            select(Usuario).where(Usuario.rol == UserRole.ADMINISTRADOR).order_by(Usuario.creado_en)
        )
        if not admin:
            raise RuntimeError("Crea primero el administrador principal")
        periods = [ensure_period(db, *spec) for spec in PERIODS]
        template_ready = False
        summary = []
        for row in DATA:
            key = row["key"]
            career, plan, entries = ensure_curriculum(db, row)
            for period in periods:
                if not db.get(PeriodoPlan, (period.id, plan.id)):
                    planning_service.add_careers_with_plans(
                        db,
                        period.id,
                        [PeriodCareerPlanBatchItem(carrera_id=career.id, plan_ids=[plan.id])],
                    )
            if row["mode"] == ModalidadPlan.MODULAR and not template_ready:
                ensure_modular_setup(db, periods)
                template_ready = True
            opening = db.scalar(
                select(AperturaPlan).where(
                    AperturaPlan.plan_id == plan.id, AperturaPlan.periodo_inicio_id == periods[0].id
                )
            )
            if not opening:
                created = planning_service.create_opening(db, periods[0].id, plan.id)
                opening = db.get(AperturaPlan, created.id)
            teacher = demo_user(db, f"{key}-DOC", *row["teacher"], UserRole.DOCENTE, password)
            students = [
                demo_user(db, f"{key}-E{index:02}", first, "Prueba", UserRole.ESTUDIANTE, password)
                for index, first in enumerate(("Ana", "Bruno", "Carla"), 1)
            ]
            for student in students:
                curriculum_service.assign_student_plan(db, student.id, plan.id, opening.id)
            ensure_room(db, row["room"])
            first_code = row["prerequisite"][1]
            next_code = row["prerequisite"][0]
            first_course = ensure_course(
                db, row, plan, opening, periods[0], entries[first_code], teacher, first_period=True
            )
            next_course = ensure_course(
                db, row, plan, opening, periods[1], entries[next_code], teacher, first_period=False
            )
            for course in (first_course, next_course):
                if not course.inscripcion_abierta:
                    parallel_service.set_registration_open(db, course.id, True)
            for student, grade in zip(students, (75, 61, 40), strict=True):
                if not db.scalar(
                    select(HabilitacionInscripcion.id).where(
                        HabilitacionInscripcion.periodo_id == periods[0].id,
                        HabilitacionInscripcion.estudiante_id == student.id,
                    )
                ):
                    enrollment_service.set_authorization(db, periods[0].id, student.id, True, admin)
                if not db.scalar(
                    select(HabilitacionInscripcion.id).where(
                        HabilitacionInscripcion.periodo_id == periods[1].id,
                        HabilitacionInscripcion.estudiante_id == student.id,
                    )
                ):
                    enrollment_service.set_authorization(db, periods[1].id, student.id, True, admin)
                enrollment = db.scalar(
                    select(Inscripcion).where(
                        Inscripcion.curso_id == first_course.id,
                        Inscripcion.estudiante_id == student.id,
                    )
                )
                if not enrollment:
                    created = enrollment_service.enroll_student(db, student.id, first_course.id)
                    enrollment = db.get(Inscripcion, created.id)
                if not db.scalar(
                    select(Calificacion.id).where(Calificacion.inscripcion_id == enrollment.id)
                ):
                    grade_service.register_grade(db, teacher, enrollment.id, grade)
            for student in students[:2]:
                if not db.scalar(
                    select(Inscripcion.id).where(
                        Inscripcion.curso_id == next_course.id,
                        Inscripcion.estudiante_id == student.id,
                    )
                ):
                    enrollment_service.enroll_student(db, student.id, next_course.id)
            try:
                enrollment_service.enroll_student(db, students[2].id, next_course.id)
            except HTTPException as exc:
                db.rollback()
                assert exc.status_code == 409 and "prerrequisito" in str(exc.detail).lower()
            else:
                raise AssertionError(f"{key}: la inscripción sin prerrequisito fue aceptada")
            blocked_offer = next(
                item
                for item in enrollment_service.student_offer(db, students[2].id)
                if item.curso.id == next_course.id
            )
            assert blocked_offer.prerrequisitos_pendientes
            eligible_offer = next(
                item
                for item in enrollment_service.student_offer(db, students[0].id)
                if item.curso.id == next_course.id
            )
            assert not eligible_offer.prerrequisitos_pendientes
            assert len(grade_service.student_grades(db, students[0])) == 1
            assert len(grade_service.teacher_gradebook(db, teacher)) == 5
            title, headers, rows = build_report(
                db, admin, ReportCode.MATERIAS_POR_PLAN, career_id=career.id, plan_id=plan.id
            )
            assert len(rows) == 4
            assert render_pdf(title, headers, rows).startswith(b"%PDF")
            assert render_xlsx(title, headers, rows).startswith(b"PK")
            _, _, grade_rows = build_report(
                db, admin, ReportCode.NOTAS_ESTUDIANTE, student_id=students[0].id
            )
            assert grade_rows
            summary.append(
                f"{key}: plan {plan.codigo}, grupo {opening.codigo}; "
                "3 estudiantes, 1 docente, 2 paralelos, 3 notas, 2 avances y 1 bloqueo"
            )
        print("Escenario de prueba listo en PostgreSQL local:")
        for line in summary:
            print("- " + line)
        print("Todas las cuentas nuevas conservan el cambio obligatorio de contraseña.")


if __name__ == "__main__":
    main()
