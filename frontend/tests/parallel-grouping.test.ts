import { expect, test } from "bun:test"

import type { Course } from "../src/api/client"
import { countActiveParallels } from "../src/features/parallel/parallelGrouping"

test("seis materias A y seis B del mismo grupo son dos paralelos", () => {
  const courses = Array.from({ length: 12 }, (_, index) => ({
    apertura_plan_id: "grupo-1", plan_id: "plan-1", turno_modular: "MANANA",
    paralelo: index < 6 ? "A" : "B", activo: true,
  })) as Course[]
  expect(countActiveParallels(courses)).toBe(2)
  expect(countActiveParallels([...courses, { ...courses[0], activo: false, paralelo: "C" }])).toBe(2)
  expect(countActiveParallels([...courses, { ...courses[0], apertura_plan_id: "grupo-2" }])).toBe(3)
})
