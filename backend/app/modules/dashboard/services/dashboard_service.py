from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.modules.access.models.user import UserRole, Usuario
from app.modules.curriculum.models.entities import Carrera, Materia, MateriaPlan, PlanEstudio
from app.modules.dashboard.schemas import DashboardActivity, DashboardMetric, DashboardPublic
from app.modules.enrollments.models.entities import (
    EstadoInscripcion,
    HabilitacionInscripcion,
    Inscripcion,
)
from app.modules.grades.models.entities import Calificacion
from app.modules.notifications.models.entities import Notificacion
from app.modules.notifications.services.notification_service import unread_count
from app.modules.parallel.models.entities import Curso
from app.modules.periods.models.entities import PeriodoAcademico


def _events(db: Session, user: Usuario) -> list[DashboardActivity]:
    activities: list[DashboardActivity] = []
    enrollment_query = (
        select(
            Inscripcion.fecha_inscripcion,
            Usuario.nombres,
            Usuario.apellidos,
            Materia.codigo,
            Curso.paralelo,
        )
        .join(Usuario, Usuario.id == Inscripcion.estudiante_id)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
        .where(Inscripcion.estado == EstadoInscripcion.ACTIVA)
    )
    grade_query = (
        select(
            Calificacion.fecha_registro,
            Usuario.nombres,
            Usuario.apellidos,
            Materia.codigo,
            Curso.paralelo,
            Calificacion.nota_final,
        )
        .join(Inscripcion, Inscripcion.id == Calificacion.inscripcion_id)
        .join(Usuario, Usuario.id == Inscripcion.estudiante_id)
        .join(Curso, Curso.id == Inscripcion.curso_id)
        .join(MateriaPlan, MateriaPlan.id == Curso.materia_plan_id)
        .join(Materia, Materia.id == MateriaPlan.materia_id)
    )
    if user.rol == UserRole.DOCENTE:
        enrollment_query = enrollment_query.where(Curso.docente_id == user.id)
        grade_query = grade_query.where(Curso.docente_id == user.id)
    elif user.rol == UserRole.ESTUDIANTE:
        enrollment_query = enrollment_query.where(Inscripcion.estudiante_id == user.id)
        grade_query = grade_query.where(Inscripcion.estudiante_id == user.id)
    for timestamp, first, last, subject, parallel in db.execute(
        enrollment_query.order_by(Inscripcion.fecha_inscripcion.desc()).limit(10)
    ):
        activities.append(
            DashboardActivity(
                tipo="INSCRIPCION",
                mensaje=f"{first} {last} se inscribió en {subject}, paralelo {parallel}.",
                fecha=timestamp,
            )
        )
    for timestamp, first, last, subject, parallel, grade in db.execute(
        grade_query.order_by(Calificacion.fecha_registro.desc()).limit(10)
    ):
        person = "Registraste" if user.rol == UserRole.DOCENTE else f"{first} {last} recibió"
        if user.rol == UserRole.ESTUDIANTE:
            person = "Recibiste"
        activities.append(
            DashboardActivity(
                tipo="CALIFICACION",
                mensaje=f"{person} la nota {grade} en {subject}, paralelo {parallel}.",
                fecha=timestamp,
            )
        )

    if user.rol == UserRole.ADMINISTRADOR:
        authorization_query = (
            select(
                HabilitacionInscripcion.fecha_autorizacion,
                Usuario.nombres,
                Usuario.apellidos,
                PeriodoAcademico.denominacion,
                HabilitacionInscripcion.activa,
            )
            .join(Usuario, Usuario.id == HabilitacionInscripcion.estudiante_id)
            .join(PeriodoAcademico, PeriodoAcademico.id == HabilitacionInscripcion.periodo_id)
            .order_by(HabilitacionInscripcion.fecha_autorizacion.desc())
            .limit(10)
        )
        for timestamp, first, last, period, enabled in db.execute(authorization_query):
            verb = "habilitó" if enabled else "revocó la habilitación de"
            activities.append(
                DashboardActivity(
                    tipo="HABILITACION",
                    mensaje=f"El administrador {verb} {first} {last} para {period}.",
                    fecha=timestamp,
                )
            )

    notification_rows = db.scalars(
        select(Notificacion)
        .where(Notificacion.destinatario_id == user.id)
        .order_by(Notificacion.fecha_creacion.desc())
        .limit(10)
    ).all()
    activities.extend(
        DashboardActivity(
            tipo=notice.tipo.value,
            mensaje=notice.mensaje,
            fecha=notice.fecha_creacion,
        )
        for notice in notification_rows
    )
    activities.sort(key=lambda item: item.fecha, reverse=True)
    return activities[:10]


