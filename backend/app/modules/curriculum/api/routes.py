from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import DbSession, require_roles
from app.modules.access.models.user import UserRole, Usuario
from app.modules.curriculum.schemas.curriculum import (
    CareerCreate,
    CareerPublic,
    CareerUpdate,
    FacultyCreate,
    FacultyPublic,
    FacultyUpdate,
    PlanCreate,
    PlanDuplicate,
    PlanPublic,
    PlanSubjectCreate,
    PlanSubjectsBulkCreate,
    PlanSubjectUpdate,
    PlanUnitsGenerate,
    PlanUpdate,
    PrerequisiteCreate,
    StudentOpeningAssignment,
    StudentPlanAssignment,
    StudentPlanPublic,
    SubjectCreate,
    SubjectPublic,
    SubjectUpdate,
    UnitCreate,
    UnitPublic,
    UnitUpdate,
)
from app.modules.curriculum.services import curriculum_service as service
from app.modules.periods.schemas.planning import PlanOpeningPublic
from app.modules.periods.services import planning_service

router = APIRouter(prefix="/api/v1/admin", tags=["currículo"])
AdminUser = Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))]


@router.get("/faculties", response_model=list[FacultyPublic])
async def get_faculties(_: AdminUser, db: DbSession):
    return service.list_faculties(db)


@router.post("/faculties", response_model=FacultyPublic, status_code=status.HTTP_201_CREATED)
async def post_faculty(payload: FacultyCreate, _: AdminUser, db: DbSession):
    return service.create_faculty(db, payload)


@router.patch("/faculties/{faculty_id}", response_model=FacultyPublic)
async def patch_faculty(faculty_id: UUID, payload: FacultyUpdate, _: AdminUser, db: DbSession):
    return service.update_faculty(db, faculty_id, payload)


