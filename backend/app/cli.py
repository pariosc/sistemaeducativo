import argparse
from getpass import getpass
from importlib import import_module

from pydantic import ValidationError
from sqlalchemy.orm import configure_mappers

from app.core.config import settings
from app.db.session import SessionLocal
from app.modules.access.repositories.user_repository import UserRepository
from app.modules.access.schemas.user import InitialAdminInput
from app.modules.access.services.access_service import create_initial_principal


def _validation_message(exc: ValidationError) -> str:
    return exc.errors()[0]["msg"].removeprefix("Value error, ")


def create_principal() -> int:
    import_module("app.modules.curriculum.models.entities")
    configure_mappers()
    print("Configuración inicial del administrador principal")
    if settings.initial_admin_password:
        ci = settings.initial_admin_ci
        nombres = settings.initial_admin_nombres
        apellidos = settings.initial_admin_apellidos
        correo = settings.initial_admin_correo
        telefono = settings.initial_admin_telefono
        password = settings.initial_admin_password
        confirmation = password
        print(f"Cuenta configurada desde .env: {ci.strip().upper()}")
    else:
        print("Configura INITIAL_ADMIN_PASSWORD en .env o ingresa los datos manualmente.")
        ci = input("CI: ")
        nombres = input("Nombres: ")
        apellidos = input("Apellidos: ")
        correo = input("Correo: ")
        telefono = input("Teléfono: ")
        password = getpass("Contraseña (8–128 caracteres): ")
        confirmation = getpass("Confirmar contraseña: ")

    if password != confirmation:
        print("Las contraseñas no coinciden.")
        return 2

    try:
        data = InitialAdminInput.model_validate(
            {
                "ci": ci,
                "nombres": nombres,
                "apellidos": apellidos,
                "correo": correo,
                "telefono": telefono,
                "contrasena": password,
            }
        )
    except ValidationError as exc:
        print(f"Datos del administrador inválidos: {_validation_message(exc)}")
        return 2

    with SessionLocal() as db:
        if UserRepository(db).has_principal():
            print("Ya existe un administrador principal; no se creó otra cuenta.")
            return 0
        try:
            user = create_initial_principal(
                db,
                data.ci,
                data.nombres,
                data.apellidos,
                data.correo,
                data.telefono,
                data.contrasena,
            )
        except ValueError as exc:
            print(str(exc))
            return 2
    print(f"Administrador principal creado: {user.correo}")
    print("La contraseña se mantiene en .env y no se imprime en la terminal.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Herramientas de instalación académica")
    parser.add_argument("command", choices=["create-principal"])
    args = parser.parse_args()
    if args.command == "create-principal":
        return create_principal()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
