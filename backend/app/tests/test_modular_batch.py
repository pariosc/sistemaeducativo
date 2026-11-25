import pytest

pytestmark = pytest.mark.anyio
ORIGIN = {"Origin": "http://localhost:5173"}


async def test_modular_batch_previews_cross_career_conflicts_and_saves_atomically(client):
    logged = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "principal@example.edu", "contrasena": "SeguraPassphrase2026!"},
        headers=ORIGIN,
    )
    assert logged.status_code == 200
    faculty_response = await client.post(
        "/api/v1/admin/faculties",
        json={"codigo": "BATCH", "nombre": "Facultad conjunta"},
        headers=ORIGIN,
    )
    assert faculty_response.status_code == 201, faculty_response.text
    faculty_id = faculty_response.json()["id"]
    period_response = await client.post(
        "/api/v1/admin/periods",
        json={
            "denominacion": "2027-I conjunto",
            "fecha_inicio": "2027-02-01",
            "fecha_fin": "2027-02-28",
        },
        headers=ORIGIN,
    )
    assert period_response.status_code == 201, period_response.text
    period_id = period_response.json()["id"]

    plans = []
    for number in (1, 2):
        career = await client.post(
            "/api/v1/admin/careers",
            json={
                "codigo": f"CB{number}",
                "nombre": f"Carrera {number}",
                "facultad_id": faculty_id,
            },
            headers=ORIGIN,
        )
        assert career.status_code == 201, career.text
        plan = await client.post(
            "/api/v1/admin/plans",
            json={
                "carrera_id": career.json()["id"],
                "codigo": f"BATCH-{number}",
                "modalidad": "MODULAR",
            },
            headers=ORIGIN,
        )
        assert plan.status_code == 201, plan.text
        unit = await client.post(
            f"/api/v1/admin/plans/{plan.json()['id']}/units",
            json={"numero": 1, "nombre": "Semestre 1"},
            headers=ORIGIN,
        )
        assert unit.status_code == 201, unit.text
        subject = await client.post(
            "/api/v1/admin/subjects",
            json={"codigo": f"BS{number}", "nombre": f"Materia conjunta {number}"},
            headers=ORIGIN,
        )
        assert subject.status_code == 201, subject.text
        entry = await client.post(
            f"/api/v1/admin/plans/{plan.json()['id']}/subjects",
            json={"materia_id": subject.json()["id"], "unidad_id": unit.json()["id"]},
            headers=ORIGIN,
        )
        assert entry.status_code == 201, entry.text
        published = await client.patch(
            f"/api/v1/admin/plans/{plan.json()['id']}",
            json={"estado": "VIGENTE"},
            headers=ORIGIN,
        )
        assert published.status_code == 200, published.text
        for suffix, body in (
            ("careers", {"carrera_id": career.json()["id"]}),
            ("plans", {"plan_id": plan.json()["id"]}),
        ):
            attached = await client.post(
                f"/api/v1/admin/periods/{period_id}/{suffix}", json=body, headers=ORIGIN
            )
            assert attached.status_code == 200, attached.text
        opening = await client.post(
            f"/api/v1/admin/periods/{period_id}/openings",
            json={"plan_id": plan.json()["id"]},
            headers=ORIGIN,
        )
        assert opening.status_code == 201, opening.text
        plans.append(
            (
                plan.json()["id"],
                entry.json()["unidades"][0]["materias"][0]["id"],
                opening.json()["id"],
            )
        )

    teacher_ids = []
    for number in (1, 2):
        teacher = await client.post(
            "/api/v1/admin/users",
            json={
                "ci": f"T-BATCH-{number}",
                "nombres": "Docente Uno" if number == 1 else "Docente Dos",
                "apellidos": "Conjunto",
                "correo": f"teacher.batch{number}@example.edu",
                "telefono": f"7000003{number}",
                "rol": "DOCENTE",
            },
            headers=ORIGIN,
        )
        assert teacher.status_code == 201, teacher.text
        teacher_ids.append(teacher.json()["id"])
        room = await client.post(
            "/api/v1/admin/planning/rooms",
            json={"codigo": f"B{number}01", "capacidad": 30},
            headers=ORIGIN,
        )
        assert room.status_code == 201, room.text
    shift = await client.post(
        "/api/v1/admin/planning/schedule-blocks",
        json={
            "turno": "MANANA",
            "nombre": "Mañana conjunta",
            "hora_inicio": "08:00",
            "hora_fin": "11:00",
            "predeterminado_modular": True,
        },
        headers=ORIGIN,
    )
    assert shift.status_code == 201, shift.text
    template = await client.post(
        "/api/v1/admin/planning/modular-templates",
        json={"nombre": "Plantilla conjunta", "clases_por_modulo": 3, "minutos_por_clase": 180},
        headers=ORIGIN,
    )
    assert template.status_code == 201, template.text
    assignment = await client.put(
        f"/api/v1/admin/periods/{period_id}/planning/modular-template",
        json={"plantilla_modular_id": template.json()["id"]},
        headers=ORIGIN,
    )
    assert assignment.status_code == 200, assignment.text

    def sequence(number, teacher_id, room, classes=3):
        plan_id, subject_id, opening_id = plans[number - 1]
        return {
            "plan_id": plan_id,
            "apertura_plan_id": opening_id,
            "turno": "MANANA",
            "fecha_inicio": "2027-02-01",
            "materias": [
                {
                    "materia_plan_id": subject_id,
                    "paralelo": "A",
                    "cupo": 20,
                    "docente_id": teacher_id,
                    "aula": room,
                    "clases": classes,
                }
            ],
        }

    preview_url = f"/api/v1/admin/periods/{period_id}/modular/batch/preview"
    save_url = f"/api/v1/admin/periods/{period_id}/modular/batch/courses"
    teacher_conflict = {
        "secuencias": [
            sequence(1, teacher_ids[0], "B101"),
            sequence(2, teacher_ids[0], "B201"),
        ]
    }
    assert (
        await client.post(preview_url, json=teacher_conflict, headers=ORIGIN)
    ).status_code == 409
    assert (await client.post(save_url, json=teacher_conflict, headers=ORIGIN)).status_code == 409
    assert (await client.get("/api/v1/courses")).json() == []

    room_conflict = {
        "secuencias": [
            sequence(1, teacher_ids[0], "B101"),
            sequence(2, teacher_ids[1], "B101"),
        ]
    }
    assert (await client.post(preview_url, json=room_conflict, headers=ORIGIN)).status_code == 409
    assert (await client.get("/api/v1/courses")).json() == []

    too_long = {
        "secuencias": [
            sequence(1, teacher_ids[0], "B101"),
            sequence(2, teacher_ids[1], "B201", 30),
        ]
    }
    outside = await client.post(preview_url, json=too_long, headers=ORIGIN)
    assert outside.status_code == 200, outside.text
    assert outside.json()["cabe_en_semestre"] is False
    assert (await client.post(save_url, json=too_long, headers=ORIGIN)).status_code == 422
    assert (await client.get("/api/v1/courses")).json() == []

    valid = {
        "secuencias": [
            sequence(1, teacher_ids[0], "B101"),
            sequence(2, teacher_ids[1], "B201"),
        ]
    }
    preview = await client.post(preview_url, json=valid, headers=ORIGIN)
    assert preview.status_code == 200, preview.text
    assert preview.json()["cabe_en_semestre"] is True
    assert len(preview.json()["secuencias"]) == 2
    assert all(
        len(item["materias"][0]["fechas_clase"]) == 3 for item in preview.json()["secuencias"]
    )
    assert (await client.get("/api/v1/courses")).json() == []
    created = await client.post(save_url, json=valid, headers=ORIGIN)
    assert created.status_code == 201, created.text
    assert len(created.json()) == 2
    assert {item["plan_id"] for item in created.json()} == {plan_id for plan_id, _, _ in plans}
    assert all(item["clases_programadas"] == 3 for item in created.json())

    client.cookies.clear()
    assert (await client.post(preview_url, json=valid, headers=ORIGIN)).status_code == 401
