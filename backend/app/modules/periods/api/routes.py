from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import DbSession, require_roles
from app.modules.access.models.user import UserRole, Usuario
from app.modules.periods.schemas.period import PeriodCreate, PeriodPublic
from app.modules.periods.schemas.planning import (
    PeriodCareerInput,
    PeriodCareerPlanBatchInput,
    PeriodPlanInput,
    PeriodPlanningPublic,
    PeriodSubjectOverviewPublic,
    PeriodTemplateInput,
    PlanOpeningInput,
    PlanOpeningPublic,
    SubjectSuggestionPublic,
)
from app.modules.periods.services import planning_service
from app.modules.periods.services.period_service import create_period, list_periods

router = APIRouter(prefix="/api/v1/admin/periods", tags=["periodos académicos"])
AdminUser = Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))]


@router.get("", response_model=list[PeriodPublic])
async def get_periods(_: AdminUser, db: DbSession):
    return list_periods(db)


@router.post("", response_model=PeriodPublic, status_code=status.HTTP_201_CREATED)
async def post_period(payload: PeriodCreate, _: AdminUser, db: DbSession):
    return create_period(db, payload)


@router.get("/{period_id}/planning", response_model=PeriodPlanningPublic)
async def get_period_planning(period_id: UUID, _: AdminUser, db: DbSession):
    return planning_service.period_planning(db, period_id)


@router.get("/{period_id}/planning/overview", response_model=list[PeriodSubjectOverviewPublic])
async def get_period_subject_overview(period_id: UUID, _: AdminUser, db: DbSession):
    return planning_service.period_subject_overview(db, period_id)


@router.put("/{period_id}/planning/modular-template", response_model=PeriodPlanningPublic)
async def put_period_modular_template(
    period_id: UUID, payload: PeriodTemplateInput, _: AdminUser, db: DbSession
):
    return planning_service.set_modular_template(db, period_id, payload.plantilla_modular_id)


@router.post("/{period_id}/careers", response_model=PeriodPlanningPublic)
async def post_period_career(
    period_id: UUID, payload: PeriodCareerInput, _: AdminUser, db: DbSession
):
    return planning_service.add_career(db, period_id, payload.carrera_id)


@router.post("/{period_id}/careers/batch", response_model=PeriodPlanningPublic)
async def post_period_careers_batch(
    period_id: UUID, payload: PeriodCareerPlanBatchInput, _: AdminUser, db: DbSession
):
    return planning_service.add_careers_with_plans(db, period_id, payload.carreras)


@router.delete("/{period_id}/careers/{career_id}", response_model=PeriodPlanningPublic)
async def delete_period_career(period_id: UUID, career_id: UUID, _: AdminUser, db: DbSession):
    return planning_service.remove_career(db, period_id, career_id)


@router.post("/{period_id}/plans", response_model=PeriodPlanningPublic)
async def post_period_plan(period_id: UUID, payload: PeriodPlanInput, _: AdminUser, db: DbSession):
    return planning_service.add_plan(db, period_id, payload.plan_id)


@router.delete("/{period_id}/plans/{plan_id}", response_model=PeriodPlanningPublic)
async def delete_period_plan(period_id: UUID, plan_id: UUID, _: AdminUser, db: DbSession):
    return planning_service.remove_plan(db, period_id, plan_id)


@router.post(
    "/{period_id}/openings",
    response_model=PlanOpeningPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_plan_opening(
    period_id: UUID, payload: PlanOpeningInput, _: AdminUser, db: DbSession
):
    return planning_service.create_opening(db, period_id, payload.plan_id)


@router.delete("/{period_id}/openings/{opening_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan_opening(period_id: UUID, opening_id: UUID, _: AdminUser, db: DbSession):
    planning_service.remove_opening(db, period_id, opening_id)


@router.get("/{period_id}/plans/{plan_id}/openings", response_model=list[PlanOpeningPublic])
async def get_plan_openings(period_id: UUID, plan_id: UUID, _: AdminUser, db: DbSession):
    return planning_service.list_openings(db, plan_id, period_id)


@router.get(
    "/{period_id}/plans/{plan_id}/suggestions", response_model=list[SubjectSuggestionPublic]
)
async def get_subject_suggestions(period_id: UUID, plan_id: UUID, _: AdminUser, db: DbSession):
    return planning_service.subject_suggestions(db, period_id, plan_id)
