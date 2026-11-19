import pytest

pytestmark = pytest.mark.anyio
ORIGIN = {"Origin": "http://localhost:5173"}


async def sign_in(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "principal@example.edu", "contrasena": "SeguraPassphrase2026!"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200


async def create_career(client, code="SIS"):
    faculties = (await client.get("/api/v1/admin/faculties")).json()
    if not faculties:
        created_faculty = await client.post(
            "/api/v1/admin/faculties",
            json={"codigo": "TEC", "nombre": "Facultad de Tecnología"},
            headers=ORIGIN,
        )
        assert created_faculty.status_code == 201
        faculties = [created_faculty.json()]
    response = await client.post(
        "/api/v1/admin/careers",
        json={"codigo": code, "nombre": f"Carrera {code}", "facultad_id": faculties[0]["id"]},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_plan(client, career_id, code="PLAN-SIS"):
    response = await client.post(
        "/api/v1/admin/plans",
        json={"carrera_id": career_id, "codigo": code, "modalidad": "SEMESTRAL"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_career_lifecycle_and_restrictions(client, origin_headers):
    await sign_in(client)
    faculty = await client.post(
        "/api/v1/admin/faculties",
        json={"codigo": "TEC", "nombre": "Tecnología"},
        headers=origin_headers,
    )
    assert faculty.status_code == 201
    assert (
        await client.delete(
            f"/api/v1/admin/faculties/{faculty.json()['id']}", headers=origin_headers
        )
    ).status_code == 204
    faculty = await client.post(
        "/api/v1/admin/faculties",
        json={"codigo": "TEC", "nombre": "Tecnología"},
        headers=origin_headers,
    )
    assert faculty.status_code == 201
    created = await client.post(
        "/api/v1/admin/careers",
        json={
            "codigo": "sis",
            "nombre": "Ingeniería de Sistemas",
            "facultad_id": faculty.json()["id"],
        },
        headers=origin_headers,
    )
    assert created.status_code == 201
    career = created.json()
    assert career["codigo"] == "SIS"
    assert career["facultad_id"] == faculty.json()["id"]
    assert career["activo"] is True

    duplicate = await client.post(
        "/api/v1/admin/careers",
        json={"codigo": "SIS", "nombre": "Duplicada", "facultad_id": faculty.json()["id"]},
        headers=origin_headers,
    )
    assert duplicate.status_code == 409

    updated = await client.patch(
        f"/api/v1/admin/careers/{career['id']}",
        json={"nombre": "Sistemas"},
        headers=origin_headers,
    )
    assert updated.status_code == 200
    inactive = await client.patch(
        f"/api/v1/admin/careers/{career['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert inactive.status_code == 200
    assert inactive.json()["activo"] is False

    listed = await client.get("/api/v1/admin/careers")
    assert any(row["id"] == career["id"] and not row["activo"] for row in listed.json())
    assert (
        await client.delete(
            f"/api/v1/admin/faculties/{faculty.json()['id']}", headers=origin_headers
        )
    ).status_code == 409
    deleted = await client.delete(f"/api/v1/admin/careers/{career['id']}", headers=origin_headers)
    assert deleted.status_code == 204
    assert (
        await client.delete(
            f"/api/v1/admin/faculties/{faculty.json()['id']}", headers=origin_headers
        )
    ).status_code == 204


async def test_subject_lifecycle_and_delete_only_when_unreferenced(client, origin_headers):
    await sign_in(client)
    career = await create_career(client)
    plan = await create_plan(client, career["id"])
    unit = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units",
        json={"numero": 1, "nombre": "Semestre 1"},
        headers=origin_headers,
    )
    assert unit.status_code == 201

    subject = await client.post(
        "/api/v1/admin/subjects",
        json={"codigo": "prog1", "nombre": "Programación I"},
        headers=origin_headers,
    )
    assert subject.status_code == 201
    subject_data = subject.json()
    assert subject_data["codigo"] == "PROG1"
    duplicate = await client.post(
        "/api/v1/admin/subjects",
        json={"codigo": "PROG1", "nombre": "Duplicada"},
        headers=origin_headers,
    )
    assert duplicate.status_code == 409

    updated = await client.patch(
        f"/api/v1/admin/subjects/{subject_data['id']}",
        json={"nombre": "Programación Básica"},
        headers=origin_headers,
    )
    assert updated.status_code == 200
    inactive = await client.patch(
        f"/api/v1/admin/subjects/{subject_data['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert inactive.status_code == 200 and inactive.json()["activo"] is False
    reactivated = await client.patch(
        f"/api/v1/admin/subjects/{subject_data['id']}",
        json={"activo": True},
        headers=origin_headers,
    )
    assert reactivated.status_code == 200 and reactivated.json()["activo"] is True

    linked = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects",
        json={"materia_id": subject_data["id"], "unidad_id": unit.json()["id"]},
        headers=origin_headers,
    )
    assert linked.status_code == 201
    subject_plan_id = linked.json()["unidades"][0]["materias"][0]["id"]
    assert (
        await client.delete(f"/api/v1/admin/subjects/{subject_data['id']}", headers=origin_headers)
    ).status_code == 409
    assert (
        await client.delete(
            f"/api/v1/admin/plans/{plan['id']}/subjects/{subject_plan_id}",
            headers=origin_headers,
        )
    ).status_code == 200
    assert (
        await client.delete(f"/api/v1/admin/subjects/{subject_data['id']}", headers=origin_headers)
    ).status_code == 204


async def test_plan_units_subjects_prerequisites_and_published_structure(client, origin_headers):
    await sign_in(client)
    career = await create_career(client)
    plan = await create_plan(client, career["id"])
    other_career = await create_career(client, "ADM")
    duplicate_code = await client.post(
        "/api/v1/admin/plans",
        json={"carrera_id": other_career["id"], "codigo": plan["codigo"], "modalidad": "MODULAR"},
        headers=origin_headers,
    )
    assert duplicate_code.status_code == 409

    unit1 = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units",
        json={"numero": 1, "nombre": "Semestre 1"},
        headers=origin_headers,
    )
    unit2 = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units",
        json={"numero": 2, "nombre": "Semestre 2"},
        headers=origin_headers,
    )
    assert unit1.status_code == unit2.status_code == 201
    duplicate_unit = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units",
        json={"numero": 1, "nombre": "Repetido"},
        headers=origin_headers,
    )
    assert duplicate_unit.status_code == 409

    subjects = []
    entries = []
    for code in ("MAT1", "MAT2"):
        response = await client.post(
            "/api/v1/admin/subjects",
            json={"codigo": code, "nombre": f"Materia {code}"},
            headers=origin_headers,
        )
        assert response.status_code == 201
        subjects.append(response.json())
    for index, subject in enumerate(subjects):
        response = await client.post(
            f"/api/v1/admin/plans/{plan['id']}/subjects",
            json={
                "materia_id": subject["id"],
                "unidad_id": unit1.json()["id"],
            },
            headers=origin_headers,
        )
        assert response.status_code == 201
        entries.append(response.json()["unidades"][0]["materias"][index])

    duplicate_subject = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects",
        json={"materia_id": subjects[0]["id"], "unidad_id": unit1.json()["id"]},
        headers=origin_headers,
    )
    assert duplicate_subject.status_code == 409
    wrong_unit = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects",
        json={"materia_id": subjects[0]["id"], "unidad_id": "00000000-0000-0000-0000-000000000000"},
        headers=origin_headers,
    )
    assert wrong_unit.status_code == 422

    moved = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}/subjects/{entries[0]['id']}",
        json={"unidad_id": unit2.json()["id"]},
        headers=origin_headers,
    )
    assert moved.status_code == 200
    blocked_unit_delete = await client.delete(
        f"/api/v1/admin/plans/{plan['id']}/units/{unit1.json()['id']}",
        headers=origin_headers,
    )
    assert blocked_unit_delete.status_code == 409

    prerequisite = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects/{entries[1]['id']}/prerequisites",
        json={"requisito_materia_plan_id": entries[0]["id"]},
        headers=origin_headers,
    )
    assert prerequisite.status_code == 201
    cycle = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects/{entries[0]['id']}/prerequisites",
        json={"requisito_materia_plan_id": entries[1]["id"]},
        headers=origin_headers,
    )
    assert cycle.status_code == 409
    removed = await client.delete(
        f"/api/v1/admin/plans/{plan['id']}/subjects/{entries[1]['id']}/prerequisites/{entries[0]['id']}",
        headers=origin_headers,
    )
    assert removed.status_code == 200

    career_delete = await client.delete(
        f"/api/v1/admin/careers/{career['id']}", headers=origin_headers
    )
    assert career_delete.status_code == 409
    published = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"estado": "VIGENTE"},
        headers=origin_headers,
    )
    assert published.status_code == 200
    structural_change = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units",
        json={"numero": 3, "nombre": "Semestre 3"},
        headers=origin_headers,
    )
    assert structural_change.status_code == 409
    code_change = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"codigo": "PLAN-NUEVO"},
        headers=origin_headers,
    )
    assert code_change.status_code == 409


async def test_student_plan_assignment_and_listing(client, origin_headers):
    await sign_in(client)
    career = await create_career(client)
    plan = await create_plan(client, career["id"])
    student = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "7788991",
            "nombres": "Estudiante",
            "apellidos": "Prueba",
            "correo": "plan.student@example.edu",
            "telefono": "70000008",
            "rol": "ESTUDIANTE",
        },
        headers=origin_headers,
    )
    assert student.status_code == 201
    student_id = student.json()["id"]

    assigned = await client.put(
        f"/api/v1/admin/students/{student_id}/plan",
        json={"plan_estudio_id": plan["id"]},
        headers=origin_headers,
    )
    assert assigned.status_code == 200
    assert assigned.json()["plan_estudio_id"] == plan["id"]
    listed = await client.get("/api/v1/admin/students/plan-assignments")
    assert any(
        row["usuario_id"] == student_id and row["plan_codigo"] == plan["codigo"]
        for row in listed.json()
    )
