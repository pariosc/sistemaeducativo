import pytest

pytestmark = pytest.mark.anyio
ORIGIN = {"Origin": "http://localhost:5173"}


async def admin_login(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "principal@example.edu", "contrasena": "SeguraPassphrase2026!"},
        headers=ORIGIN,
    )
    assert response.status_code == 200


async def create_course_context(client, schedule=True):
    faculty = await client.post(
        "/api/v1/admin/faculties", json={"codigo": "TEC", "nombre": "Tecnología"}, headers=ORIGIN
    )
    career = await client.post(
        "/api/v1/admin/careers",
        json={"codigo": "ING", "nombre": "Ingeniería", "facultad_id": faculty.json()["id"]},
        headers=ORIGIN,
    )
    assert career.status_code == 201
    plan = await client.post(
        "/api/v1/admin/plans",
        json={"carrera_id": career.json()["id"], "codigo": "PLAN-ING", "modalidad": "SEMESTRAL"},
        headers=ORIGIN,
    )
    assert plan.status_code == 201
    unit = await client.post(
        f"/api/v1/admin/plans/{plan.json()['id']}/units",
        json={"numero": 1, "nombre": "Semestre 1"},
        headers=ORIGIN,
    )
    assert unit.status_code == 201
    subject = await client.post(
        "/api/v1/admin/subjects",
        json={"codigo": "MAT1", "nombre": "Matemática I"},
        headers=ORIGIN,
    )
    assert subject.status_code == 201
    entry = await client.post(
        f"/api/v1/admin/plans/{plan.json()['id']}/subjects",
        json={"materia_id": subject.json()["id"], "unidad_id": unit.json()["id"]},
        headers=ORIGIN,
    )
    assert entry.status_code == 201
    published = await client.patch(
        f"/api/v1/admin/plans/{plan.json()['id']}",
        json={"estado": "VIGENTE"},
        headers=ORIGIN,
    )
    assert published.status_code == 200

    period = await client.post(
        "/api/v1/admin/periods",
        json={
            "denominacion": "Periodo de prueba",
            "fecha_inicio": "2026-12-01",
            "fecha_fin": "2026-12-31",
        },
        headers=ORIGIN,
    )
    assert period.status_code == 201
    selected_career = await client.post(
        f"/api/v1/admin/periods/{period.json()['id']}/careers",
        json={"carrera_id": career.json()["id"]},
        headers=ORIGIN,
    )
    assert selected_career.status_code == 200, selected_career.text
    selected_plan = await client.post(
        f"/api/v1/admin/periods/{period.json()['id']}/plans",
        json={"plan_id": plan.json()["id"]},
        headers=ORIGIN,
    )
    assert selected_plan.status_code == 200, selected_plan.text
    teacher = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "T-10001",
            "nombres": "Docente",
            "apellidos": "Prueba",
            "correo": "teacher.parallel@example.edu",
            "telefono": "70000011",
            "rol": "DOCENTE",
        },
        headers=ORIGIN,
    )
    assert teacher.status_code == 201

    course = await client.post(
        "/api/v1/admin/courses",
        json={
            "materia_plan_id": entry.json()["unidades"][0]["materias"][0]["id"],
            "periodo_id": period.json()["id"],
            "paralelo": "A",
            "cupo": 20,
            "fecha_inicio": "2026-12-07",
            "fecha_fin": "2026-12-31",
            "docente_id": teacher.json()["id"],
        },
        headers=ORIGIN,
    )
    assert course.status_code == 201, course.text
    if schedule:
        scheduled = await client.put(
            f"/api/v1/admin/courses/{course.json()['id']}/schedules",
            json={
                "horarios": [{"dia_semana": "LUNES", "hora_inicio": "08:00", "hora_fin": "10:00"}]
            },
            headers=ORIGIN,
        )
        assert scheduled.status_code == 200, scheduled.text
        course_data = scheduled.json()
    else:
        course_data = course.json()
    return {
        "career": career.json(),
        "plan": plan.json(),
        "unit": unit.json(),
        "subject": subject.json(),
        "entry": entry.json()["unidades"][0]["materias"][0],
        "period": period.json(),
        "teacher": teacher.json(),
        "course": course_data,
    }


async def assert_report_download(client, code, output_format, **filters):
    response = await client.get(
        f"/api/v1/reports/{code}/export",
        params={"format": output_format, **filters},
    )
    assert response.status_code == 200, response.text
    if output_format == "pdf":
        assert response.headers["content-type"].startswith("application/pdf")
        assert response.content.startswith(b"%PDF")
    else:
        assert response.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert response.content.startswith(b"PK\x03\x04")


async def assert_report_preview(client, code, **filters):
    response = await client.get(f"/api/v1/reports/{code}/preview", params=filters)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    body = response.json()
    assert body["code"] == code
    assert body["row_count"] == len(body["rows"])
    assert body["headers"]
    return body


