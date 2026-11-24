from datetime import UTC, date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import DbSession, user_with_full_access
from app.modules.access.models.user import Usuario
from app.modules.reports.schemas.preview import ReportPreview
from app.modules.reports.services.export_renderers import render_pdf, render_xlsx
from app.modules.reports.services.report_service import (
    ReportCode,
    build_report,
)

router = APIRouter(prefix="/api/v1/reports", tags=["reportes académicos"])
Actor = Annotated[Usuario, Depends(user_with_full_access)]


class ReportQuery:
    def __init__(
        self,
        career_id: UUID | None = None,
        plan_id: UUID | None = None,
        student_id: UUID | None = None,
        course_id: UUID | None = None,
        teacher_id: UUID | None = None,
        period_id: UUID | None = None,
        estado_inscripcion: Literal["ACTIVA", "RETIRADA"] | None = None,
        estado_paralelo: Literal["ACTIVO", "INACTIVO"] | None = None,
        estado_plan: Literal["BORRADOR", "VIGENTE", "INACTIVO"] | None = None,
        fecha_desde: date | None = None,
        fecha_hasta: date | None = None,
    ) -> None:
        self.career_id = career_id
        self.plan_id = plan_id
        self.student_id = student_id
        self.course_id = course_id
        self.teacher_id = teacher_id
        self.period_id = period_id
        self.estado_inscripcion = estado_inscripcion
        self.estado_paralelo = estado_paralelo
        self.estado_plan = estado_plan
        self.fecha_desde = fecha_desde
        self.fecha_hasta = fecha_hasta


ReportFilters = Annotated[ReportQuery, Depends()]


def _build_report(db: Session, actor: Usuario, code: ReportCode, filters: ReportQuery):
    return build_report(
        db,
        actor,
        code,
        career_id=filters.career_id,
        plan_id=filters.plan_id,
        student_id=filters.student_id,
        course_id=filters.course_id,
        teacher_id=filters.teacher_id,
        period_id=filters.period_id,
        estado_inscripcion=filters.estado_inscripcion,
        estado_paralelo=filters.estado_paralelo,
        estado_plan=filters.estado_plan,
        fecha_desde=filters.fecha_desde,
        fecha_hasta=filters.fecha_hasta,
    )


@router.get("/{report_code}/preview", response_model=ReportPreview)
async def preview_report(
    report_code: ReportCode,
    actor: Actor,
    db: DbSession,
    filters: ReportFilters,
    response: Response,
):
    title, headers, rows = _build_report(db, actor, report_code, filters)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return ReportPreview(
        code=report_code.value,
        title=title,
        headers=headers,
        rows=rows,
        row_count=len(rows),
        generated_at=datetime.now(UTC),
    )


@router.get("/{report_code}/export")
async def export_report(
    report_code: ReportCode,
    actor: Actor,
    db: DbSession,
    output_format: Annotated[Literal["pdf", "xlsx"], Query(alias="format")],
    filters: ReportFilters,
):
    title, headers, rows = _build_report(db, actor, report_code, filters)
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
