from datetime import UTC, datetime
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import digest_session_token
from app.db.session import get_db
from app.modules.access.models.user import SesionAutenticacion, UserRole, Usuario

DbSession = Annotated[Session, Depends(get_db)]


async def current_session(
    db: DbSession,
    token: Annotated[str | None, Cookie(alias=settings.session_cookie_name)] = None,
) -> tuple[Usuario, SesionAutenticacion]:
    if not token:
        raise HTTPException(status_code=401, detail="Autenticación requerida")
    session = db.scalar(
        select(SesionAutenticacion).where(
            SesionAutenticacion.token_hash == digest_session_token(token)
        )
    )
    now = datetime.now(UTC)
    if not session or session.revocada_en is not None or not session.usuario.activo:
        raise HTTPException(status_code=401, detail="La sesión no es válida")
    if session.fecha_expiracion.tzinfo is None:
        session.fecha_expiracion = session.fecha_expiracion.replace(tzinfo=UTC)
    if session.fecha_expiracion <= now:
        raise HTTPException(status_code=401, detail="La sesión no es válida")
    return session.usuario, session


SessionPair = Annotated[tuple[Usuario, SesionAutenticacion], Depends(current_session)]


async def current_user(session_pair: SessionPair) -> Usuario:
    user, _ = session_pair
    return user


async def user_with_full_access(session_pair: SessionPair) -> Usuario:
    user, _ = session_pair
    if user.debe_cambiar_contrasena:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debe cambiar su contraseña antes de continuar",
        )
    return user


def require_roles(*roles: UserRole):
    async def dependency(user: Annotated[Usuario, Depends(user_with_full_access)]) -> Usuario:
        if user.rol not in roles:
            raise HTTPException(status_code=403, detail="No tiene permisos para esta operación")
        return user

    return dependency
