import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.modules.access.services.access_service import create_initial_principal

pytestmark = pytest.mark.anyio


async def sign_in(client, identifier="principal@example.edu", password="SeguraPassphrase2026!"):
    return await client.post(
        "/api/v1/auth/login",
        json={"identificador": identifier, "contrasena": password},
        headers={"Origin": "http://localhost:5173"},
    )


async def test_login_with_email_and_ci_and_logout_revokes_session(client, origin_headers):
    response = await sign_in(client)
    assert response.status_code == 200
    assert response.json()["usuario"]["es_administrador_principal"] is True
    assert response.cookies.get("academico_session")

    client.cookies.clear()
    ci_login = await sign_in(client, "1234567")
    assert ci_login.status_code == 200
    assert ci_login.headers["set-cookie"].startswith("academico_session=")
    assert "httponly" in ci_login.headers["set-cookie"].lower()

    logout = await client.post("/api/v1/auth/logout", headers=origin_headers)
    assert logout.status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_invalid_and_inactive_accounts_cannot_sign_in(client, origin_headers):
    assert (await sign_in(client, "nobody@example.edu", "BadPassword123!")).status_code == 401
    assert (await sign_in(client, "principal@example.edu", "wrong")).status_code == 401
    await sign_in(client)
    created = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "7654321",
            "nombres": "Ana",
            "apellidos": "Docente",
            "correo": "ana@example.edu",
            "telefono": "70000001",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    account = created.json()
    disabled = await client.patch(
        f"/api/v1/admin/users/{account['id']}", json={"activo": False}, headers=origin_headers
    )
    assert disabled.status_code == 200
    client.cookies.clear()
    assert (
        await sign_in(client, "ana@example.edu", account["contrasena_temporal"])
    ).status_code == 401


async def test_duplicate_email_or_ci_is_rejected(client, origin_headers):
    await sign_in(client)
    body = {
        "ci": "7654321",
        "nombres": "Ana",
        "apellidos": "Docente",
        "correo": "ana@example.edu",
        "telefono": "70000001",
        "rol": "DOCENTE",
    }
    first = await client.post("/api/v1/admin/users", json=body, headers=origin_headers)
    assert first.status_code == 201
    duplicate_email = {**body, "ci": "1112223", "correo": "ANA@example.edu"}
    assert (
        await client.post("/api/v1/admin/users", json=duplicate_email, headers=origin_headers)
    ).status_code == 409
    duplicate_ci = {**body, "correo": "other@example.edu"}
    assert (
        await client.post("/api/v1/admin/users", json=duplicate_ci, headers=origin_headers)
    ).status_code == 409


async def test_reset_password_revokes_old_sessions_and_forces_change(client, origin_headers):
    await sign_in(client)
    created = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "7654321",
            "nombres": "Ana",
            "apellidos": "Docente",
            "correo": "ana@example.edu",
            "telefono": "70000001",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    account = created.json()
    old_password = account["contrasena_temporal"]

    client.cookies.clear()
    await sign_in(client, "ana@example.edu", old_password)
    assert (await client.get("/api/v1/auth/me")).status_code == 200
    client.cookies.clear()
    await sign_in(client)
    reset = await client.post(
        f"/api/v1/admin/users/{account['id']}/reset-password", headers=origin_headers
    )
    assert reset.status_code == 200
    new_password = reset.json()["contrasena_temporal"]
    assert new_password != old_password
    client.cookies.clear()
    assert (await sign_in(client, "ana@example.edu", old_password)).status_code == 401
    client.cookies.clear()
    fresh_login = await sign_in(client, "ana@example.edu", new_password)
    assert fresh_login.status_code == 200
    assert fresh_login.json()["debe_cambiar_contrasena"] is True


async def test_change_temporary_password_blocks_other_operations_and_revokes_session(
    client, origin_headers
):
    await sign_in(client)
    created = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "7654321",
            "nombres": "Ana",
            "apellidos": "Docente",
            "correo": "ana@example.edu",
            "telefono": "70000001",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    temporary = created.json()["contrasena_temporal"]

    client.cookies.clear()
    login = await sign_in(client, "ana@example.edu", temporary)
    assert login.json()["debe_cambiar_contrasena"] is True
    assert (await client.get("/api/v1/profile/me")).status_code == 403
    changed = await client.post(
        "/api/v1/auth/change-password",
        json={"contrasena_actual": temporary, "contrasena_nueva": "NuevaClaveLarga2026!"},
        headers=origin_headers,
    )
    assert changed.status_code == 200
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    client.cookies.clear()
    assert (await sign_in(client, "7654321", "NuevaClaveLarga2026!")).status_code == 200


