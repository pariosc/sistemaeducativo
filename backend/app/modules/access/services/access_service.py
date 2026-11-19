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

    temp_password = generate_temporary_password()
    user = Usuario(
        ci=ci,
        nombres=payload.nombres,
        apellidos=payload.apellidos,
        correo=email,
        telefono=payload.telefono,
        contrasena_hash=hash_password(temp_password),
        rol=payload.rol,
        debe_cambiar_contrasena=True,
    )
    if payload.rol == UserRole.DOCENTE:
        user.perfil_docente = PerfilDocente()
    elif payload.rol == UserRole.ESTUDIANTE:
        user.perfil_estudiante = PerfilEstudiante()
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
    if "ci" in data and data["ci"] and data["ci"] != user.ci:
        existing = db.scalar(select(Usuario.id).where(Usuario.ci == data["ci"]))
        if existing:
            raise HTTPException(status_code=409, detail="El CI ya está registrado")
    if data.get("activo") is False and user.es_administrador_principal:
        raise HTTPException(status_code=403, detail="La cuenta principal no se puede inactivar")
    for key, value in data.items():
        setattr(user, key, value)
    if data.get("activo") is False:
        UserRepository(db).revoke_sessions(user.id, datetime.now(UTC))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El CI ya está registrado") from exc
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
