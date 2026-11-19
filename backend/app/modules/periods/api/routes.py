from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import DbSession, require_roles
from app.modules.access.models.user import UserRole, Usuario
from app.modules.periods.schemas.period import PeriodCreate, PeriodPublic
from app.modules.periods.services.period_service import create_period, list_periods

router = APIRouter(prefix="/api/v1/admin/periods", tags=["periodos académicos"])
AdminUser = Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))]


@router.get("", response_model=list[PeriodPublic])
async def get_periods(_: AdminUser, db: DbSession):
    return list_periods(db)


@router.post("", response_model=PeriodPublic, status_code=status.HTTP_201_CREATED)
async def post_period(payload: PeriodCreate, _: AdminUser, db: DbSession):
    return create_period(db, payload)
