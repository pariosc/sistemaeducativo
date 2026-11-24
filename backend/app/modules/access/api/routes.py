from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.deps import (
    DbSession,
    current_session,
    current_user,
    require_roles,
    user_with_full_access,
)
from app.core.config import settings
from app.modules.access.models.user import SesionAutenticacion, UserRole, Usuario
from app.modules.access.repositories.user_repository import UserRepository
from app.modules.access.schemas.user import (
    LoginInput,
    LoginOutput,
    PasswordChangeInput,
    PasswordResetOutput,
    ProfileUpdate,
    UserCreate,
    UserCreated,
    UserPublic,
    UserUpdate,
)
from app.modules.access.services import access_service

router = APIRouter(prefix="/api/v1", tags=["acceso y usuarios"])


def is_admin_manager(actor: Usuario, target: Usuario) -> bool:
    if actor.id == target.id:
        return False
    if target.rol == UserRole.ADMINISTRADOR:
        return actor.es_administrador_principal
    return actor.rol == UserRole.ADMINISTRADOR


@router.post("/auth/login", response_model=LoginOutput)
async def login(payload: LoginInput, response: Response, db: DbSession):
    user, raw_token = access_service.authenticate(db, payload.identificador, payload.contrasena)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api/v1",
    )
    return LoginOutput(usuario=user, debe_cambiar_contrasena=user.debe_cambiar_contrasena)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    pair: Annotated[tuple[Usuario, SesionAutenticacion], Depends(current_session)],
    db: DbSession,
):
    _, session = pair
    access_service.revoke_session(db, session)
    response.delete_cookie(settings.session_cookie_name, path="/api/v1", samesite="lax")


@router.get("/auth/me", response_model=LoginOutput)
async def read_me(user: Annotated[Usuario, Depends(current_user)]):
    return LoginOutput(usuario=user, debe_cambiar_contrasena=user.debe_cambiar_contrasena)


@router.post("/auth/change-password", response_model=UserPublic)
async def change_my_password(
    payload: PasswordChangeInput, user: Annotated[Usuario, Depends(current_user)], db: DbSession
):
    access_service.change_password(db, user, payload.contrasena_actual, payload.contrasena_nueva)
    return user


@router.get("/profile/me", response_model=UserPublic)
async def read_profile(user: Annotated[Usuario, Depends(user_with_full_access)]):
    return user


@router.patch("/profile/me", response_model=UserPublic)
async def update_profile(
    payload: ProfileUpdate,
    user: Annotated[Usuario, Depends(user_with_full_access)],
    db: DbSession,
):
    if user.rol != UserRole.ADMINISTRADOR:
        raise HTTPException(
            status_code=403,
            detail=(
                "Los datos personales de docentes y estudiantes solo pueden corregirse "
                "desde administración"
            ),
        )
    user.telefono = payload.telefono
    db.commit()
    db.refresh(user)
    return user


@router.get("/admin/users", response_model=list[UserPublic])
async def list_users(
    actor: Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))], db: DbSession
):
    return UserRepository(db).list_visible(actor.es_administrador_principal)


@router.post("/admin/users", response_model=UserCreated, status_code=status.HTTP_201_CREATED)
async def add_user(
    payload: UserCreate,
    actor: Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))],
    db: DbSession,
):
    if payload.rol == UserRole.ADMINISTRADOR and not actor.es_administrador_principal:
        raise HTTPException(
            status_code=403, detail="Solo el administrador principal puede crear administradores"
        )
    user, temporary_password = access_service.create_user(db, payload)
    public_data = UserPublic.model_validate(user).model_dump()
    public_data["contrasena_temporal"] = temporary_password
    return UserCreated.model_validate(public_data)


@router.patch("/admin/users/{user_id}", response_model=UserPublic)
async def edit_user(
    user_id: UUID,
    payload: UserUpdate,
    actor: Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))],
    db: DbSession,
):
    target = UserRepository(db).get(user_id)
    if not target or not is_admin_manager(actor, target):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return access_service.update_user(db, target, payload)


@router.post("/admin/users/{user_id}/reset-password", response_model=PasswordResetOutput)
async def reset_user_password(
    user_id: UUID,
    actor: Annotated[Usuario, Depends(require_roles(UserRole.ADMINISTRADOR))],
    db: DbSession,
):
    target = UserRepository(db).get(user_id)
    if not target or not is_admin_manager(actor, target):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return PasswordResetOutput(contrasena_temporal=access_service.reset_password(db, target))