async def test_period_dates_and_course_must_fit_period(client, origin_headers):
    await admin_login(client)
    invalid_period = await client.post(
        "/api/v1/admin/periods",
        json={
            "denominacion": "Fechas inválidas",
            "fecha_inicio": "2026-12-31",
            "fecha_fin": "2026-12-01",
        },
        headers=origin_headers,
    )
    assert invalid_period.status_code == 422

    context = await create_course_context(client, schedule=False)
    outside = await client.post(
        "/api/v1/admin/courses",
        json={
            "materia_plan_id": context["entry"]["id"],
            "periodo_id": context["period"]["id"],
            "paralelo": "B",
            "cupo": 10,
            "fecha_inicio": "2026-11-30",
            "fecha_fin": "2026-12-31",
            "docente_id": context["teacher"]["id"],
        },
        headers=origin_headers,
    )
    assert outside.status_code == 422


async def test_planning_room_catalog_and_real_date_conflicts(client, origin_headers):
    await admin_login(client)
    room = await client.post(
        "/api/v1/admin/planning/rooms", json={"codigo": "101"}, headers=origin_headers
    )
    assert room.status_code == 201, room.text
    block = await client.post(
        "/api/v1/admin/planning/schedule-blocks",
        json={"turno": "MANANA", "nombre": "Bloque 1", "hora_inicio": "08:00", "hora_fin": "10:00"},
        headers=origin_headers,
    )
    assert block.status_code == 201, block.text

    context = await create_course_context(client)
    first = await client.put(
        f"/api/v1/admin/courses/{context['course']['id']}/schedules",
        json={
            "horarios": [
                {"dia_semana": "LUNES", "hora_inicio": "08:00", "hora_fin": "10:00", "aula": "101"}
            ]
        },
        headers=origin_headers,
    )
    assert first.status_code == 200, first.text

    teacher = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "T-10002",
            "nombres": "Otra",
            "apellidos": "Docente",
            "correo": "teacher.parallel2@example.edu",
            "telefono": "70000012",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    assert teacher.status_code == 201, teacher.text
    second = await client.post(
        "/api/v1/admin/courses",
        json={
            "materia_plan_id": context["entry"]["id"],
            "periodo_id": context["period"]["id"],
            "paralelo": "B",
            "cupo": 20,
            "fecha_inicio": "2026-12-07",
            "fecha_fin": "2026-12-31",
            "docente_id": teacher.json()["id"],
        },
        headers=origin_headers,
    )
    assert second.status_code == 201, second.text
    preview = await client.post(
        f"/api/v1/admin/courses/{second.json()['id']}/schedules/validate",
        json={
            "horarios": [
                {
                    "dia_semana": "LUNES",
                    "hora_inicio": "09:00",
                    "hora_fin": "11:00",
                    "aula": "101",
                }
            ]
        },
        headers=origin_headers,
    )
    assert preview.status_code == 409
    assert "aula 101" in preview.json()["detail"]
    touching = await client.post(
        f"/api/v1/admin/courses/{second.json()['id']}/schedules/validate",
        json={
            "horarios": [
                {
                    "dia_semana": "LUNES",
                    "hora_inicio": "10:00",
                    "hora_fin": "12:00",
                    "aula": "101",
                }
            ]
        },
        headers=origin_headers,
    )
    assert touching.status_code == 200, touching.text
    conflict = await client.put(
        f"/api/v1/admin/courses/{second.json()['id']}/schedules",
        json={
            "horarios": [
                {"dia_semana": "LUNES", "hora_inicio": "09:00", "hora_fin": "11:00", "aula": "101"}
            ]
        },
        headers=origin_headers,
    )
    assert conflict.status_code == 409
    assert "aula 101" in conflict.json()["detail"]

    first_dates = await client.patch(
        f"/api/v1/admin/courses/{context['course']['id']}",
        json={"fecha_fin": "2026-12-07"},
        headers=origin_headers,
    )
    assert first_dates.status_code == 200, first_dates.text
    second_dates = await client.patch(
        f"/api/v1/admin/courses/{second.json()['id']}",
        json={"fecha_inicio": "2026-12-08"},
        headers=origin_headers,
    )
    assert second_dates.status_code == 200, second_dates.text
    different_modular_blocks = await client.post(
        f"/api/v1/admin/courses/{second.json()['id']}/schedules/validate",
        json={
            "horarios": [
                {
                    "dia_semana": "LUNES",
                    "hora_inicio": "09:00",
                    "hora_fin": "11:00",
                    "aula": "101",
                }
            ]
        },
        headers=origin_headers,
    )
    assert different_modular_blocks.status_code == 200, different_modular_blocks.text


