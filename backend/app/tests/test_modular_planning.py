import pytest

pytestmark = pytest.mark.anyio
ORIGIN = {"Origin": "http://localhost:5173"}


async def test_existing_shift_can_become_modular_default(client):
    logged = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "principal@example.edu", "contrasena": "SeguraPassphrase2026!"},
        headers=ORIGIN,
    )
    assert logged.status_code == 200
    first = await client.post(
        "/api/v1/admin/planning/schedule-blocks",
        json={
            "turno": "MANANA",
            "nombre": "Mañana A",
            "hora_inicio": "08:00",
            "hora_fin": "11:00",
            "predeterminado_modular": True,
        },
        headers=ORIGIN,
    )
    second = await client.post(
        "/api/v1/admin/planning/schedule-blocks",
        json={"turno": "MANANA", "nombre": "Mañana B", "hora_inicio": "09:00", "hora_fin": "12:00"},
        headers=ORIGIN,
    )
    assert first.status_code == 201 and second.status_code == 201
    promoted = await client.patch(
        f"/api/v1/admin/planning/schedule-blocks/{second.json()['id']}",
        json={"predeterminado_modular": True},
        headers=ORIGIN,
    )
    assert promoted.status_code == 200, promoted.text
    blocks = (await client.get("/api/v1/admin/planning/schedule-blocks", headers=ORIGIN)).json()
    assert [(block["nombre"], block["predeterminado_modular"]) for block in blocks] == [
        ("Mañana A", False),
        ("Mañana B", True),
    ]


