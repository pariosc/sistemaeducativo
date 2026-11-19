from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import DbSession, require_roles
from app.modules.access.models.user import UserRole, Usuario
from app.modules.enrollments.schemas.enrollment import (
    AuthorizationPublic,
    AuthorizationUpdate,
    CourseOffer,
    EnrollmentCreate,
    EnrollmentPublic,
)
from app.modules.enrollments.services import enrollment_service as service

router = APIRouter(tags=["habilitaciones e inscripciones"])
Administrator = Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))]
Student = Annotated[Usuario, Depends(require_roles(UserRole.ESTUDIANTE))]


@router.get(
    "/api/v1/admin/periods/{period_id}/authorizations", response_model=list[AuthorizationPublic]
)
async def get_authorizations(period_id: UUID, _: Administrator, db: DbSession):
    return service.list_authorizations(db, period_id)


@router.put(
    "/api/v1/admin/periods/{period_id}/students/{student_id}/authorization",
    response_model=AuthorizationPublic,
)
async def put_authorization(
    period_id: UUID,
    student_id: UUID,
    payload: AuthorizationUpdate,
    actor: Administrator,
    db: DbSession,
):
    return service.set_authorization(db, period_id, student_id, payload.activa, actor)


@router.get("/api/v1/student/offer", response_model=list[CourseOffer])
async def get_student_offer(student: Student, db: DbSession):
    return service.student_offer(db, student.id)


@router.get("/api/v1/student/enrollments", response_model=list[EnrollmentPublic])
async def get_student_enrollments(student: Student, db: DbSession):
    return service.list_student_enrollments(db, student.id)


@router.post(
    "/api/v1/student/enrollments",
    response_model=EnrollmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def post_student_enrollment(payload: EnrollmentCreate, student: Student, db: DbSession):
    return service.enroll_student(db, student.id, payload.curso_id)
