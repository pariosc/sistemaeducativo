import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_session_token,
    digest_session_token,
    generate_temporary_password,
    hash_password,
    verify_password,
)
from app.modules.access.models.user import (
    PerfilDocente,
    PerfilEstudiante,
    SesionAutenticacion,
    UserRole,
    Usuario,
)
from app.modules.access.repositories.user_repository import UserRepository
from app.modules.access.schemas.user import UserCreate, UserUpdate
from app.modules.curriculum.models.entities import EstadoPlan, PlanEstudio
from app.modules.enrollments.models.entities import Inscripcion
from app.modules.periods.models.entities import AperturaPlan


def _ensure_role_specific_fields(payload: UserCreate | UserUpdate, role: UserRole) -> None:
    data = payload.model_dump(exclude_unset=True)
    if role != UserRole.DOCENTE and ("titulo" in data or "especialidad" in data):
        raise HTTPException(status_code=400, detail="Título y especialidad solo aplican a docentes")
    if role != UserRole.ESTUDIANTE and (
        "plan_estudio_id" in data or "apertura_plan_id" in data
    ):
        raise HTTPException(
            status_code=400, detail="Plan y grupo de ingreso solo aplican a estudiantes"
        )


def _validate_student_assignment(
    db: Session, plan_id: uuid.UUID | None, opening_id: uuid.UUID | None
) -> tuple[PlanEstudio | None, AperturaPlan | None]:
    if opening_id and not plan_id:
        raise HTTPException(status_code=400, detail="Debe seleccionar un plan para el grupo")
    plan = db.get(PlanEstudio, plan_id) if plan_id else None
    if plan_id and not plan:
        raise HTTPException(status_code=404, detail="Plan de estudio no encontrado")
    opening = db.get(AperturaPlan, opening_id) if opening_id else None
    if opening_id and not opening:
        raise HTTPException(status_code=404, detail="Grupo de inicio no encontrado")
    if opening and plan and opening.plan_id != plan.id:
        raise HTTPException(status_code=409, detail="El grupo no pertenece al plan seleccionado")
    if plan:
        if plan.estado == EstadoPlan.INACTIVO:
            raise HTTPException(
                status_code=409, detail="El plan está inactivo: no admite nuevas asignaciones"
            )
        if not plan.carrera.activo or not plan.carrera.facultad.activo:
            raise HTTPException(
                status_code=409,
                detail="La carrera o facultad del plan está inactiva: no admite asignaciones",
            )
    return plan, opening


