import pytest

from app.tests.test_parallel import ORIGIN, admin_login

pytestmark = pytest.mark.anyio


async def test_bulk_careers_and_plans_are_validated_and_saved_together(client):
    await admin_login(client)

    async def create(path: str, data: dict) -> dict:
        response = await client.post(path, json=data, headers=ORIGIN)
        assert response.status_code == 201, response.text
        return response.json()

    faculty = await create("/api/v1/admin/faculties", {"codigo": "LOTE", "nombre": "Facultad Lote"})
    careers = [
        await create(
            "/api/v1/admin/careers",
            {
                "codigo": f"LOTE{i}",
                "nombre": f"Carrera {i}",
                "facultad_id": faculty["id"],
            },
        )
        for i in (1, 2)
    ]
    subject = await create("/api/v1/admin/subjects", {"codigo": "LOTEM", "nombre": "Materia Lote"})

    async def make_plan(career: dict, code: str, publish: bool) -> dict:
        plan = await create(
            "/api/v1/admin/plans",
            {"carrera_id": career["id"], "codigo": code, "modalidad": "SEMESTRAL"},
        )
        unit = await create(
            f"/api/v1/admin/plans/{plan['id']}/units",
            {"numero": 1, "nombre": "Semestre 1"},
        )
        await create(
            f"/api/v1/admin/plans/{plan['id']}/subjects",
            {"materia_id": subject["id"], "unidad_id": unit["id"]},
        )
        if publish:
            response = await client.patch(
                f"/api/v1/admin/plans/{plan['id']}",
                json={"estado": "VIGENTE"},
                headers=ORIGIN,
            )
            assert response.status_code == 200, response.text
        return plan

    first = await make_plan(careers[0], "LOTE-1A", True)
    another_first = await make_plan(careers[0], "LOTE-1B", True)
    second = await make_plan(careers[1], "LOTE-2A", True)
    draft = await make_plan(careers[1], "LOTE-2B", False)
    period = await create(
        "/api/v1/admin/periods",
        {"denominacion": "Lote 2027-1", "fecha_inicio": "2027-01-01", "fecha_fin": "2027-06-30"},
    )
    endpoint = f"/api/v1/admin/periods/{period['id']}/careers/batch"
    invalid = await client.post(
        endpoint,
        json={
            "carreras": [
                {"carrera_id": careers[0]["id"], "plan_ids": [first["id"]]},
                {"carrera_id": careers[1]["id"], "plan_ids": [draft["id"]]},
            ]
        },
        headers=ORIGIN,
    )
    assert invalid.status_code == 409
    planning_url = f"/api/v1/admin/periods/{period['id']}/planning"
    assert (await client.get(planning_url)).json()["carrera_ids"] == []

    payload = {
        "carreras": [
            {"carrera_id": careers[0]["id"], "plan_ids": [first["id"], another_first["id"]]},
            {"carrera_id": careers[1]["id"], "plan_ids": [second["id"]]},
        ]
    }
    result = await client.post(endpoint, json=payload, headers=ORIGIN)
    assert result.status_code == 200, result.text
    assert set(result.json()["carrera_ids"]) == {career["id"] for career in careers}
    assert set(result.json()["plan_ids"]) == {first["id"], another_first["id"], second["id"]}
    repeated = await client.post(endpoint, json=payload, headers=ORIGIN)
    assert repeated.status_code == 200
    assert len(repeated.json()["plan_ids"]) == 3
