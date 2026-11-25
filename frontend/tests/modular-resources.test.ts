import { expect, test } from "bun:test"

import type { Course, Holiday, ModularTemplate, PlanningBooking, PlanningRoom, ScheduleBlock, User } from "../src/api/client"
import { groupSequenceIssue, projectModularModules, roomStatus, teacherStatus } from "../src/features/planning/modularResources"

const template: ModularTemplate = { id: "t", nombre: "Turno", clases_por_modulo: 3, minutos_por_clase: 180, activa: true }
const blocks: ScheduleBlock[] = [{ id: "b", turno: "MANANA", nombre: "Mañana", hora_inicio: "08:00", hora_fin: "11:00", activo: true, predeterminado_modular: true }]
const holidays: Holiday[] = [{ id: "h", periodo_id: "p", fecha: "2026-12-08", descripcion: "Feriado" }]
const draft = (parallel: string, subjectId: string, room = "A") => ({
  planId: parallel, groupId: "grupo", shift: "MANANA" as const, start: "2026-12-07",
  selected: [subjectId], rows: { [subjectId]: { materia_plan_id: subjectId, paralelo: parallel, cupo: 20, docente_id: "docente", aula: room } },
})
const room: PlanningRoom = { codigo: "A", capacidad: 30, activa: true }

test("calcula todas las clases, omite feriados y separa secuencias A y B", () => {
  const modules = projectModularModules([draft("A", "m1"), draft("B", "m2")], template, blocks, holidays)
  expect(modules[0].dates).toEqual(["2026-12-07", "2026-12-09", "2026-12-10"])
  expect(modules[1].dates).toEqual(modules[0].dates)
  expect(groupSequenceIssue(modules[0], modules, [] as Course[])).toBe("")
  expect(roomStatus(modules[0], room, [], modules).available).toBe(false)
  expect(teacherStatus(modules[0], { id: "docente", activo: true } as User, [], modules).available).toBe(false)
})

test("bloquea el aula si otra carrera la usa en cualquier clase del módulo", () => {
  const [module] = projectModularModules([draft("A", "m1")], template, blocks, holidays)
  const booking = { curso_id: "curso", fecha: "2026-12-10", hora_inicio: "09:00", hora_fin: "10:00", aula: "A", docente_id: "otro", materia_codigo: "MAT", paralelo: "C" } as PlanningBooking
  expect(roomStatus(module, room, [booking], [module]).available).toBe(false)
  expect(teacherStatus(module, { id: "docente", activo: true } as User, [{ ...booking, docente_id: "docente" }], [module]).available).toBe(false)
  expect(roomStatus(module, room, [{ ...booking, hora_inicio: "11:00", hora_fin: "12:00" }], [module]).available).toBe(true)
  expect(roomStatus(module, { ...room, capacidad: 15 }, [], [module]).available).toBe(false)
})

test("marca conflicto de secuencia solo para el mismo grupo, turno y paralelo", () => {
  const first = projectModularModules([draft("A", "m1")], template, blocks, holidays)[0]
  const second = { ...first, key: "otro:m2", subjectId: "m2" }
  expect(groupSequenceIssue(first, [first, second], [] as Course[])).toContain("Se cruza")
  expect(groupSequenceIssue(first, [first, { ...second, paralelo: "B" }], [] as Course[])).toBe("")
})
