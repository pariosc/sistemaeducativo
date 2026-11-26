from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import DbSession, require_roles, user_with_full_access
from app.modules.access.models.user import UserRole, Usuario
from app.modules.parallel.schemas.calendar import CalendarSessionPublic, PlanningBookingPublic
from app.modules.parallel.schemas.courses import (
    BatchRegistrationUpdate,
    CourseCreate,
    CoursePublic,
    CourseScheduleUpdate,
    CourseUpdate,
    HolidayCreate,
    HolidayPublic,
    RegistrationUpdate,
    ScheduleExceptionCreate,
    ScheduleExceptionPublic,
)
from app.modules.parallel.schemas.modular import (
    ModularBatchInput,
    ModularBatchPreview,
    ModularPlanInput,
    ModularPlanPreview,
)
from app.modules.parallel.schemas.planning import (
    ModularTemplateCreate,
    ModularTemplatePublic,
    ModularTemplateUpdate,
    RoomCreate,
    RoomPublic,
    RoomUpdate,
    ScheduleBlockCreate,
    ScheduleBlockPublic,
    ScheduleBlockUpdate,
)
from app.modules.parallel.services import calendar_service, modular_service, planning_config
from app.modules.parallel.services import parallel_service as service

router = APIRouter(tags=["paralelos y calendario"])
AdminUser = Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))]
AuthenticatedUser = Annotated[Usuario, Depends(user_with_full_access)]
AcademicUser = Annotated[Usuario, Depends(require_roles(UserRole.DOCENTE, UserRole.ESTUDIANTE))]


@router.get("/api/v1/my/calendar", response_model=list[CalendarSessionPublic])
async def get_personal_calendar(week_start: date, user: AcademicUser, db: DbSession):
    return calendar_service.personal_week(db, user, week_start)


@router.get(
    "/api/v1/admin/periods/{period_id}/calendar",
    response_model=list[CalendarSessionPublic],
)
async def get_period_calendar(period_id: UUID, week_start: date, _: AdminUser, db: DbSession):
    return calendar_service.period_week(db, period_id, week_start)


@router.get(
    "/api/v1/admin/planning/availability",
    response_model=list[CalendarSessionPublic],
)
async def get_planning_availability(date: date, _: AdminUser, db: DbSession):
    return calendar_service.availability_day(db, date)


@router.get(
    "/api/v1/admin/planning/availability-range",
    response_model=list[PlanningBookingPublic],
)
async def get_planning_availability_range(start: date, end: date, _: AdminUser, db: DbSession):
    return calendar_service.availability_range(db, start, end)


@router.get("/api/v1/admin/planning/rooms", response_model=list[RoomPublic])
async def get_rooms(_: AdminUser, db: DbSession):
    return planning_config.list_rooms(db)


@router.post(
    "/api/v1/admin/planning/rooms", response_model=RoomPublic, status_code=status.HTTP_201_CREATED
)
async def post_room(payload: RoomCreate, _: AdminUser, db: DbSession):
    return planning_config.create_room(db, payload)


@router.patch("/api/v1/admin/planning/rooms/{code}", response_model=RoomPublic)
async def patch_room(code: str, payload: RoomUpdate, _: AdminUser, db: DbSession):
    return planning_config.update_room(db, code, payload)


@router.get("/api/v1/admin/planning/schedule-blocks", response_model=list[ScheduleBlockPublic])
async def get_schedule_blocks(_: AdminUser, db: DbSession):
    return planning_config.list_schedule_blocks(db)


