import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.notifications.models.entities import TipoNotificacion


class NotificationPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    curso_id: uuid.UUID | None
    tipo: TipoNotificacion
    titulo: str
    mensaje: str
    fecha_creacion: datetime
    leida: bool
