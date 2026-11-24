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
    conflict = await client.put(
        f"/api/v1/admin/courses/{course.json()['id']}/schedules",
        json={"horarios": [{"dia_semana": "LUNES", "hora_inicio": "09:00", "hora_fin": "11:00"}]},
        headers=ORIGIN,
    )
    assert conflict.status_code == 409


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
