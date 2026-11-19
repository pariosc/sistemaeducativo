from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import DbSession, user_with_full_access
from app.modules.access.models.user import Usuario
from app.modules.reports.services.export_renderers import render_pdf, render_xlsx
from app.modules.reports.services.report_service import (
    ReportCode,
    build_report,
)

router = APIRouter(prefix="/api/v1/reports", tags=["reportes académicos"])
Actor = Annotated[Usuario, Depends(user_with_full_access)]


@router.get("/{report_code}/export")
async def export_report(
    report_code: ReportCode,
    actor: Actor,
    db: DbSession,
    output_format: Annotated[Literal["pdf", "xlsx"], Query(alias="format")],
    career_id: UUID | None = None,
    plan_id: UUID | None = None,
    student_id: UUID | None = None,
    course_id: UUID | None = None,
    teacher_id: UUID | None = None,
):
    title, headers, rows = build_report(
        db,
        actor,
        report_code,
        career_id=career_id,
        plan_id=plan_id,
        student_id=student_id,
        course_id=course_id,
        teacher_id=teacher_id,
    )
    content = (
        render_pdf(title, headers, rows)
        if output_format == "pdf"
        else render_xlsx(title, headers, rows)
    )
    media_type = (
        "application/pdf"
        if output_format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{report_code.value}.{output_format}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