async def test_planning_resource_catalog_validation_and_role_access(client, origin_headers):
    unauthenticated = await client.get("/api/v1/admin/planning/rooms", headers=origin_headers)
    assert unauthenticated.status_code == 401
    await admin_login(client)

    room = await client.post(
        "/api/v1/admin/planning/rooms", json={"codigo": "a-101"}, headers=origin_headers
    )
    assert room.status_code == 201, room.text
    assert room.json() == {"codigo": "A-101", "activa": True}
    listed_rooms = await client.get("/api/v1/admin/planning/rooms", headers=origin_headers)
    assert listed_rooms.status_code == 200
    assert any(item["codigo"] == "A-101" for item in listed_rooms.json())
    duplicate_room = await client.post(
        "/api/v1/admin/planning/rooms", json={"codigo": "A-101"}, headers=origin_headers
    )
    assert duplicate_room.status_code == 409
    inactive_room = await client.patch(
        "/api/v1/admin/planning/rooms/A-101", json={"activa": False}, headers=origin_headers
    )
    assert inactive_room.status_code == 200 and inactive_room.json()["activa"] is False

    context = await create_course_context(client, schedule=False)
    inactive_room_schedule = await client.put(
        f"/api/v1/admin/courses/{context['course']['id']}/schedules",
        json={
            "horarios": [
                {
                    "dia_semana": "LUNES",
                    "hora_inicio": "08:00",
                    "hora_fin": "10:00",
                    "aula": "A-101",
                }
            ]
        },
        headers=origin_headers,
    )
    assert inactive_room_schedule.status_code == 422
    await client.patch(
        "/api/v1/admin/planning/rooms/A-101", json={"activa": True}, headers=origin_headers
    )
    valid_preview = await client.post(
        f"/api/v1/admin/courses/{context['course']['id']}/schedules/validate",
        json={
            "horarios": [
                {
                    "dia_semana": "MARTES",
                    "hora_inicio": "08:00",
                    "hora_fin": "10:00",
                    "aula": "A-101",
                }
            ]
        },
        headers=origin_headers,
    )
    assert valid_preview.status_code == 200, valid_preview.text
    listed_courses = await client.get("/api/v1/courses", headers=origin_headers)
    course_after_preview = next(
        item for item in listed_courses.json() if item["id"] == context["course"]["id"]
    )
    assert course_after_preview["horarios"] == []

    block_payload = {
        "turno": "MANANA",
        "nombre": "Bloque 1",
        "hora_inicio": "08:00",
        "hora_fin": "10:00",
    }
    block = await client.post(
        "/api/v1/admin/planning/schedule-blocks", json=block_payload, headers=origin_headers
    )
    assert block.status_code == 201, block.text
    duplicate_block = await client.post(
        "/api/v1/admin/planning/schedule-blocks", json=block_payload, headers=origin_headers
    )
    assert duplicate_block.status_code == 409
    invalid_block = await client.post(
        "/api/v1/admin/planning/schedule-blocks",
        json={**block_payload, "nombre": "Inválido", "hora_inicio": "11:00", "hora_fin": "10:00"},
        headers=origin_headers,
    )
    assert invalid_block.status_code == 422
    edited_block = await client.patch(
        f"/api/v1/admin/planning/schedule-blocks/{block.json()['id']}",
        json={"turno": "TARDE", "nombre": "Bloque 1", "hora_inicio": "14:00", "hora_fin": "16:00"},
        headers=origin_headers,
    )
    assert edited_block.status_code == 200, edited_block.text
    assert edited_block.json()["turno"] == "TARDE"
    assert edited_block.json()["hora_inicio"] == "14:00:00"
    disabled_block = await client.patch(
        f"/api/v1/admin/planning/schedule-blocks/{block.json()['id']}",
        json={"activo": False},
        headers=origin_headers,
    )
    assert disabled_block.status_code == 200
    assert disabled_block.json()["activo"] is False
    null_update = await client.patch(
        f"/api/v1/admin/planning/schedule-blocks/{block.json()['id']}",
        json={"nombre": None},
        headers=origin_headers,
    )
    assert null_update.status_code == 422

    teacher = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "T-10004",
            "nombres": "Acceso",
            "apellidos": "Limitado",
            "correo": "teacher.planning@example.edu",
            "telefono": "70000014",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    assert teacher.status_code == 201, teacher.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "T-10004", "contrasena": teacher.json()["contrasena_temporal"]},
        headers=origin_headers,
    )
    assert login.status_code == 200, login.text
    forbidden = await client.get("/api/v1/admin/planning/rooms", headers=origin_headers)
    assert forbidden.status_code == 403


