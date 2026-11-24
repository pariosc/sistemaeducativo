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


def unit_by_number(plan, number):
    return next(unit for unit in plan["unidades"] if unit["numero"] == number)


async def add_subject(client, plan_id, unit_id, subject_id, origin_headers):
    response = await client.post(
        f"/api/v1/admin/plans/{plan_id}/subjects",
        json={"materia_id": subject_id, "unidad_id": unit_id},
        headers=origin_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_faculty_and_career_inactivation_respect_dependencies(client, origin_headers):
    await sign_in(client)
    faculty = (
        await client.post(
            "/api/v1/admin/faculties",
            json={"codigo": "ING", "nombre": "Ingeniería"},
            headers=origin_headers,
        )
    ).json()
    career = (
        await client.post(
            "/api/v1/admin/careers",
            json={"codigo": "SIS", "nombre": "Sistemas", "facultad_id": faculty["id"]},
            headers=origin_headers,
        )
    ).json()

    blocked_faculty = await client.patch(
        f"/api/v1/admin/faculties/{faculty['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert blocked_faculty.status_code == 409

    deactivated_career = await client.patch(
        f"/api/v1/admin/careers/{career['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert deactivated_career.status_code == 200
    blocked_career_plan = await client.post(
        "/api/v1/admin/plans",
        json={"carrera_id": career["id"], "codigo": "SIS-2027", "modalidad": "SEMESTRAL"},
        headers=origin_headers,
    )
    assert blocked_career_plan.status_code == 409

    deactivated_faculty = await client.patch(
        f"/api/v1/admin/faculties/{faculty['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert deactivated_faculty.status_code == 200
    blocked_new_career = await client.post(
        "/api/v1/admin/careers",
        json={"codigo": "ADM", "nombre": "Administración", "facultad_id": faculty["id"]},
        headers=origin_headers,
    )
    assert blocked_new_career.status_code == 409


async def test_career_update_allows_keeping_inactive_faculty(client, origin_headers):
    await sign_in(client)
    source = (
        await client.post(
            "/api/v1/admin/faculties",
            json={"codigo": "F01", "nombre": "Facultad origen"},
            headers=origin_headers,
        )
    ).json()
    target = (
        await client.post(
            "/api/v1/admin/faculties",
            json={"codigo": "F02", "nombre": "Facultad destino"},
            headers=origin_headers,
        )
    ).json()
    career = (
        await client.post(
            "/api/v1/admin/careers",
            json={"codigo": "CAR", "nombre": "Carrera", "facultad_id": source["id"]},
            headers=origin_headers,
        )
    ).json()
    assert (
        await client.patch(
            f"/api/v1/admin/careers/{career['id']}",
            json={"activo": False},
            headers=origin_headers,
        )
    ).status_code == 200
    assert (
        await client.patch(
            f"/api/v1/admin/faculties/{source['id']}",
            json={"activo": False},
            headers=origin_headers,
        )
    ).status_code == 200

    renamed = await client.patch(
        f"/api/v1/admin/careers/{career['id']}",
        json={"nombre": "Carrera renombrada", "facultad_id": source["id"]},
        headers=origin_headers,
    )
    assert renamed.status_code == 200, renamed.text
    blocked_reactivation = await client.patch(
        f"/api/v1/admin/careers/{career['id']}",
        json={"activo": True},
        headers=origin_headers,
    )
    assert blocked_reactivation.status_code == 409
    moved = await client.patch(
        f"/api/v1/admin/careers/{career['id']}",
        json={"activo": True, "facultad_id": target["id"]},
        headers=origin_headers,
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["facultad_id"] == target["id"]


async def test_plan_publication_requires_structure_and_contiguous_semesters(
    client, origin_headers
):
    await sign_in(client)
    career = await create_career(client)
    plan = await create_plan(client, career["id"], "PLAN-ESTRUCTURA")

    empty = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"estado": "VIGENTE"},
        headers=origin_headers,
    )
    assert empty.status_code == 409
    assert "semestres" in empty.json()["detail"]

    first = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units",
        json={"numero": 1, "nombre": "Primer semestre"},
        headers=origin_headers,
    )
    third = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units",
        json={"numero": 3, "nombre": "Tercer semestre"},
        headers=origin_headers,
    )
    assert first.status_code == third.status_code == 201
    subject = (
        await client.post(
            "/api/v1/admin/subjects",
            json={"codigo": "EST1", "nombre": "Materia de estructura"},
            headers=origin_headers,
        )
    ).json()
    plan_data = await add_subject(
        client, plan["id"], first.json()["id"], subject["id"], origin_headers
    )
    assert plan_data["total_semestres"] == 2
    assert plan_data["total_materias"] == 1
    assert plan_data["puede_publicarse"] is False
    assert any(item["codigo"] == "semestres_no_consecutivos" for item in plan_data["diagnosticos"])

    blocked = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"estado": "VIGENTE"},
        headers=origin_headers,
    )
    assert blocked.status_code == 409
    assert "1, 2, 3" in blocked.json()["detail"]

    renumbered = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units/renumber",
        headers=origin_headers,
    )
    assert renumbered.status_code == 200
    assert [unit["numero"] for unit in renumbered.json()["unidades"]] == [1, 2]
    assert renumbered.json()["puede_publicarse"] is False
    assert any(
        item["codigo"] == "semestre_vacio" for item in renumbered.json()["diagnosticos"]
    )
    empty_semester = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"estado": "VIGENTE"},
        headers=origin_headers,
    )
    assert empty_semester.status_code == 409
    assert "vacío" in empty_semester.json()["detail"] or "sin materias" in empty_semester.json()["detail"]

    second_subject = (
        await client.post(
            "/api/v1/admin/subjects",
            json={"codigo": "EST2", "nombre": "Materia del segundo semestre"},
            headers=origin_headers,
        )
    ).json()
    completed = await add_subject(
        client,
        plan["id"],
        unit_by_number(renumbered.json(), 2)["id"],
        second_subject["id"],
        origin_headers,
    )
    assert completed["puede_publicarse"] is True
    published = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"estado": "VIGENTE"},
        headers=origin_headers,
    )
    assert published.status_code == 200, published.text