def authenticate(db: Session, identifier: str, password: str) -> tuple[Usuario, str]:
    repository = UserRepository(db)
    user = repository.find_for_login(identifier)
    if not user or not verify_password(password, user.contrasena_hash) or not user.activo:
        raise HTTPException(status_code=401, detail="Credenciales inválidas o cuenta inactiva")

    raw_token = create_session_token()
    session = SesionAutenticacion(
        usuario_id=user.id,
        token_hash=digest_session_token(raw_token),
        fecha_expiracion=datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(session)
    db.commit()
    return user, raw_token


def revoke_session(db: Session, session: SesionAutenticacion) -> None:
    session.revocada_en = datetime.now(UTC)
    db.commit()


def change_password(db: Session, user: Usuario, current: str, new: str) -> None:
    if not verify_password(current, user.contrasena_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es válida")
    user.contrasena_hash = hash_password(new)
    user.debe_cambiar_contrasena = False
    UserRepository(db).revoke_sessions(user.id, datetime.now(UTC))
    db.commit()


def create_user(db: Session, payload: UserCreate) -> tuple[Usuario, str]:
    repository = UserRepository(db)
    email = str(payload.correo).strip().lower()
    ci = payload.ci.strip().upper()
    if repository.get_by_ci_or_email(ci, email):
        raise HTTPException(status_code=409, detail="El CI o correo ya está registrado")
    _ensure_role_specific_fields(payload, payload.rol)
    plan, opening = (None, None)
    if payload.rol == UserRole.ESTUDIANTE and (
        payload.plan_estudio_id or payload.apertura_plan_id
    ):
        plan, opening = _validate_student_assignment(
            db, payload.plan_estudio_id, payload.apertura_plan_id
        )

    temp_password = generate_temporary_password()
    user = Usuario(
        ci=ci,
        nombres=payload.nombres,
        apellidos=payload.apellidos,
        correo=email,
        telefono=payload.telefono,
        direccion=payload.direccion,
        fecha_nacimiento=payload.fecha_nacimiento,
        contrasena_hash=hash_password(temp_password),
        rol=payload.rol,
        debe_cambiar_contrasena=True,
    )
    if payload.rol == UserRole.DOCENTE:
        user.perfil_docente = PerfilDocente(
            titulo=payload.titulo, especialidad=payload.especialidad
        )
    elif payload.rol == UserRole.ESTUDIANTE:
        user.perfil_estudiante = PerfilEstudiante(
            plan_estudio_id=plan.id if plan else None,
            apertura_plan_id=opening.id if opening else None,
        )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El CI o correo ya está registrado") from exc
    db.refresh(user)
    return user, temp_password


def update_user(db: Session, user: Usuario, payload: UserUpdate) -> Usuario:
    data = payload.model_dump(exclude_unset=True)
    _ensure_role_specific_fields(payload, user.rol)
    profile_data = {
        key: data.pop(key)
        for key in ("titulo", "especialidad", "plan_estudio_id", "apertura_plan_id")
        if key in data
    }
    if "ci" in data and data["ci"] and data["ci"] != user.ci:
        existing = db.scalar(select(Usuario.id).where(Usuario.ci == data["ci"]))
        if existing:
            raise HTTPException(status_code=409, detail="El CI ya está registrado")
    if data.get("activo") is False and user.es_administrador_principal:
        raise HTTPException(status_code=403, detail="La cuenta principal no se puede inactivar")

    if profile_data:
        if user.rol == UserRole.DOCENTE:
            if not user.perfil_docente:
                user.perfil_docente = PerfilDocente()
            for key, value in profile_data.items():
                setattr(user.perfil_docente, key, value)
        elif user.rol == UserRole.ESTUDIANTE:
            profile = user.perfil_estudiante
            if not profile:
                raise HTTPException(status_code=404, detail="Perfil de estudiante no encontrado")
            next_plan = profile_data.get("plan_estudio_id", profile.plan_estudio_id)
            next_opening = profile_data.get("apertura_plan_id", profile.apertura_plan_id)
            changing = (
                next_plan != profile.plan_estudio_id
                or next_opening != profile.apertura_plan_id
            )
            if changing:
                enrollment = db.scalar(
                    select(Inscripcion.id).where(Inscripcion.estudiante_id == user.id).limit(1)
                )
                if enrollment is not None:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Este estudiante ya tiene inscripciones: cambia el plan o el grupo "
                            "desde la pantalla de Planes de estudio"
                        ),
                    )
                plan, opening = _validate_student_assignment(db, next_plan, next_opening)
                profile.plan_estudio_id = plan.id if plan else None
                profile.apertura_plan_id = opening.id if opening else None

    for key, value in data.items():
        setattr(user, key, value)
    if data.get("activo") is False:
        UserRepository(db).revoke_sessions(user.id, datetime.now(UTC))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El CI o correo ya está registrado") from exc
    db.refresh(user)
    return user


def reset_password(db: Session, user: Usuario) -> str:
    temp_password = generate_temporary_password()
    user.contrasena_hash = hash_password(temp_password)
    user.debe_cambiar_contrasena = True
    UserRepository(db).revoke_sessions(user.id, datetime.now(UTC))
    db.commit()
    return temp_password


def create_initial_principal(
    db: Session, ci: str, nombres: str, apellidos: str, email: str, telefono: str, password: str
) -> Usuario:
    repository = UserRepository(db)
    if repository.has_principal():
        raise ValueError("Ya existe un administrador principal; no se creó otra cuenta.")
    ci = ci.strip().upper()
    email = email.strip().lower()
    if repository.get_by_ci_or_email(ci, email):
        raise ValueError("El CI o correo ya pertenece a otra cuenta.")
    user = Usuario(
        ci=ci,
        nombres=nombres.strip(),
        apellidos=apellidos.strip(),
        correo=email,
        telefono=telefono.strip(),
        contrasena_hash=hash_password(password),
        rol=UserRole.ADMINISTRADOR,
        es_administrador_principal=True,
        activo=True,
        debe_cambiar_contrasena=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("El CI o correo ya pertenece a otra cuenta.") from exc
    db.refresh(user)
    return user
