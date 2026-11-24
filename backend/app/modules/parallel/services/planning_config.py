from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.parallel.models.entities import Aula, BloqueHorario
from app.modules.parallel.schemas.planning import (
    RoomCreate,
    RoomUpdate,
    ScheduleBlockCreate,
    ScheduleBlockUpdate,
)


def list_rooms(db: Session) -> list[Aula]:
    return db.scalars(select(Aula).order_by(Aula.codigo)).all()


def create_room(db: Session, payload: RoomCreate) -> Aula:
    room = Aula(codigo=payload.codigo.strip().upper())
    db.add(room)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El código de aula ya está registrado") from exc
    db.refresh(room)
    return room


def update_room(db: Session, code: str, payload: RoomUpdate) -> Aula:
    room = db.get(Aula, code.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Aula no encontrada")
    room.activa = payload.activa
    db.commit()
    db.refresh(room)
    return room


def list_schedule_blocks(db: Session) -> list[BloqueHorario]:
    return db.scalars(
        select(BloqueHorario).order_by(BloqueHorario.turno, BloqueHorario.hora_inicio)
    ).all()


def create_schedule_block(db: Session, payload: ScheduleBlockCreate) -> BloqueHorario:
    block = BloqueHorario(**payload.model_dump())
    db.add(block)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Ya existe un bloque con ese nombre en el turno"
        ) from exc
    db.refresh(block)
    return block


def update_schedule_block(
    db: Session, block_id: UUID, payload: ScheduleBlockUpdate
) -> BloqueHorario:
    block = db.get(BloqueHorario, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Bloque horario no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(block, key, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El nombre ya existe en ese turno") from exc
    db.refresh(block)
    return block