async def test_modular_sequence_uses_template_holidays_and_period_limit(client):
    logged = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "principal@example.edu", "contrasena": "SeguraPassphrase2026!"},
        headers=ORIGIN,
    )
    assert logged.status_code == 200
    faculty = (
        await client.post(
            "/api/v1/admin/faculties",
            json={"codigo": "MOD", "nombre": "Facultad modular"},
            headers=ORIGIN,
        )
    ).json()
    career = (
        await client.post(
            "/api/v1/admin/careers",
            json={
                "codigo": "CMOD",
                "nombre": "Carrera modular",
                "facultad_id": faculty["id"],
            },
            headers=ORIGIN,
        )
    ).json()
    plan = (
        await client.post(
            "/api/v1/admin/plans",
            json={"carrera_id": career["id"], "codigo": "MOD-2027", "modalidad": "MODULAR"},
            headers=ORIGIN,
        )
    ).json()
    unit = (
        await client.post(
            f"/api/v1/admin/plans/{plan['id']}/units",
            json={"numero": 1, "nombre": "Semestre 1"},
            headers=ORIGIN,
        )
    ).json()
    entries = []
    for number in range(1, 4):
        subject = (
            await client.post(
                "/api/v1/admin/subjects",
                json={"codigo": f"MOD{number}", "nombre": f"Materia {number}"},
                headers=ORIGIN,
            )
        ).json()
        updated = await client.post(
            f"/api/v1/admin/plans/{plan['id']}/subjects",
            json={"materia_id": subject["id"], "unidad_id": unit["id"]},
            headers=ORIGIN,
        )
        assert updated.status_code == 201, updated.text
        entries.append(updated.json()["unidades"][0]["materias"][-1]["id"])
    second_unit = (
        await client.post(
            f"/api/v1/admin/plans/{plan['id']}/units",
            json={"numero": 2, "nombre": "Semestre 2"},
            headers=ORIGIN,
        )
    ).json()
    future_subject = (
        await client.post(
            "/api/v1/admin/subjects",
            json={"codigo": "MOD4", "nombre": "Materia futura"},
            headers=ORIGIN,
        )
    ).json()
    future_plan = await client.post(
        f"/api/v1/admin/plans/{plan['id']}/subjects",
        json={"materia_id": future_subject["id"], "unidad_id": second_unit["id"]},
        headers=ORIGIN,
    )
    assert future_plan.status_code == 201
    future_entry = future_plan.json()["unidades"][1]["materias"][0]["id"]
    published = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}", json={"estado": "VIGENTE"}, headers=ORIGIN
    )
    assert published.status_code == 200, published.text

    period = (
        await client.post(
            "/api/v1/admin/periods",
            json={
                "denominacion": "2027-I modular",
                "fecha_inicio": "2027-02-01",
                "fecha_fin": "2027-03-31",
            },
            headers=ORIGIN,
        )
    ).json()
    for suffix, body in (
        ("careers", {"carrera_id": career["id"]}),
        ("plans", {"plan_id": plan["id"]}),
    ):
        response = await client.post(
            f"/api/v1/admin/periods/{period['id']}/{suffix}", json=body, headers=ORIGIN
        )
        assert response.status_code == 200, response.text
    opening_response = await client.post(
        f"/api/v1/admin/periods/{period['id']}/openings",
        json={"plan_id": plan["id"]},
        headers=ORIGIN,
    )
    assert opening_response.status_code == 201, opening_response.text
    opening = opening_response.json()
    teacher = (
        await client.post(
            "/api/v1/admin/users",
            json={
                "ci": "T-MOD-1",
                "nombres": "Docente",
                "apellidos": "Modular",
                "correo": "teacher.modular@example.edu",
                "telefono": "70000022",
                "rol": "DOCENTE",
            },
            headers=ORIGIN,
        )
    ).json()
    room = await client.post(
        "/api/v1/admin/planning/rooms", json={"codigo": "201", "capacidad": 40}, headers=ORIGIN
    )
    assert room.status_code == 201
    shift = await client.post(
        "/api/v1/admin/planning/schedule-blocks",
        json={
            "turno": "MANANA",
            "nombre": "Mañana modular",
            "hora_inicio": "08:00",
            "hora_fin": "11:00",
            "predeterminado_modular": True,
        },
        headers=ORIGIN,
    )
    assert shift.status_code == 201, shift.text
    template = await client.post(
        "/api/v1/admin/planning/modular-templates",
        json={"nombre": "Sistema modular 2027", "clases_por_modulo": 21, "minutos_por_clase": 180},
        headers=ORIGIN,
    )
    assert template.status_code == 201, template.text
    assignment = await client.put(
        f"/api/v1/admin/periods/{period['id']}/planning/modular-template",
        json={"plantilla_modular_id": template.json()["id"]},
        headers=ORIGIN,
    )
    assert assignment.status_code == 200, assignment.text
    holiday = await client.post(
        f"/api/v1/admin/periods/{period['id']}/holidays",
        json={"fecha": "2027-02-03", "descripcion": "Feriado"},
        headers=ORIGIN,
    )
    assert holiday.status_code == 201, holiday.text

    direct_course = await client.post(
        "/api/v1/admin/courses",
        json={
            "materia_plan_id": entries[0],
            "periodo_id": period["id"],
            "paralelo": "B",
            "cupo": 20,
            "fecha_inicio": "2027-02-01",
            "fecha_fin": "2027-02-28",
            "docente_id": teacher["id"],
        },
        headers=ORIGIN,
    )
    assert direct_course.status_code == 409

    def payload(count):
        return {
            "plan_id": plan["id"],
            "apertura_plan_id": opening["id"],
            "turno": "MANANA",
            "fecha_inicio": "2027-02-01",
            "materias": [
                {
                    "materia_plan_id": entry,
                    "paralelo": "A",
                    "cupo": 20,
                    "docente_id": teacher["id"],
                    "aula": "201",
                }
                for entry in entries[:count]
            ],
        }

    reduced_room = await client.patch(
        "/api/v1/admin/planning/rooms/201", json={"capacidad": 15}, headers=ORIGIN
    )
    assert reduced_room.status_code == 200, reduced_room.text
    too_many_seats = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/preview",
        json=payload(1),
        headers=ORIGIN,
    )
    assert too_many_seats.status_code == 409
    restored_room = await client.patch(
        "/api/v1/admin/planning/rooms/201", json={"capacidad": 40}, headers=ORIGIN
    )
    assert restored_room.status_code == 200, restored_room.text

    future_payload = payload(1)
    future_payload["materias"][0]["materia_plan_id"] = future_entry
    future_preview = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/preview",
        json=future_payload,
        headers=ORIGIN,
    )
    assert future_preview.status_code == 409
    assert "semestre futuro" in future_preview.json()["detail"]

    preview = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/preview",
        json=payload(2),
        headers=ORIGIN,
    )
    assert preview.status_code == 200, preview.text
    proposed = preview.json()
    assert proposed["cabe_en_semestre"] is True
    assert proposed["fin_estimado"] == "2027-03-31"
    assert all(len(item["fechas_clase"]) == 21 for item in proposed["materias"])
    assert "2027-02-03" not in proposed["materias"][0]["fechas_clase"]
    assert proposed["materias"][0]["fecha_fin"] < proposed["materias"][1]["fecha_inicio"]
    assert (await client.get("/api/v1/courses")).json() == []

    too_long = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/preview",
        json=payload(3),
        headers=ORIGIN,
    )
    assert too_long.status_code == 200, too_long.text
    assert too_long.json()["cabe_en_semestre"] is False
    rejected = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/courses",
        json=payload(3),
        headers=ORIGIN,
    )
    assert rejected.status_code == 422
    assert (await client.get("/api/v1/courses")).json() == []

    created = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/courses",
        json=payload(2),
        headers=ORIGIN,
    )
    assert created.status_code == 201, created.text
    assert len(created.json()) == 2
    assert all(course["clases_programadas"] == 21 for course in created.json())
    overlapping_subject = payload(1)
    overlapping_subject["materias"][0]["materia_plan_id"] = entries[2]
    overlap = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/preview",
        json=overlapping_subject,
        headers=ORIGIN,
    )
    assert overlap.status_code == 409
    assert "grupo y turno" in overlap.json()["detail"]
    assert "MOD1" in overlap.json()["detail"]
    assert "MOD3" in overlap.json()["detail"]
    assert "2027-02-01" in overlap.json()["detail"]

    second_teacher = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "T-MOD-2",
            "nombres": "Segundo",
            "apellidos": "Modular",
            "correo": "teacher.modular2@example.edu",
            "telefono": "70000023",
            "rol": "DOCENTE",
        },
        headers=ORIGIN,
    )
    assert second_teacher.status_code == 201
    second_room = await client.post(
        "/api/v1/admin/planning/rooms",
        json={"codigo": "202", "capacidad": 40},
        headers=ORIGIN,
    )
    assert second_room.status_code == 201
    parallel_b = payload(2)
    parallel_b["materias"].reverse()
    for subject in parallel_b["materias"]:
        subject.update({"paralelo": "B", "docente_id": second_teacher.json()["id"]})
    occupied_room = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/preview",
        json=parallel_b,
        headers=ORIGIN,
    )
    assert occupied_room.status_code == 409
    assert "aula 201" in occupied_room.json()["detail"]
    assert "MOD1" in occupied_room.json()["detail"]
    for subject in parallel_b["materias"]:
        subject["aula"] = "202"
    second_preview = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/preview",
        json=parallel_b,
        headers=ORIGIN,
    )
    assert second_preview.status_code == 200, second_preview.text
    second_created = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/courses",
        json=parallel_b,
        headers=ORIGIN,
    )
    assert second_created.status_code == 201, second_created.text
    assert [course["paralelo"] for course in second_created.json()] == ["B", "B"]
    assert [course["materia_plan_id"] for course in second_created.json()] == [
        entries[1],
        entries[0],
    ]
    assert second_created.json()[0]["fecha_inicio"] == created.json()[0]["fecha_inicio"]

    third_room = await client.post(
        "/api/v1/admin/planning/rooms",
        json={"codigo": "203", "capacidad": 40},
        headers=ORIGIN,
    )
    assert third_room.status_code == 201
    parallel_c = payload(1)
    parallel_c["materias"][0].update({"paralelo": "C", "docente_id": None, "aula": "203"})
    pending_teacher = await client.post(
        f"/api/v1/admin/periods/{period['id']}/modular/courses",
        json=parallel_c,
        headers=ORIGIN,
    )
    assert pending_teacher.status_code == 201, pending_teacher.text
    assert pending_teacher.json()[0]["docente_id"] is None
    assert pending_teacher.json()[0]["inscripcion_abierta"] is False
    blocked_opening = await client.patch(
        f"/api/v1/admin/courses/{pending_teacher.json()[0]['id']}/registration",
        json={"inscripcion_abierta": True},
        headers=ORIGIN,
    )
    assert blocked_opening.status_code == 409

    changed_holiday = await client.post(
        f"/api/v1/admin/periods/{period['id']}/holidays",
        json={"fecha": "2027-02-10", "descripcion": "Feriado adicional"},
        headers=ORIGIN,
    )
    assert changed_holiday.status_code == 201, changed_holiday.text
    updated_courses = (await client.get("/api/v1/courses")).json()
    assert sorted(course["clases_programadas"] for course in updated_courses) == [
        20,
        20,
        20,
        21,
        21,
    ]

    immutable = await client.patch(
        f"/api/v1/admin/planning/modular-templates/{template.json()['id']}",
        json={"clases_por_modulo": 20},
        headers=ORIGIN,
    )
    assert immutable.status_code == 409
