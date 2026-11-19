import argparse
from getpass import getpass

from email_validator import EmailNotValidError, validate_email

from app.core.config import settings
from app.db.session import SessionLocal
from app.modules.access.services.access_service import create_initial_principal


def create_principal() -> int:
    print("Configuración inicial del administrador principal")
    if settings.initial_admin_password:
        ci = settings.initial_admin_ci.strip()
        nombres = settings.initial_admin_nombres.strip()
        apellidos = settings.initial_admin_apellidos.strip()
        correo = settings.initial_admin_correo.strip()
        telefono = settings.initial_admin_telefono.strip()
        password = settings.initial_admin_password
        confirmation = password
        print(f"Cuenta configurada desde .env: {ci}")
    else:
        print("Configura INITIAL_ADMIN_PASSWORD en .env o ingresa los datos manualmente.")
        ci = input("CI: ").strip()
        nombres = input("Nombres: ").strip()
        apellidos = input("Apellidos: ").strip()
        correo = input("Correo: ").strip()
        telefono = input("Teléfono: ").strip()
        password = getpass("Contraseña (8–128 caracteres): ")
        confirmation = getpass("Confirmar contraseña: ")

    if not ci or not nombres or not apellidos or not telefono:
        print("Todos los campos son obligatorios.")
        return 2
    try:
        correo = validate_email(correo, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        print(f"Correo inválido: {exc}")
        return 2
    if not 8 <= len(password) <= 128:
        print("La contraseña debe tener entre 8 y 128 caracteres.")
        return 2
    if password != confirmation:
        print("Las contraseñas no coinciden.")
        return 2

    with SessionLocal() as db:
        try:
            user = create_initial_principal(db, ci, nombres, apellidos, correo, telefono, password)
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