async def test_configured_room_and_block_complete_course_schedule_flow(client, origin_headers):
    await admin_login(client)
    room = await client.post(
        "/api/v1/admin/planning/rooms", json={"codigo": "204"}, headers=origin_headers
    )
    assert room.status_code == 201, room.text
    block = await client.post(
        "/api/v1/admin/planning/schedule-blocks",
        json={
            "turno": "TARDE",
            "nombre": "Bloque 1",
            "hora_inicio": "14:00",
            "hora_fin": "16:00",
        },
        headers=origin_headers,
    )
    assert block.status_code == 201, block.text
    context = await create_course_context(client, schedule=False)
    course_id = context["course"]["id"]

    scheduled = await client.put(
        f"/api/v1/admin/courses/{course_id}/schedules",
        json={
            "horarios": [
                {
                    "dia_semana": "MIERCOLES",
                    "hora_inicio": block.json()["hora_inicio"],
                    "hora_fin": block.json()["hora_fin"],
                    "aula": room.json()["codigo"],
                }
            ]
        },
        headers=origin_headers,
    )
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["horarios"][0]["aula"] == "204"
    changed_template = await client.patch(
        f"/api/v1/admin/planning/schedule-blocks/{block.json()['id']}",
        json={"hora_inicio": "17:00", "hora_fin": "19:00"},
        headers=origin_headers,
    )
    assert changed_template.status_code == 200, changed_template.text
    course_after_template_edit = next(
        item
        for item in (await client.get("/api/v1/courses", headers=origin_headers)).json()
        if item["id"] == course_id
    )
    assert course_after_template_edit["horarios"][0]["hora_inicio"] == "14:00:00"

    opened = await client.patch(
        f"/api/v1/admin/courses/{course_id}/registration",
        json={"inscripcion_abierta": True},
        headers=origin_headers,
    )
    assert opened.status_code == 200, opened.text
    assert opened.json()["inscripcion_abierta"] is True


async def test_schedule_preview_applies_holidays_cancellations_and_reschedules(
    client, origin_headers
):
    await admin_login(client)
    room = await client.post(
        "/api/v1/admin/planning/rooms", json={"codigo": "101"}, headers=origin_headers
    )
    assert room.status_code == 201, room.text
    context = await create_course_context(client)
    first_id = context["course"]["id"]
    first_dates = await client.patch(
        f"/api/v1/admin/courses/{first_id}",
        json={"fecha_fin": "2026-12-07"},
        headers=origin_headers,
    )
    assert first_dates.status_code == 200, first_dates.text
    assigned_room = await client.put(
        f"/api/v1/admin/courses/{first_id}/schedules",
        json={
            "horarios": [
                {"dia_semana": "LUNES", "hora_inicio": "08:00", "hora_fin": "10:00", "aula": "101"}
            ]
        },
        headers=origin_headers,
    )
    assert assigned_room.status_code == 200, assigned_room.text

    teacher = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "T-10003",
            "nombres": "Segundo",
            "apellidos": "Docente",
            "correo": "teacher.parallel3@example.edu",
            "telefono": "70000013",
            "rol": "DOCENTE",
        },
        headers=origin_headers,
    )
    assert teacher.status_code == 201, teacher.text
    second = await client.post(
        "/api/v1/admin/courses",
        json={
            "materia_plan_id": context["entry"]["id"],
            "periodo_id": context["period"]["id"],
            "paralelo": "B",
            "cupo": 20,
            "fecha_inicio": "2026-12-07",
            "fecha_fin": "2026-12-07",
            "docente_id": teacher.json()["id"],
        },
        headers=origin_headers,
    )
    assert second.status_code == 201, second.text

    holiday = await client.post(
        f"/api/v1/admin/periods/{context['period']['id']}/holidays",
        json={"fecha": "2026-12-07", "descripcion": "Feriado de prueba"},
        headers=origin_headers,
    )
    assert holiday.status_code == 201, holiday.text
    schedule = [{"dia_semana": "LUNES", "hora_inicio": "09:00", "hora_fin": "11:00", "aula": "101"}]
    ignored_holiday = await client.post(
        f"/api/v1/admin/courses/{second.json()['id']}/schedules/validate",
        json={"horarios": schedule},
        headers=origin_headers,
    )
    assert ignored_holiday.status_code == 200, ignored_holiday.text

    removed_holiday = await client.delete(
        f"/api/v1/admin/periods/{context['period']['id']}/holidays/{holiday.json()['id']}",
        headers=origin_headers,
    )
    assert removed_holiday.status_code == 204, removed_holiday.text
    cancelled = await client.post(
        f"/api/v1/admin/courses/{first_id}/exceptions",
        json={"fecha_original": "2026-12-07", "tipo": "CANCELADA", "motivo": "Prueba"},
        headers=origin_headers,
    )
    assert cancelled.status_code == 201, cancelled.text
    ignored_cancellation = await client.post(
        f"/api/v1/admin/courses/{second.json()['id']}/schedules/validate",
        json={"horarios": schedule},
        headers=origin_headers,
    )
    assert ignored_cancellation.status_code == 200, ignored_cancellation.text

    remove_cancellation = await client.delete(
        f"/api/v1/admin/courses/{first_id}/exceptions/{cancelled.json()['id']}",
        headers=origin_headers,
    )
    assert remove_cancellation.status_code == 204, remove_cancellation.text
    reprogrammed = await client.post(
        f"/api/v1/admin/courses/{first_id}/exceptions",
        json={
            "fecha_original": "2026-12-07",
            "tipo": "REPROGRAMADA",
            "fecha_reprogramada": "2026-12-08",
            "hora_inicio": "08:00",
            "hora_fin": "10:00",
            "aula": "101",
        },
        headers=origin_headers,
    )
    assert reprogrammed.status_code == 201, reprogrammed.text
    second_tuesday = await client.patch(
        f"/api/v1/admin/courses/{second.json()['id']}",
        json={"fecha_inicio": "2026-12-08", "fecha_fin": "2026-12-08"},
        headers=origin_headers,
    )
    assert second_tuesday.status_code == 200, second_tuesday.text
    tuesday_conflict = await client.post(
        f"/api/v1/admin/courses/{second.json()['id']}/schedules/validate",
        json={
            "horarios": [
                {"dia_semana": "MARTES", "hora_inicio": "09:00", "hora_fin": "11:00", "aula": "101"}
            ]
        },
        headers=origin_headers,
    )
    assert tuesday_conflict.status_code == 409
    assert "aula 101" in tuesday_conflict.json()["detail"]