async def test_plan_generation_duplication_and_bulk_subjects(client, origin_headers):
    await sign_in(client)
    career = await create_career(client)
    plan = await create_plan(client, career["id"], "PLAN-BASE")
    generated = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/units/generate",
        json={"cantidad": 2, "nombre_base": "Semestre"},
        headers=origin_headers,
    )
    assert generated.status_code == 200
    assert [unit["numero"] for unit in generated.json()["unidades"]] == [1, 2]
    first_unit = unit_by_number(generated.json(), 1)

    subjects = []
    for code in ("BUL1", "BUL2", "BUL3"):
        response = await client.post(
            "/api/v1/admin/subjects",
            json={"codigo": code, "nombre": f"Materia {code}"},
            headers=origin_headers,
        )
        assert response.status_code == 201
        subjects.append(response.json())

    bulk = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects/bulk",
        json={"materia_ids": [subjects[0]["id"], subjects[1]["id"]], "unidad_id": first_unit["id"]},
        headers=origin_headers,
    )
    assert bulk.status_code == 201, bulk.text
    assert bulk.json()["total_materias"] == 2
    repeated = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects/bulk",
        json={"materia_ids": [subjects[1]["id"], subjects[2]["id"]], "unidad_id": first_unit["id"]},
        headers=origin_headers,
    )
    assert repeated.status_code == 409
    assert "BUL2" in repeated.json()["detail"]

    assert (
        await client.patch(
            f"/api/v1/admin/subjects/{subjects[2]['id']}",
            json={"activo": False},
            headers=origin_headers,
        )
    ).status_code == 200
    inactive = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects/bulk",
        json={"materia_ids": [subjects[2]["id"]], "unidad_id": first_unit["id"]},
        headers=origin_headers,
    )
    assert inactive.status_code == 409
    assert "BUL3" in inactive.json()["detail"]

    entries = unit_by_number(bulk.json(), 1)["materias"]
    requirement = next(entry for entry in entries if entry["codigo"] == "BUL1")
    dependent = next(entry for entry in entries if entry["codigo"] == "BUL2")
    prerequisite = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects/{dependent['id']}/prerequisites",
        json={"requisito_materia_plan_id": requirement["id"]},
        headers=origin_headers,
    )
    assert prerequisite.status_code == 201

    duplicate = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/duplicate",
        json={"codigo": "PLAN-COPIA"},
        headers=origin_headers,
    )
    assert duplicate.status_code == 201, duplicate.text
    clone = duplicate.json()
    assert clone["estado"] == "BORRADOR"
    assert clone["total_semestres"] == 2
    assert clone["total_materias"] == 2
    copied_entries = unit_by_number(clone, 1)["materias"]
    copied_dependent = next(entry for entry in copied_entries if entry["codigo"] == "BUL2")
    copied_requirement = next(entry for entry in copied_entries if entry["codigo"] == "BUL1")
    assert copied_dependent["prerrequisitos"] == [copied_requirement["id"]]
    repeated_clone = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/duplicate",
        json={"codigo": "PLAN-COPIA"},
        headers=origin_headers,
    )
    assert repeated_clone.status_code == 409