@router.delete("/faculties/{faculty_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_faculty(faculty_id: UUID, _: AdminUser, db: DbSession):
    service.delete_faculty(db, faculty_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/careers", response_model=list[CareerPublic])
async def get_careers(_: AdminUser, db: DbSession):
    return service.list_careers(db)


@router.post("/careers", response_model=CareerPublic, status_code=status.HTTP_201_CREATED)
async def post_career(payload: CareerCreate, _: AdminUser, db: DbSession):
    return service.create_career(db, payload)


@router.patch("/careers/{career_id}", response_model=CareerPublic)
async def patch_career(career_id: UUID, payload: CareerUpdate, _: AdminUser, db: DbSession):
    return service.update_career(db, career_id, payload)


@router.delete("/careers/{career_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_career(career_id: UUID, _: AdminUser, db: DbSession):
    service.delete_career(db, career_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/subjects", response_model=list[SubjectPublic])
async def get_subjects(_: AdminUser, db: DbSession):
    return service.list_subjects(db)


@router.post("/subjects", response_model=SubjectPublic, status_code=status.HTTP_201_CREATED)
async def post_subject(payload: SubjectCreate, _: AdminUser, db: DbSession):
    return service.create_subject(db, payload)


@router.patch("/subjects/{subject_id}", response_model=SubjectPublic)
async def patch_subject(subject_id: UUID, payload: SubjectUpdate, _: AdminUser, db: DbSession):
    return service.update_subject(db, subject_id, payload)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject(subject_id: UUID, _: AdminUser, db: DbSession):
    service.delete_subject(db, subject_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/plans", response_model=list[PlanPublic])
async def get_plans(_: AdminUser, db: DbSession):
    return service.list_plans(db)


@router.get("/plans/{plan_id}/openings", response_model=list[PlanOpeningPublic])
async def get_plan_openings(plan_id: UUID, _: AdminUser, db: DbSession):
    return planning_service.list_openings(db, plan_id)


@router.post("/plans", response_model=PlanPublic, status_code=status.HTTP_201_CREATED)
async def post_plan(payload: PlanCreate, _: AdminUser, db: DbSession):
    return service.create_plan(db, payload)


@router.post(
    "/plans/{plan_id}/duplicate",
    response_model=PlanPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_plan_duplicate(plan_id: UUID, payload: PlanDuplicate, _: AdminUser, db: DbSession):
    return service.duplicate_plan(db, plan_id, payload)


@router.patch("/plans/{plan_id}", response_model=PlanPublic)
async def patch_plan(plan_id: UUID, payload: PlanUpdate, _: AdminUser, db: DbSession):
    return service.update_plan(db, plan_id, payload)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_plan(plan_id: UUID, _: AdminUser, db: DbSession):
    service.delete_plan(db, plan_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/plans/{plan_id}/units", response_model=UnitPublic, status_code=status.HTTP_201_CREATED
)
async def post_unit(plan_id: UUID, payload: UnitCreate, _: AdminUser, db: DbSession):
    return service.create_unit(db, plan_id, payload)


@router.post("/plans/{plan_id}/units/generate", response_model=PlanPublic)
async def post_generate_units(
    plan_id: UUID, payload: PlanUnitsGenerate, _: AdminUser, db: DbSession
):
    return service.generate_units(db, plan_id, payload)


@router.post("/plans/{plan_id}/units/renumber", response_model=PlanPublic)
async def post_renumber_units(plan_id: UUID, _: AdminUser, db: DbSession):
    return service.renumber_units(db, plan_id)


@router.patch("/plans/{plan_id}/units/{unit_id}", response_model=UnitPublic)
async def patch_unit(
    plan_id: UUID, unit_id: UUID, payload: UnitUpdate, _: AdminUser, db: DbSession
):
    return service.update_unit(db, plan_id, unit_id, payload)


@router.delete("/plans/{plan_id}/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_unit(plan_id: UUID, unit_id: UUID, _: AdminUser, db: DbSession):
    service.delete_unit(db, plan_id, unit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/plans/{plan_id}/subjects", response_model=PlanPublic, status_code=status.HTTP_201_CREATED
)
async def post_plan_subject(plan_id: UUID, payload: PlanSubjectCreate, _: AdminUser, db: DbSession):
    return service.add_subject_to_plan(db, plan_id, payload)


@router.post(
    "/plans/{plan_id}/subjects/bulk",
    response_model=PlanPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_plan_subjects_bulk(
    plan_id: UUID, payload: PlanSubjectsBulkCreate, _: AdminUser, db: DbSession
):
    return service.add_subjects_to_plan(db, plan_id, payload)


@router.patch("/plans/{plan_id}/subjects/{subject_plan_id}", response_model=PlanPublic)
async def patch_plan_subject(
    plan_id: UUID,
    subject_plan_id: UUID,
    payload: PlanSubjectUpdate,
    _: AdminUser,
    db: DbSession,
):
    return service.move_subject_in_plan(db, plan_id, subject_plan_id, payload)


@router.delete("/plans/{plan_id}/subjects/{subject_plan_id}", response_model=PlanPublic)
async def delete_plan_subject(plan_id: UUID, subject_plan_id: UUID, _: AdminUser, db: DbSession):
    return service.remove_subject_from_plan(db, plan_id, subject_plan_id)


@router.post(
    "/plans/{plan_id}/subjects/{subject_plan_id}/prerequisites",
    response_model=PlanPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_prerequisite(
    plan_id: UUID,
    subject_plan_id: UUID,
    payload: PrerequisiteCreate,
    _: AdminUser,
    db: DbSession,
):
    return service.add_prerequisite(db, plan_id, subject_plan_id, payload)


@router.delete(
    "/plans/{plan_id}/subjects/{subject_plan_id}/prerequisites/{requirement_id}",
    response_model=PlanPublic,
)
async def delete_prerequisite(
    plan_id: UUID,
    subject_plan_id: UUID,
    requirement_id: UUID,
    _: AdminUser,
    db: DbSession,
):
    return service.remove_prerequisite(db, plan_id, subject_plan_id, requirement_id)


@router.get("/students/plan-assignments", response_model=list[StudentPlanPublic])
async def get_student_plan_assignments(_: AdminUser, db: DbSession):
    return service.list_student_plans(db)


@router.put("/students/{user_id}/plan", response_model=StudentPlanPublic)
async def put_student_plan(
    user_id: UUID, payload: StudentPlanAssignment, _: AdminUser, db: DbSession
):
    return service.assign_student_plan(
        db, user_id, payload.plan_estudio_id, payload.apertura_plan_id
    )


@router.put("/students/{user_id}/opening", response_model=StudentPlanPublic)
async def put_student_opening(
    user_id: UUID, payload: StudentOpeningAssignment, _: AdminUser, db: DbSession
):
    return service.assign_student_opening(db, user_id, payload.apertura_plan_id)
