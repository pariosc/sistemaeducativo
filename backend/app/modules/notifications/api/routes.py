from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, user_with_full_access
from app.modules.access.models.user import Usuario
from app.modules.notifications.schemas import NotificationPublic
from app.modules.notifications.services import notification_service

router = APIRouter(prefix="/api/v1/notifications", tags=["notificaciones"])
Actor = Annotated[Usuario, Depends(user_with_full_access)]


@router.get("", response_model=list[NotificationPublic])
async def get_notifications(
    actor: Actor,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    return notification_service.list_notifications(db, actor, limit)


@router.patch("/{notification_id}/read", response_model=NotificationPublic)
async def patch_read_notification(notification_id: UUID, actor: Actor, db: DbSession):
    return notification_service.mark_notification_read(db, actor, notification_id)