def _metric(key: str, label: str, value: int) -> DashboardMetric:
    return DashboardMetric(clave=key, etiqueta=label, valor=value)


def _count(db: Session, statement) -> int:
    return int(db.scalar(statement) or 0)


def dashboard(db: Session, user: Usuario) -> DashboardPublic:
    if user.rol == UserRole.ADMINISTRADOR:
        metrics = [
            _metric(
                "usuarios",
                "Cuentas activas",
                _count(db, select(func.count(Usuario.id)).where(Usuario.activo.is_(True))),
            ),
            _metric(
                "carreras",
                "Carreras activas",
                _count(db, select(func.count(Carrera.id)).where(Carrera.activo.is_(True))),
            ),
            _metric(
                "planes",
                "Planes vigentes",
                _count(
                    db, select(func.count(PlanEstudio.id)).where(PlanEstudio.estado == "VIGENTE")
                ),
            ),
            _metric(
                "paralelos",
                "Paralelos activos",
                _count(db, select(func.count(Curso.id)).where(Curso.activo.is_(True))),
            ),
            _metric(
                "inscripciones",
                "Inscripciones activas",
                _count(
                    db,
                    select(func.count(Inscripcion.id)).where(
                        Inscripcion.estado == EstadoInscripcion.ACTIVA
                    ),
                ),
            ),
        ]
    elif user.rol == UserRole.DOCENTE:
        metrics = [
            _metric(
                "paralelos",
                "Mis paralelos activos",
                _count(
                    db,
                    select(func.count(Curso.id)).where(
                        Curso.docente_id == user.id, Curso.activo.is_(True)
                    ),
                ),
            ),
            _metric(
                "estudiantes",
                "Estudiantes inscritos",
                _count(
                    db,
                    select(func.count(distinct(Inscripcion.estudiante_id)))
                    .join(Curso, Curso.id == Inscripcion.curso_id)
                    .where(
                        Curso.docente_id == user.id,
                        Curso.activo.is_(True),
                        Inscripcion.estado == EstadoInscripcion.ACTIVA,
                    ),
                ),
            ),
            _metric(
                "calificaciones",
                "Notas registradas",
                _count(
                    db,
                    select(func.count(Calificacion.id))
                    .join(Inscripcion, Inscripcion.id == Calificacion.inscripcion_id)
                    .join(Curso, Curso.id == Inscripcion.curso_id)
                    .where(Curso.docente_id == user.id),
                ),
            ),
        ]
    else:
        metrics = [
            _metric(
                "inscripciones",
                "Mis inscripciones activas",
                _count(
                    db,
                    select(func.count(Inscripcion.id)).where(
                        Inscripcion.estudiante_id == user.id,
                        Inscripcion.estado == EstadoInscripcion.ACTIVA,
                    ),
                ),
            ),
            _metric(
                "calificaciones",
                "Mis calificaciones",
                _count(
                    db,
                    select(func.count(Calificacion.id))
                    .join(Inscripcion, Inscripcion.id == Calificacion.inscripcion_id)
                    .where(Inscripcion.estudiante_id == user.id),
                ),
            ),
            _metric(
                "aprobadas",
                "Materias aprobadas",
                _count(
                    db,
                    select(func.count(Calificacion.id))
                    .join(Inscripcion, Inscripcion.id == Calificacion.inscripcion_id)
                    .where(Inscripcion.estudiante_id == user.id, Calificacion.nota_final >= 51),
                ),
            ),
        ]

    return DashboardPublic(
        rol=user.rol,
        indicadores=metrics,
        actividad=_events(db, user),
        notificaciones_pendientes=unread_count(db, user.id),
    )