async def test_subject_inactivation_is_blocked_by_vigente_plan(client, origin_headers):
    await sign_in(client)
    career = await create_career(client)
    plan = await create_plan(client, career["id"], "PLAN-VIGENTE")
    unit = (
        await client.post(
            f"/api/v1/admin/plans/{plan['id']}/units",
            json={"numero": 1, "nombre": "Semestre 1"},
            headers=origin_headers,
        )
    ).json()
    subject = (
        await client.post(
            "/api/v1/admin/subjects",
            json={"codigo": "ACT1", "nombre": "Materia activa"},
            headers=origin_headers,
        )
    ).json()
    plan_data = await add_subject(client, plan["id"], unit["id"], subject["id"], origin_headers)
    assert plan_data["puede_publicarse"] is True
    assert (
        await client.patch(
            f"/api/v1/admin/plans/{plan['id']}",
            json={"estado": "VIGENTE"},
            headers=origin_headers,
        )
    ).status_code == 200

    blocked = await client.patch(
        f"/api/v1/admin/subjects/{subject['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert blocked.status_code == 409
    assert "vigente" in blocked.json()["detail"]
    listed = (await client.get("/api/v1/admin/subjects")).json()
    assert next(row for row in listed if row["id"] == subject["id"])[
        "planes_vigentes_count"
    ] == 1

    assert (
        await client.patch(
            f"/api/v1/admin/plans/{plan['id']}",
            json={"estado": "INACTIVO"},
            headers=origin_headers,
        )
    ).status_code == 200
    deactivated = await client.patch(
        f"/api/v1/admin/subjects/{subject['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["planes_vigentes_count"] == 0


async def test_plan_assignment_rejects_inactive_plan(client, origin_headers):
    await sign_in(client)
    career = await create_career(client)
    plan = await create_plan(client, career["id"], "PLAN-INACTIVO")
    student = (
        await client.post(
            "/api/v1/admin/users",
            json={
                "ci": "5566778",
                "nombres": "Estudiante",
                "apellidos": "Inactivo",
                "correo": "inactive.plan@example.edu",
                "telefono": "70000009",
                "rol": "ESTUDIANTE",
            },
            headers=origin_headers,
        )
    ).json()
    assert (
        await client.patch(
            f"/api/v1/admin/plans/{plan['id']}",
            json={"estado": "INACTIVO"},
            headers=origin_headers,
        )
    ).status_code == 200
    assigned = await client.put(
        f"/api/v1/admin/students/{student['id']}/plan",
        json={"plan_estudio_id": plan["id"]},
        headers=origin_headers,
    )
    assert assigned.status_code == 409
    assert "inactivo" in assigned.json()["detail"]

