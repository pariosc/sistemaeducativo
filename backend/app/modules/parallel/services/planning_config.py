from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.parallel.models.entities import (
    Aula,
    BloqueHorario,
    Curso,
    ExcepcionHorario,
    HorarioClase,
    PlantillaModular,
)
from app.modules.parallel.schemas.planning import (
    ModularTemplateCreate,
    ModularTemplateUpdate,
    RoomCreate,
    RoomUpdate,
    ScheduleBlockCreate,
    ScheduleBlockUpdate,
)
from app.modules.parallel.services.room_capacity import uses_room_from
from app.modules.periods.models.entities import PeriodoAcademico


def list_rooms(db: Session) -> list[Aula]:
    return db.scalars(select(Aula).order_by(Aula.codigo)).all()


def create_room(db: Session, payload: RoomCreate) -> Aula:
    room = Aula(codigo=payload.codigo.strip().upper(), capacidad=payload.capacidad)
    db.add(room)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El código de aula ya está registrado") from exc
    db.refresh(room)
    return room


def update_room(db: Session, code: str, payload: RoomUpdate) -> Aula:
    normalized = code.upper()
    affected_ids = (
        select(HorarioClase.curso_id)
        .where(HorarioClase.aula == normalized)
        .union(select(ExcepcionHorario.curso_id).where(ExcepcionHorario.aula == normalized))
    )
    db.scalars(
        select(Curso)
        .where(Curso.id.in_(affected_ids))
        .order_by(Curso.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    room = db.scalar(select(Aula).where(Aula.codigo == normalized).with_for_update())
    if not room:
        raise HTTPException(status_code=404, detail="Aula no encontrada")
    changes = payload.model_dump(exclude_unset=True)
    if "capacidad" in changes and changes["capacidad"] != room.capacidad:
        today = datetime.now(ZoneInfo("America/La_Paz")).date()
        affected_courses = db.scalars(
            select(Curso)
            .where(Curso.id.in_(affected_ids))
            .execution_options(populate_existing=True)
        ).all()
        for course in affected_courses:
            if course.cupo > changes["capacidad"] and uses_room_from(db, course, normalized, today):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"El aula {normalized} tiene clases futuras en el paralelo "
                        f"{course.paralelo} con cupo {course.cupo}"
                    ),
                )
    for key, value in changes.items():
        setattr(room, key, value)
    db.commit()
    db.refresh(room)
    return room


def list_schedule_blocks(db: Session) -> list[BloqueHorario]:
    return db.scalars(
        select(BloqueHorario).order_by(BloqueHorario.turno, BloqueHorario.hora_inicio)
    ).all()


def create_schedule_block(db: Session, payload: ScheduleBlockCreate) -> BloqueHorario:
    block = BloqueHorario(**payload.model_dump())
    if block.predeterminado_modular:
        _unset_other_defaults(db, block.turno)
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
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("activo", block.activo) and changes.get(
        "predeterminado_modular", block.predeterminado_modular
    ):
        _unset_other_defaults(db, changes.get("turno", block.turno), block.id)
    for key, value in changes.items():
        setattr(block, key, value)
    if not block.activo:
        block.predeterminado_modular = False
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El nombre ya existe en ese turno") from exc
    db.refresh(block)
    return block


def _unset_other_defaults(db: Session, shift: str, except_id: UUID | None = None) -> None:
    for block in db.scalars(
        select(BloqueHorario).where(
            BloqueHorario.turno == shift,
            BloqueHorario.predeterminado_modular.is_(True),
            BloqueHorario.id != except_id if except_id else True,
        )
    ):
        block.predeterminado_modular = False
    db.flush()


def list_modular_templates(db: Session) -> list[PlantillaModular]:
    return db.scalars(select(PlantillaModular).order_by(PlantillaModular.nombre)).all()


def create_modular_template(db: Session, payload: ModularTemplateCreate) -> PlantillaModular:
    template = PlantillaModular(**payload.model_dump())
    db.add(template)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El nombre de plantilla ya existe") from exc
    db.refresh(template)
    return template


def update_modular_template(
    db: Session, template_id: UUID, payload: ModularTemplateUpdate
) -> PlantillaModular:
    template = db.get(PlantillaModular, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Plantilla modular no encontrada")
    changes = payload.model_dump(exclude_unset=True)
    if any(key != "activa" for key in changes) and db.scalar(
        select(PeriodoAcademico.id)
        .where(PeriodoAcademico.plantilla_modular_id == template_id)
        .limit(1)
    ):
        raise HTTPException(
            status_code=409,
            detail="La plantilla ya está asignada a un semestre; crea otra versión",
        )
    for key, value in changes.items():
        setattr(template, key, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El nombre de plantilla ya existe") from exc
    db.refresh(template)
    return template