async def test_course_registration_requires_setup_and_inactivation_closes_it(client):
    await admin_login(client)
    context = await create_course_context(client, schedule=False)
    course_id = context["course"]["id"]
    open_without_schedule = await client.patch(
        f"/api/v1/admin/courses/{course_id}/registration",
        json={"inscripcion_abierta": True},
        headers=ORIGIN,
    )
    assert open_without_schedule.status_code == 409

    scheduled = await client.put(
        f"/api/v1/admin/courses/{course_id}/schedules",
        json={"horarios": [{"dia_semana": "LUNES", "hora_inicio": "08:00", "hora_fin": "10:00"}]},
        headers=ORIGIN,
    )
    assert scheduled.status_code == 200
    opened = await client.patch(
        f"/api/v1/admin/courses/{course_id}/registration",
        json={"inscripcion_abierta": True},
        headers=ORIGIN,
    )
    assert opened.status_code == 200 and opened.json()["inscripcion_abierta"] is True

    deactivated = await client.patch(
        f"/api/v1/admin/courses/{course_id}",
        json={"activo": False},
        headers=ORIGIN,
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["activo"] is False
    assert deactivated.json()["inscripcion_abierta"] is False
    reactivated = await client.patch(
        f"/api/v1/admin/courses/{course_id}",
        json={"activo": True},
        headers=ORIGIN,
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["inscripcion_abierta"] is False

    deleted = await client.delete(f"/api/v1/admin/courses/{course_id}", headers=ORIGIN)
    assert deleted.status_code == 204


async def test_parallel_teacher_schedule_conflict_is_rejected(client):
    await admin_login(client)
    context = await create_course_context(client)
    course = await client.post(
        "/api/v1/admin/courses",
        json={
            "materia_plan_id": context["entry"]["id"],
            "periodo_id": context["period"]["id"],
            "paralelo": "B",
            "cupo": 20,
            "fecha_inicio": "2026-12-07",
            "fecha_fin": "2026-12-31",
            "docente_id": context["teacher"]["id"],
        },
        headers=ORIGIN,
    )
    assert course.status_code == 201
    preview = await client.post(
        f"/api/v1/admin/courses/{course.json()['id']}/schedules/validate",
        json={"horarios": [{"dia_semana": "LUNES", "hora_inicio": "09:00", "hora_fin": "11:00"}]},
        headers=ORIGIN,
    )
    assert preview.status_code == 409
    assert "docente" in preview.json()["detail"]
    conflict = await client.put(
        f"/api/v1/admin/courses/{course.json()['id']}/schedules",
        json={"horarios": [{"dia_semana": "LUNES", "hora_inicio": "09:00", "hora_fin": "11:00"}]},
        headers=ORIGIN,
    )
    assert conflict.status_code == 409


async def test_schedule_update_rejects_new_overlap_for_an_enrolled_student(client):
    await admin_login(client)
    context = await create_course_context(client)
    second_period = await client.post(
        "/api/v1/admin/periods",
        json={
            "denominacion": "Periodo superpuesto de prueba",
            "fecha_inicio": "2026-12-01",
            "fecha_fin": "2026-12-31",
        },
        headers=ORIGIN,
    )
    assert second_period.status_code == 201, second_period.text
    await client.post(
        f"/api/v1/admin/periods/{second_period.json()['id']}/careers",
        json={"carrera_id": context["career"]["id"]},
        headers=ORIGIN,
    )
    await client.post(
        f"/api/v1/admin/periods/{second_period.json()['id']}/plans",
        json={"plan_id": context["plan"]["id"]},
        headers=ORIGIN,
    )
    second_teacher = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "T-10005",
            "nombres": "Docente",
            "apellidos": "Alternativo",
            "correo": "teacher.overlap@example.edu",
            "telefono": "70000015",
            "rol": "DOCENTE",
        },
        headers=ORIGIN,
    )
    assert second_teacher.status_code == 201, second_teacher.text
    second_course = await client.post(
        "/api/v1/admin/courses",
        json={
            "materia_plan_id": context["entry"]["id"],
            "periodo_id": second_period.json()["id"],
            "paralelo": "B",
            "cupo": 20,
            "fecha_inicio": "2026-12-01",
            "fecha_fin": "2026-12-31",
            "docente_id": second_teacher.json()["id"],
        },
        headers=ORIGIN,
    )
    assert second_course.status_code == 201, second_course.text
    initial_schedule = await client.put(
        f"/api/v1/admin/courses/{second_course.json()['id']}/schedules",
        json={"horarios": [{"dia_semana": "MARTES", "hora_inicio": "09:00", "hora_fin": "11:00"}]},
        headers=ORIGIN,
    )
    assert initial_schedule.status_code == 200, initial_schedule.text
    open_first = await client.patch(
        f"/api/v1/admin/courses/{context['course']['id']}/registration",
        json={"inscripcion_abierta": True},
        headers=ORIGIN,
    )
    assert open_first.status_code == 200, open_first.text
    open_second = await client.patch(
        f"/api/v1/admin/courses/{second_course.json()['id']}/registration",
        json={"inscripcion_abierta": True},
        headers=ORIGIN,
    )
    assert open_second.status_code == 200, open_second.text

    student = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "S-20002",
            "nombres": "Estudiante",
            "apellidos": "Cruce",
            "correo": "student.overlap@example.edu",
            "telefono": "70000022",
            "rol": "ESTUDIANTE",
        },
        headers=ORIGIN,
    )
    assert student.status_code == 201, student.text
    student_data = student.json()
    assignment = await client.put(
        f"/api/v1/admin/students/{student_data['id']}/plan",
        json={"plan_estudio_id": context["plan"]["id"]},
        headers=ORIGIN,
    )
    assert assignment.status_code == 200, assignment.text
    for period_id in (context["period"]["id"], second_period.json()["id"]):
        authorization = await client.put(
            f"/api/v1/admin/periods/{period_id}/students/{student_data['id']}/authorization",
            json={"activa": True},
            headers=ORIGIN,
        )
        assert authorization.status_code == 200, authorization.text

    temporary_password = student_data["contrasena_temporal"]
    client.cookies.clear()
    first_login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": student_data["correo"], "contrasena": temporary_password},
        headers=ORIGIN,
    )
    assert first_login.status_code == 200, first_login.text
    new_password = "CruceHorarioSegura2026!"
    changed = await client.post(
        "/api/v1/auth/change-password",
        json={"contrasena_actual": temporary_password, "contrasena_nueva": new_password},
        headers=ORIGIN,
    )
    assert changed.status_code == 200, changed.text
    client.cookies.clear()
    student_login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": student_data["correo"], "contrasena": new_password},
        headers=ORIGIN,
    )
    assert student_login.status_code == 200, student_login.text
    first_enrollment = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": context["course"]["id"]},
        headers=ORIGIN,
    )
    assert first_enrollment.status_code == 201, first_enrollment.text
    second_enrollment = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": second_course.json()["id"]},
        headers=ORIGIN,
    )
    assert second_enrollment.status_code == 201, second_enrollment.text

    client.cookies.clear()
    await admin_login(client)
    overlap = await client.put(
        f"/api/v1/admin/courses/{second_course.json()['id']}/schedules",
        json={"horarios": [{"dia_semana": "LUNES", "hora_inicio": "09:00", "hora_fin": "11:00"}]},
        headers=ORIGIN,
    )
    assert overlap.status_code == 409
    assert "estudiante" in overlap.json()["detail"]


