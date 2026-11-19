from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.periods.models.entities import PeriodoAcademico
from app.modules.periods.schemas.period import PeriodCreate, PeriodPublic


def list_periods(db: Session) -> list[PeriodPublic]:
    periods = db.scalars(
        select(PeriodoAcademico).order_by(PeriodoAcademico.fecha_inicio.desc())
    ).all()
    return [PeriodPublic.model_validate(period) for period in periods]


def create_period(db: Session, payload: PeriodCreate) -> PeriodPublic:
    period = PeriodoAcademico(**payload.model_dump())
    db.add(period)
    db.commit()
    db.refresh(period)
    return PeriodPublic.model_validate(period)