@router.post(
    "/api/v1/admin/planning/schedule-blocks",
    response_model=ScheduleBlockPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_schedule_block(payload: ScheduleBlockCreate, _: AdminUser, db: DbSession):
    return planning_config.create_schedule_block(db, payload)


@router.patch(
    "/api/v1/admin/planning/schedule-blocks/{block_id}", response_model=ScheduleBlockPublic
)
async def patch_schedule_block(
    block_id: UUID, payload: ScheduleBlockUpdate, _: AdminUser, db: DbSession
):
    return planning_config.update_schedule_block(db, block_id, payload)


@router.get("/api/v1/admin/planning/modular-templates", response_model=list[ModularTemplatePublic])
async def get_modular_templates(_: AdminUser, db: DbSession):
    return planning_config.list_modular_templates(db)


@router.post(
    "/api/v1/admin/planning/modular-templates",
    response_model=ModularTemplatePublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_modular_template(payload: ModularTemplateCreate, _: AdminUser, db: DbSession):
    return planning_config.create_modular_template(db, payload)


@router.patch(
    "/api/v1/admin/planning/modular-templates/{template_id}",
    response_model=ModularTemplatePublic,
)
async def patch_modular_template(
    template_id: UUID, payload: ModularTemplateUpdate, _: AdminUser, db: DbSession
):
    return planning_config.update_modular_template(db, template_id, payload)


@router.post(
    "/api/v1/admin/periods/{period_id}/modular/preview",
    response_model=ModularPlanPreview,
)
async def preview_modular_sequence(
    period_id: UUID, payload: ModularPlanInput, _: AdminUser, db: DbSession
):
    return modular_service.preview_modular_plan(db, period_id, payload)


@router.post(
    "/api/v1/admin/periods/{period_id}/modular/courses",
    response_model=list[CoursePublic],
    status_code=status.HTTP_201_CREATED,
)
async def post_modular_sequence(
    period_id: UUID, payload: ModularPlanInput, _: AdminUser, db: DbSession
):
    return modular_service.create_modular_plan(db, period_id, payload)


@router.post(
    "/api/v1/admin/periods/{period_id}/modular/batch/preview",
    response_model=ModularBatchPreview,
)
async def preview_modular_batch(
    period_id: UUID, payload: ModularBatchInput, _: AdminUser, db: DbSession
):
    return modular_service.preview_modular_batch(db, period_id, payload)


@router.post(
    "/api/v1/admin/periods/{period_id}/modular/batch/courses",
    response_model=list[CoursePublic],
    status_code=status.HTTP_201_CREATED,
)
async def post_modular_batch(
    period_id: UUID, payload: ModularBatchInput, _: AdminUser, db: DbSession
):
    return modular_service.create_modular_batch(db, period_id, payload)


@router.get("/api/v1/courses", response_model=list[CoursePublic])
async def get_courses(user: AuthenticatedUser, db: DbSession):
    return service.list_courses(db, user)


@router.post(
    "/api/v1/admin/courses", response_model=CoursePublic, status_code=status.HTTP_201_CREATED
)
async def post_course(payload: CourseCreate, _: AdminUser, db: DbSession):
    return service.create_course(db, payload)


@router.patch("/api/v1/admin/courses/{course_id}", response_model=CoursePublic)
async def patch_course(course_id: UUID, payload: CourseUpdate, _: AdminUser, db: DbSession):
    return service.update_course(db, course_id, payload)


@router.post("/api/v1/admin/courses/{course_id}/preview")
async def preview_course_update(
    course_id: UUID, payload: CourseUpdate, _: AdminUser, db: DbSession
):
    return service.validate_course_update_preview(db, course_id, payload)


@router.put("/api/v1/admin/courses/{course_id}/schedules", response_model=CoursePublic)
async def put_schedules(
    course_id: UUID, payload: CourseScheduleUpdate, _: AdminUser, db: DbSession
):
    return service.replace_schedules(db, course_id, payload.horarios)


@router.post("/api/v1/admin/courses/{course_id}/schedules/validate")
async def validate_schedules(
    course_id: UUID, payload: CourseScheduleUpdate, _: AdminUser, db: DbSession
):
    return service.validate_schedule_preview(db, course_id, payload.horarios)


@router.patch("/api/v1/admin/courses/{course_id}/registration", response_model=CoursePublic)
async def patch_registration(
    course_id: UUID, payload: RegistrationUpdate, _: AdminUser, db: DbSession
):
    return service.set_registration_open(db, course_id, payload.inscripcion_abierta)


@router.patch(
    "/api/v1/admin/periods/{period_id}/courses/registration",
    response_model=list[CoursePublic],
)
async def patch_period_registration(
    period_id: UUID, payload: BatchRegistrationUpdate, _: AdminUser, db: DbSession
):
    return service.set_registration_open_many(
        db, period_id, set(payload.curso_ids), payload.inscripcion_abierta
    )


@router.delete("/api/v1/admin/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_course(course_id: UUID, _: AdminUser, db: DbSession):
    service.delete_course(db, course_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/v1/admin/periods/{period_id}/holidays", response_model=list[HolidayPublic])
async def get_holidays(period_id: UUID, _: AdminUser, db: DbSession):
    return service.list_holidays(db, period_id)


@router.post(
    "/api/v1/admin/periods/{period_id}/holidays",
    response_model=HolidayPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_holiday(period_id: UUID, payload: HolidayCreate, _: AdminUser, db: DbSession):
    return service.create_holiday(db, period_id, payload)


@router.delete(
    "/api/v1/admin/periods/{period_id}/holidays/{holiday_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_holiday(period_id: UUID, holiday_id: UUID, _: AdminUser, db: DbSession):
    service.delete_holiday(db, period_id, holiday_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/v1/admin/courses/{course_id}/exceptions",
    response_model=list[ScheduleExceptionPublic],
)
async def get_course_exceptions(course_id: UUID, _: AdminUser, db: DbSession):
    return service.list_exceptions(db, course_id)


@router.post(
    "/api/v1/admin/courses/{course_id}/exceptions",
    response_model=ScheduleExceptionPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_course_exception(
    course_id: UUID, payload: ScheduleExceptionCreate, _: AdminUser, db: DbSession
):
    return service.create_exception(db, course_id, payload)


@router.delete(
    "/api/v1/admin/courses/{course_id}/exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_course_exception(course_id: UUID, exception_id: UUID, _: AdminUser, db: DbSession):
    service.delete_exception(db, course_id, exception_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