async def test_offer_enrollment_dashboard_and_schedule_notifications(client):
    await admin_login(client)
    context = await create_course_context(client)
    alternative_plan = await client.post(
        "/api/v1/admin/plans",
        json={
            "carrera_id": context["career"]["id"],
            "codigo": "PLAN-ALTERNATIVO",
            "modalidad": "SEMESTRAL",
        },
        headers=ORIGIN,
    )
    assert alternative_plan.status_code == 201
    admin_courses = await client.get("/api/v1/courses")
    assert admin_courses.status_code == 200
    assert any(row["id"] == context["course"]["id"] for row in admin_courses.json())
    admin_dashboard = await client.get("/api/v1/dashboard")
    assert admin_dashboard.status_code == 200
    assert admin_dashboard.json()["rol"] == "ADMINISTRADOR"
    student = await client.post(
        "/api/v1/admin/users",
        json={
            "ci": "S-20001",
            "nombres": "Estudiante",
            "apellidos": "Inscrito",
            "correo": "student.parallel@example.edu",
            "telefono": "70000021",
            "rol": "ESTUDIANTE",
        },
        headers=ORIGIN,
    )
    assert student.status_code == 201
    student_data = student.json()
    student_id = student_data["id"]

    assignment = await client.put(
        f"/api/v1/admin/students/{student_id}/plan",
        json={"plan_estudio_id": context["plan"]["id"]},
        headers=ORIGIN,
    )
    assert assignment.status_code == 200
    authorization = await client.put(
        f"/api/v1/admin/periods/{context['period']['id']}/students/{student_id}/authorization",
        json={"activa": True},
        headers=ORIGIN,
    )
    assert authorization.status_code == 200 and authorization.json()["habilitada"] is True
    opened = await client.patch(
        f"/api/v1/admin/courses/{context['course']['id']}/registration",
        json={"inscripcion_abierta": True},
        headers=ORIGIN,
    )
    assert opened.status_code == 200

    temporary_password = student_data["contrasena_temporal"]
    client.cookies.clear()
    first_login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": student_data["correo"], "contrasena": temporary_password},
        headers=ORIGIN,
    )
    assert first_login.status_code == 200 and first_login.json()["debe_cambiar_contrasena"] is True
    new_password = "NuevaClaveSegura2026!"
    changed = await client.post(
        "/api/v1/auth/change-password",
        json={"contrasena_actual": temporary_password, "contrasena_nueva": new_password},
        headers=ORIGIN,
    )
    assert changed.status_code == 200
    client.cookies.clear()
    student_login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": student_data["correo"], "contrasena": new_password},
        headers=ORIGIN,
    )
    assert student_login.status_code == 200

    offer = await client.get("/api/v1/student/offer")
    assert offer.status_code == 200
    assert any(row["curso"]["id"] == context["course"]["id"] for row in offer.json())
    enrollment = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": context["course"]["id"]},
        headers=ORIGIN,
    )
    assert enrollment.status_code == 201
    duplicate = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": context["course"]["id"]},
        headers=ORIGIN,
    )
    assert duplicate.status_code == 409

    client.cookies.clear()
    await admin_login(client)
    blocked_plan_change = await client.put(
        f"/api/v1/admin/students/{student_id}/plan",
        json={"plan_estudio_id": alternative_plan.json()["id"]},
        headers=ORIGIN,
    )
    assert blocked_plan_change.status_code == 409
    revoked = await client.put(
        f"/api/v1/admin/periods/{context['period']['id']}/students/{student_id}/authorization",
        json={"activa": False},
        headers=ORIGIN,
    )
    assert revoked.status_code == 200 and revoked.json()["habilitada"] is False

    teacher_password = "DocenteClaveSegura2026!"
    client.cookies.clear()
    teacher_login = await client.post(
        "/api/v1/auth/login",
        json={
            "identificador": context["teacher"]["correo"],
            "contrasena": context["teacher"]["contrasena_temporal"],
        },
        headers=ORIGIN,
    )
    assert teacher_login.status_code == 200
    teacher_change = await client.post(
        "/api/v1/auth/change-password",
        json={
            "contrasena_actual": context["teacher"]["contrasena_temporal"],
            "contrasena_nueva": teacher_password,
        },
        headers=ORIGIN,
    )
    assert teacher_change.status_code == 200
    client.cookies.clear()
    teacher_login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": context["teacher"]["correo"], "contrasena": teacher_password},
        headers=ORIGIN,
    )
    assert teacher_login.status_code == 200
    gradebook = await client.get("/api/v1/teacher/grades")
    assert gradebook.status_code == 200
    work_item = next(
        row for row in gradebook.json() if row["inscripcion_id"] == enrollment.json()["id"]
    )
    invalid_grade = await client.post(
        f"/api/v1/teacher/enrollments/{enrollment.json()['id']}/grade",
        json={"nota_final": 101},
        headers=ORIGIN,
    )
    assert invalid_grade.status_code == 422
    registered_grade = await client.post(
        f"/api/v1/teacher/enrollments/{work_item['inscripcion_id']}/grade",
        json={"nota_final": 51},
        headers=ORIGIN,
    )
    assert registered_grade.status_code == 200 and registered_grade.json()["nota_final"] == 51
    duplicate_grade = await client.post(
        f"/api/v1/teacher/enrollments/{work_item['inscripcion_id']}/grade",
        json={"nota_final": 70},
        headers=ORIGIN,
    )
    assert duplicate_grade.status_code == 409
    corrected_grade = await client.put(
        f"/api/v1/teacher/enrollments/{work_item['inscripcion_id']}/grade",
        json={"nota_final": 50},
        headers=ORIGIN,
    )
    assert corrected_grade.status_code == 200 and corrected_grade.json()["nota_final"] == 50

    client.cookies.clear()
    student_login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": student_data["correo"], "contrasena": new_password},
        headers=ORIGIN,
    )
    assert student_login.status_code == 200
    own_grades = await client.get("/api/v1/student/grades")
    assert own_grades.status_code == 200
    assert [row["nota_final"] for row in own_grades.json()] == [50]
    unauthorized_report = await client.get("/api/v1/reports/RF33/export", params={"format": "pdf"})
    assert unauthorized_report.status_code == 403
    unauthorized_preview = await client.get("/api/v1/reports/RF33/preview")
    assert unauthorized_preview.status_code == 403
    own_filters = {
        "period_id": context["period"]["id"],
        "estado_inscripcion": "ACTIVA",
        "fecha_desde": "2026-12-01",
        "fecha_hasta": "2026-12-31",
    }
    for report_code in ("RF36", "RF37", "RF39"):
        preview = await assert_report_preview(client, report_code, **own_filters)
        assert preview["row_count"] >= 1
        for output_format in ("pdf", "xlsx"):
            await assert_report_download(client, report_code, output_format, **own_filters)
    retired_filters = {**own_filters, "estado_inscripcion": "RETIRADA"}
    retired = await assert_report_preview(client, "RF39", **retired_filters)
    assert retired["row_count"] == 0
    invalid_dates = await client.get(
        "/api/v1/reports/RF39/preview",
        params={"fecha_desde": "2026-12-31", "fecha_hasta": "2026-12-01"},
    )
    assert invalid_dates.status_code == 422
    notifications = await client.get("/api/v1/notifications")
    assert notifications.status_code == 200
    assert [item["tipo"] for item in notifications.json()] == ["INSCRIPCION"]
    dashboard = await client.get("/api/v1/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["rol"] == "ESTUDIANTE"
    assert (
        next(
            item["valor"]
            for item in dashboard.json()["indicadores"]
            if item["clave"] == "inscripciones"
        )
        == 1
    )
    student_courses = await client.get("/api/v1/courses")
    assert [row["id"] for row in student_courses.json()] == [context["course"]["id"]]

    client.cookies.clear()
    await admin_login(client)
    common_filters = {
        "career_id": context["career"]["id"],
        "plan_id": context["plan"]["id"],
        "period_id": context["period"]["id"],
        "fecha_desde": "2026-12-01",
        "fecha_hasta": "2026-12-31",
    }
    admin_reports = {
        "RF33": {
            "career_id": context["career"]["id"],
            "plan_id": context["plan"]["id"],
            "estado_plan": "VIGENTE",
        },
        "RF34": {**common_filters, "student_id": student_id, "estado_inscripcion": "ACTIVA"},
        "RF35": {
            **common_filters,
            "course_id": context["course"]["id"],
            "estado_inscripcion": "ACTIVA",
        },
        "RF38": {
            **common_filters,
            "course_id": context["course"]["id"],
            "estado_inscripcion": "ACTIVA",
        },
        "RF40": {
            **common_filters,
            "teacher_id": context["teacher"]["id"],
            "estado_paralelo": "ACTIVO",
        },
    }
    for report_code, filters in admin_reports.items():
        preview = await assert_report_preview(client, report_code, **filters)
        assert preview["row_count"] >= 1
        for output_format in ("pdf", "xlsx"):
            await assert_report_download(client, report_code, output_format, **filters)
    inactive_course = {**admin_reports["RF40"], "estado_paralelo": "INACTIVO"}
    assert (await assert_report_preview(client, "RF40", **inactive_course))["row_count"] == 0
    changed_schedule = await client.put(
        f"/api/v1/admin/courses/{context['course']['id']}/schedules",
        json={"horarios": [{"dia_semana": "MARTES", "hora_inicio": "09:00", "hora_fin": "11:00"}]},
        headers=ORIGIN,
    )
    assert changed_schedule.status_code == 200

    client.cookies.clear()
    teacher_login = await client.post(
        "/api/v1/auth/login",
        json={"identificador": context["teacher"]["correo"], "contrasena": teacher_password},
        headers=ORIGIN,
    )
    assert teacher_login.status_code == 200
    teacher_notices = await client.get("/api/v1/notifications")
    assert teacher_notices.status_code == 200
    assert teacher_notices.json()
    assert {item["tipo"] for item in teacher_notices.json()} == {"CAMBIO_HORARIO"}
    teacher_dashboard = await client.get("/api/v1/dashboard")
    assert teacher_dashboard.status_code == 200
    assert teacher_dashboard.json()["rol"] == "DOCENTE"
    teacher_courses = await client.get("/api/v1/courses")
    assert [row["id"] for row in teacher_courses.json()] == [context["course"]["id"]]

    client.cookies.clear()
    await client.post(
        "/api/v1/auth/login",
        json={"identificador": student_data["correo"], "contrasena": new_password},
        headers=ORIGIN,
    )
    student_notices = await client.get("/api/v1/notifications")
    assert student_notices.status_code == 200
    assert {item["tipo"] for item in student_notices.json()} == {"INSCRIPCION", "CAMBIO_HORARIO"}
    change_notice = next(
        item for item in student_notices.json() if item["tipo"] == "CAMBIO_HORARIO"
    )
    read = await client.patch(f"/api/v1/notifications/{change_notice['id']}/read", headers=ORIGIN)
    assert read.status_code == 200 and read.json()["leida"] is True
    not_owner = await client.patch(
        f"/api/v1/notifications/{teacher_notices.json()[0]['id']}/read", headers=ORIGIN
    )
    assert not_owner.status_code == 404
