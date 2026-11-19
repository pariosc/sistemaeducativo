from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, user_with_full_access
from app.modules.access.models.user import Usuario
from app.modules.dashboard.schemas import DashboardPublic
from app.modules.dashboard.services.dashboard_service import dashboard

router = APIRouter(prefix="/api/v1/dashboard", tags=["panel"])
Actor = Annotated[Usuario, Depends(user_with_full_access)]


@router.get("", response_model=DashboardPublic)
async def get_dashboard(actor: Actor, db: DbSession):
    return dashboard(db, actor)