async def test_common_admin_cannot_create_or_view_administrators(client, origin_headers):
    await sign_in(client)
    creation = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "2468101",
            "nombres": "Luis",
            "apellidos": "Admin",
            "correo": "luis@example.edu",
            "telefono": "70000002",
            "rol": "ADMINISTRADOR",
        },
        headers=origin_headers,
    )
    common_password = creation.json()["contrasena_temporal"]
    client.cookies.clear()
    await sign_in(client, "luis@example.edu", common_password)
    await client.post(
        "/api/v1/auth/change-password",
        json={"contrasena_actual": common_password, "contrasena_nueva": "OtraClaveLarga2026!"},
        headers=origin_headers,
    )
    client.cookies.clear()
    await sign_in(client, "luis@example.edu", "OtraClaveLarga2026!")

    forbidden = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "1112223",
            "nombres": "Otro",
            "apellidos": "Admin",
            "correo": "otro@example.edu",
            "telefono": "70000003",
            "rol": "ADMINISTRADOR",
        },
        headers=origin_headers,
    )
    assert forbidden.status_code == 403
    visible = await client.get("/api/v1/admin/users")
    assert all(user["rol"] != "ADMINISTRADOR" for user in visible.json())


async def test_student_profile_is_read_only_and_admin_can_update_own_phone(client, origin_headers):
    await sign_in(client)
    created = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "8887776",
            "nombres": "Elena",
            "apellidos": "Estudiante",
            "correo": "elena@example.edu",
            "telefono": "70000004",
            "rol": "ESTUDIANTE",
        },
        headers=origin_headers,
    )
    temp_password = created.json()["contrasena_temporal"]
    client.cookies.clear()
    await sign_in(client, "elena@example.edu", temp_password)
    await client.post(
        "/api/v1/auth/change-password",
        json={"contrasena_actual": temp_password, "contrasena_nueva": "OtraClaveLarga2026!"},
        headers=origin_headers,
    )
    client.cookies.clear()
    await sign_in(client, "elena@example.edu", "OtraClaveLarga2026!")
    profile = await client.get("/api/v1/profile/me")
    assert profile.status_code == 200
    assert profile.json()["correo"] == "elena@example.edu"
    updated = await client.patch(
        "/api/v1/profile/me",
        json={"telefono": "71112222", "ci": "9999999"},
        headers=origin_headers,
    )
    assert updated.status_code == 403
    assert (await client.get("/api/v1/profile/me")).json()["telefono"] == "70000004"
    assert (await client.get("/api/v1/admin/users")).status_code == 403

    client.cookies.clear()
    await sign_in(client)
    admin_update = await client.patch(
        "/api/v1/profile/me", json={"telefono": "71112222"}, headers=origin_headers
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["telefono"] == "71112222"

    teacher = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "8887775",
            "nombres": "Carlos",
            "apellidos": "Docente",
            "correo": "carlos@example.edu",
            "telefono": "70000007",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    teacher_account = teacher.json()
    client.cookies.clear()
    await sign_in(client, "carlos@example.edu", teacher_account["contrasena_temporal"])
    await client.post(
        "/api/v1/auth/change-password",
        json={
            "contrasena_actual": teacher_account["contrasena_temporal"],
            "contrasena_nueva": "ClaveDocenteNueva2026!",
        },
        headers=origin_headers,
    )
    client.cookies.clear()
    await sign_in(client, "carlos@example.edu", "ClaveDocenteNueva2026!")
    teacher_update = await client.patch(
        "/api/v1/profile/me", json={"telefono": "71112223"}, headers=origin_headers
    )
    assert teacher_update.status_code == 403


async def test_admin_can_correct_user_identity_without_duplicate_ci(client, origin_headers):
    await sign_in(client)
    created = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "1111111",
            "nombres": "Ana",
            "apellidos": "Inicial",
            "correo": "ana.identity@example.edu",
            "telefono": "70000005",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    assert created.status_code == 201
    target = created.json()
    other = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "2222222",
            "nombres": "Eva",
            "apellidos": "Otra",
            "correo": "eva.identity@example.edu",
            "telefono": "70000006",
            "rol": "ESTUDIANTE",
        },
        headers=origin_headers,
    )
    assert other.status_code == 201

    updated = await client.patch(
        f"/api/v1/admin/users/{target['id']}",
        json={
            "ci": "3333333",
            "nombres": "Ana María",
            "apellidos": "Actualizada",
            "telefono": "71112224",
        },
        headers=origin_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["ci"] == "3333333"
    assert updated.json()["nombres"] == "Ana María"
    assert updated.json()["telefono"] == "71112224"
    duplicate_ci = await client.patch(
        f"/api/v1/admin/users/{target['id']}",
        json={"ci": other.json()["ci"]},
        headers=origin_headers,
    )
    assert duplicate_ci.status_code == 409


async def test_wrong_origin_is_rejected(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "principal@example.edu", "contrasena": "SeguraPassphrase2026!"},
        headers={"Origin": "https://other.example"},
    )
    assert response.status_code == 403


async def test_installation_allows_only_one_initial_principal():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            principal = create_initial_principal(
                db,
                "PRINCIPAL-1",
                "Principal",
                "Inicial",
                "principal.once@example.edu",
                "70000031",
                "PrincipalPassphrase2026!",
            )
            assert principal.es_administrador_principal is True
            assert principal.debe_cambiar_contrasena is True
            with pytest.raises(ValueError, match="Ya existe un administrador principal"):
                create_initial_principal(
                    db,
                    "PRINCIPAL-2",
                    "Segundo",
                    "Principal",
                    "principal.second@example.edu",
                    "70000032",
                    "AnotherPassphrase2026!",
                )
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
