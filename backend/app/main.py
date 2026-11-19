from fastapi import FastAPI

from app.api.security import OriginGuardMiddleware
from app.modules.access.api.routes import router as access_router
from app.modules.curriculum.api.routes import router as curriculum_router
from app.modules.dashboard.api.routes import router as dashboard_router
from app.modules.enrollments.api.routes import router as enrollments_router
from app.modules.grades.api.routes import router as grades_router
from app.modules.notifications.api.routes import router as notifications_router
from app.modules.parallel.api.routes import router as parallel_router
from app.modules.periods.api.routes import router as periods_router
from app.modules.reports.api.routes import router as reports_router

app = FastAPI(title="Sistema Web de Gestión Académica", version="0.1.0")
app.add_middleware(OriginGuardMiddleware)
app.include_router(access_router)
app.include_router(curriculum_router)
app.include_router(periods_router)
app.include_router(parallel_router)
app.include_router(enrollments_router)
app.include_router(grades_router)
app.include_router(reports_router)
app.include_router(notifications_router)
app.include_router(dashboard_router)


@app.get("/api/health", tags=["sistema"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
