import pytest

from app.tests.test_parallel import ORIGIN, admin_login

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize("modality", ["MODULAR", "SEMESTRAL"])
async def test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period(
    client, modality
):
    await admin_login(client)

    async def post(path, payload):
        response = await client.post(path, json=payload, headers=ORIGIN)
        assert response.status_code == 201, response.text
        return response.json()

    faculty = await post("/api/v1/admin/faculties", {"codigo": "FAC", "nombre": "Facultad"})
    career = await post(
        "/api/v1/admin/careers",
        {"codigo": "PROG", "nombre": "Programación", "facultad_id": faculty["id"]},
    )
    plan = await post(
        "/api/v1/admin/plans",
        {"carrera_id": career["id"], "codigo": "PROG-2027", "modalidad": modality},
    )
    first_unit = await post(
        f"/api/v1/admin/plans/{plan['id']}/units", {"numero": 1, "nombre": "Semestre 1"}
    )
    second_unit = await post(
        f"/api/v1/admin/plans/{plan['id']}/units", {"numero": 2, "nombre": "Semestre 2"}
    )
    first_subject = await post(
        "/api/v1/admin/subjects", {"codigo": "PROG1", "nombre": "Programación 1"}
    )
    second_subject = await post(
        "/api/v1/admin/subjects", {"codigo": "PROG2", "nombre": "Programación 2"}
    )
    plan_data = await post(
        f"/api/v1/admin/plans/{plan['id']}/subjects",
        {"materia_id": first_subject["id"], "unidad_id": first_unit["id"]},
    )
    first_entry = plan_data["unidades"][0]["materias"][0]["id"]
    plan_data = await post(
        f"/api/v1/admin/plans/{plan['id']}/subjects",
        {"materia_id": second_subject["id"], "unidad_id": second_unit["id"]},
    )
    second_entry = plan_data["unidades"][1]["materias"][0]["id"]
    prerequisite = await post(
        f"/api/v1/admin/plans/{plan['id']}/subjects/{second_entry}/prerequisites",
        {"requisito_materia_plan_id": first_entry},
    )
    assert prerequisite["unidades"][1]["materias"][0]["prerrequisitos"] == [first_entry]
    published = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}", json={"estado": "VIGENTE"}, headers=ORIGIN
    )
    assert published.status_code == 200

    periods = []
    for name, start, end in [
        ("2027-1", "2027-01-01", "2027-06-30"),
        ("2027-2", "2027-07-01", "2027-12-31"),
        ("2028-1", "2028-01-01", "2028-06-30"),
    ]:
        period = await post(
            "/api/v1/admin/periods",
            {"denominacion": name, "fecha_inicio": start, "fecha_fin": end},
        )
        periods.append(period)
        if name == "2027-1":
            no_career = await client.post(
                f"/api/v1/admin/periods/{period['id']}/plans",
                json={"plan_id": plan["id"]},
                headers=ORIGIN,
            )
            assert no_career.status_code == 409
            no_plan = await client.post(
                "/api/v1/admin/courses",
                json={
                    "materia_plan_id": first_entry,
                    "periodo_id": period["id"],
                    "paralelo": "A",
                    "cupo": 20,
                    "fecha_inicio": start,
                    "fecha_fin": end,
                },
                headers=ORIGIN,
            )
            assert no_plan.status_code == 409
        selected_career = await client.post(
            f"/api/v1/admin/periods/{period['id']}/careers",
            json={"carrera_id": career["id"]},
            headers=ORIGIN,
        )
        assert selected_career.status_code == 200
        selected_plan = await client.post(
            f"/api/v1/admin/periods/{period['id']}/plans",
            json={"plan_id": plan["id"]},
            headers=ORIGIN,
        )
        assert selected_plan.status_code == 200

    first_opening = await post(
        f"/api/v1/admin/periods/{periods[0]['id']}/openings", {"plan_id": plan["id"]}
    )
    second_opening = await post(
        f"/api/v1/admin/periods/{periods[1]['id']}/openings", {"plan_id": plan["id"]}
    )
    assert first_opening["id"] != second_opening["id"]
    openings = await client.get(
        f"/api/v1/admin/periods/{periods[1]['id']}/plans/{plan['id']}/openings"
    )
    assert openings.status_code == 200
    assert [row["semestre_proyectado"] for row in openings.json()] == [2, 1]
    assert [slot["periodo_denominacion"] for slot in openings.json()[1]["proyeccion"]] == [
        "2027-2",
        "2028-1",
    ]
    empty_suggestions = await client.get(
        f"/api/v1/admin/periods/{periods[1]['id']}/plans/{plan['id']}/suggestions"
    )
    assert empty_suggestions.status_code == 200
    assert not any(row["recomendada"] for row in empty_suggestions.json())

    teacher = await post(
        "/api/v1/admin/users",
        {
            "ci": "T-50001",
            "nombres": "Docente",
            "apellidos": "Prueba",
            "correo": "teacher.progress@example.edu",
            "telefono": "70000100",
            "rol": "DOCENTE",
        },
    )
    students = []
    for index in (1, 2):
        student = await post(
            "/api/v1/admin/users",
            {
                "ci": f"S-5000{index}",
                "nombres": ("Ana" if index == 1 else "Luis"),
                "apellidos": "Prueba",
                "correo": f"student.progress{index}@example.edu",
                "telefono": f"7000010{index}",
                "rol": "ESTUDIANTE",
            },
        )
        assigned = await client.put(
            f"/api/v1/admin/students/{student['id']}/plan",
            json={
                "plan_estudio_id": plan["id"],
                **({"apertura_plan_id": first_opening["id"]} if index == 1 else {}),
            },
            headers=ORIGIN,
        )
        assert assigned.status_code == 200
        if index == 2:
            group = await client.put(
                f"/api/v1/admin/students/{student['id']}/opening",
                json={"apertura_plan_id": first_opening["id"]},
                headers=ORIGIN,
            )
            assert group.status_code == 200
            assert group.json()["apertura_plan_id"] == first_opening["id"]
        else:
            assert assigned.json()["apertura_plan_id"] == first_opening["id"]
        for period in periods[:2]:
            authorized = await client.put(
                f"/api/v1/admin/periods/{period['id']}/students/{student['id']}/authorization",
                json={"activa": True},
                headers=ORIGIN,
            )
            assert authorized.status_code == 200
        students.append(student)

    async def course(entry_id, period, start, end, parallel="A"):
        created = await post(
            "/api/v1/admin/courses",
            {
                "materia_plan_id": entry_id,
                "periodo_id": period["id"],
                "paralelo": parallel,
                "cupo": 20,
                "fecha_inicio": start,
                "fecha_fin": end,
                "docente_id": teacher["id"],
            },
        )
        scheduled = await client.put(
            f"/api/v1/admin/courses/{created['id']}/schedules",
            json={
                "horarios": [{"dia_semana": "LUNES", "hora_inicio": "08:00", "hora_fin": "09:00"}]
            },
            headers=ORIGIN,
        )
        assert scheduled.status_code == 200, scheduled.text
        opened = await client.patch(
            f"/api/v1/admin/courses/{created['id']}/registration",
            json={"inscripcion_abierta": True},
            headers=ORIGIN,
        )
        assert opened.status_code == 200, opened.text
        return created

    first_course = await course(first_entry, periods[0], "2027-01-01", "2027-01-31")
    same_period_dependent = await course(second_entry, periods[0], "2027-02-01", "2027-02-28")
    same_period_repeat = await course(first_entry, periods[0], "2027-03-01", "2027-03-31", "B")
    next_repeat = await course(first_entry, periods[1], "2027-07-01", "2027-07-31")
    next_dependent = await course(second_entry, periods[1], "2027-08-01", "2027-08-31")

    async def login_fresh(user, password):
        client.cookies.clear()
        logged = await client.post(
            "/api/v1/auth/login",
            json={"identificador": user["correo"], "contrasena": password},
            headers=ORIGIN,
        )
        assert logged.status_code == 200, logged.text

    student_passwords = []
    enrollments = []
    for index, student in enumerate(students):
        await login_fresh(student, student["contrasena_temporal"])
        password = f"ClaveEstudiante{index + 1}2027!"
        changed = await client.post(
            "/api/v1/auth/change-password",
            json={
                "contrasena_actual": student["contrasena_temporal"],
                "contrasena_nueva": password,
            },
            headers=ORIGIN,
        )
        assert changed.status_code == 200
        await login_fresh(student, password)
        enrolled = await client.post(
            "/api/v1/student/enrollments",
            json={"curso_id": first_course["id"]},
            headers=ORIGIN,
        )
        assert enrolled.status_code == 201, enrolled.text
        student_passwords.append(password)
        enrollments.append(enrolled.json())

    await login_fresh(teacher, teacher["contrasena_temporal"])
    changed = await client.post(
        "/api/v1/auth/change-password",
        json={
            "contrasena_actual": teacher["contrasena_temporal"],
            "contrasena_nueva": "ClaveDocente2027!",
        },
        headers=ORIGIN,
    )
    assert changed.status_code == 200
    await login_fresh(teacher, "ClaveDocente2027!")
    for enrollment, grade in zip(enrollments, (51, 50), strict=True):
        response = await client.post(
            f"/api/v1/teacher/enrollments/{enrollment['id']}/grade",
            json={"nota_final": grade},
            headers=ORIGIN,
        )
        assert response.status_code == 200, response.text

    await login_fresh(students[0], student_passwords[0])
    offer = await client.get("/api/v1/student/offer")
    current = next(row for row in offer.json() if row["curso"]["id"] == same_period_dependent["id"])
    later = next(row for row in offer.json() if row["curso"]["id"] == next_dependent["id"])
    assert [item["codigo"] for item in current["prerrequisitos_pendientes"]] == ["PROG1"]
    assert later["prerrequisitos_pendientes"] == []
    blocked = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": same_period_dependent["id"]},
        headers=ORIGIN,
    )
    assert blocked.status_code == 409
    allowed = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": next_dependent["id"]},
        headers=ORIGIN,
    )
    assert allowed.status_code == 201, allowed.text

    await login_fresh(students[1], student_passwords[1])
    not_same_period = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": same_period_repeat["id"]},
        headers=ORIGIN,
    )
    assert not_same_period.status_code == 409
    repeat_later = await client.post(
        "/api/v1/student/enrollments",
        json={"curso_id": next_repeat["id"]},
        headers=ORIGIN,
    )
    assert repeat_later.status_code == 201, repeat_later.text

    client.cookies.clear()
    await admin_login(client)
    later_opening = await client.put(
        f"/api/v1/admin/students/{students[0]['id']}/opening",
        json={"apertura_plan_id": second_opening["id"]},
        headers=ORIGIN,
    )
    assert later_opening.status_code == 409
    suggestions = await client.get(
        f"/api/v1/admin/periods/{periods[1]['id']}/plans/{plan['id']}/suggestions"
    )
    assert suggestions.status_code == 200, suggestions.text
    by_code = {row["codigo"]: row for row in suggestions.json()}
    assert by_code["PROG1"]["repetidores"] == 1
    assert by_code["PROG2"]["aptos"] == 1
    assert by_code["PROG2"]["bloqueados"] == 1
    assert by_code["PROG1"]["recomendada"]
    assert by_code["PROG2"]["recomendada"]
    conflict_preview = await client.post(
        f"/api/v1/admin/courses/{next_repeat['id']}/preview",
        json={"fecha_inicio": "2027-08-01", "fecha_fin": "2027-08-31"},
        headers=ORIGIN,
    )
    assert conflict_preview.status_code == 409, conflict_preview.text
    courses_after_preview = await client.get("/api/v1/courses")
    repeat_after_preview = next(
        item for item in courses_after_preview.json() if item["id"] == next_repeat["id"]
    )
    assert repeat_after_preview["fecha_inicio"] == "2027-07-01"
