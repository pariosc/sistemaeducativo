from datetime import datetime

from pydantic import BaseModel

from app.modules.access.models.user import UserRole


class DashboardMetric(BaseModel):
    clave: str
    etiqueta: str
    valor: int


class DashboardActivity(BaseModel):
    tipo: str
    mensaje: str
    fecha: datetime


class DashboardPublic(BaseModel):
    rol: UserRole
    indicadores: list[DashboardMetric]
    actividad: list[DashboardActivity]
    notificaciones_pendientes: int
