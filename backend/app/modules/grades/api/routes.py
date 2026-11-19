from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, require_roles
from app.modules.access.models.user import UserRole, Usuario
from app.modules.grades.schemas.grade import GradeInput, GradePublic, GradeWorkItem
from app.modules.grades.services import grade_service as service

router = APIRouter(tags=["calificaciones"])
Teacher = Annotated[Usuario, Depends(require_roles(UserRole.DOCENTE))]
Student = Annotated[Usuario, Depends(require_roles(UserRole.ESTUDIANTE))]


@router.get("/api/v1/teacher/grades", response_model=list[GradeWorkItem])
async def get_teacher_gradebook(teacher: Teacher, db: DbSession):
    return service.teacher_gradebook(db, teacher)


@router.post("/api/v1/teacher/enrollments/{enrollment_id}/grade", response_model=GradePublic)
async def post_grade(enrollment_id: UUID, payload: GradeInput, teacher: Teacher, db: DbSession):
    return service.register_grade(db, teacher, enrollment_id, payload.nota_final)


@router.put("/api/v1/teacher/enrollments/{enrollment_id}/grade", response_model=GradePublic)
async def put_grade(enrollment_id: UUID, payload: GradeInput, teacher: Teacher, db: DbSession):
    return service.correct_grade(db, teacher, enrollment_id, payload.nota_final)


@router.get("/api/v1/student/grades", response_model=list[GradePublic])
async def get_student_grades(student: Student, db: DbSession):
    return service.student_grades(db, student)
