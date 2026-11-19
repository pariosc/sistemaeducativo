from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.access.models.user import Usuario
from app.modules.enrollments.models.entities import EstadoInscripcion, Inscripcion
from app.modules.notifications.models.entities import Notificacion, TipoNotificacion
from app.modules.notifications.schemas import NotificationPublic
from app.modules.parallel.models.entities import (
    Curso,
    DiaSemana,
    ExcepcionHorario,
    HorarioClase,
)


def add_course_schedule_notifications(db: Session, course: Curso) -> None:
    recipients = set(
        db.scalars(
            select(Inscripcion.estudiante_id).where(
                Inscripcion.curso_id == course.id,
                Inscripcion.estado == EstadoInscripcion.ACTIVA,
            )
        ).all()
    )
    if course.docente_id:
        recipients.add(course.docente_id)
    for recipient_id in recipients:
        db.add(
            Notificacion(
                destinatario_id=recipient_id,
                curso_id=course.id,
                tipo=TipoNotificacion.CAMBIO_HORARIO,
                titulo="Cambio de horario",
                mensaje=(
                    f"Se actualizó el calendario del paralelo {course.paralelo}. "
                    "Consulta los días, horas y fechas vigentes."
                ),
            )
        )


def add_period_holiday_notifications(db: Session, period_id: UUID, holiday: date) -> None:
    weekdays = list(DiaSemana)
    weekday = weekdays[holiday.weekday()]
    course_ids = db.scalars(
        select(Curso.id)
        .join(HorarioClase, HorarioClase.curso_id == Curso.id)
        .outerjoin(
            ExcepcionHorario,
            (ExcepcionHorario.curso_id == Curso.id) & (ExcepcionHorario.fecha_original == holiday),
        )
        .where(
            Curso.periodo_id == period_id,
            Curso.activo.is_(True),
            Curso.fecha_inicio <= holiday,
            Curso.fecha_fin >= holiday,
            HorarioClase.dia_semana == weekday,
            ExcepcionHorario.id.is_(None),
        )
        .distinct()
    ).all()
    for course_id in course_ids:
        course = db.get(Curso, course_id)
        add_course_schedule_notifications(db, course)


def list_notifications(db: Session, user: Usuario, limit: int = 50) -> list[NotificationPublic]:
    notifications = db.scalars(
        select(Notificacion)
        .where(Notificacion.destinatario_id == user.id)
        .order_by(Notificacion.fecha_creacion.desc())
        .limit(limit)
    ).all()
    return [NotificationPublic.model_validate(notification) for notification in notifications]


def unread_count(db: Session, user_id: UUID) -> int:
    return int(
        db.scalar(
            select(func.count(Notificacion.id)).where(
                Notificacion.destinatario_id == user_id,
                Notificacion.leida.is_(False),
            )
        )
        or 0
    )


def mark_notification_read(db: Session, user: Usuario, notification_id: UUID) -> NotificationPublic:
    notification = db.scalar(
        select(Notificacion).where(
            Notificacion.id == notification_id,
            Notificacion.destinatario_id == user.id,
        )
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notification.leida = True
    db.commit()
    db.refresh(notification)
    return NotificationPublic.model_validate(notification)
