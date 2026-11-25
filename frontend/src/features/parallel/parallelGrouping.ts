import type { Course } from "../../api/client"

/** Una secuencia A puede contener varias materias del mismo grupo y turno. */
export const parallelGroupKey = (course: Course) =>
  `${course.apertura_plan_id ?? course.plan_id}:${course.turno_modular ?? "SEMESTRAL"}:${course.paralelo}`

export const countActiveParallels = (courses: Course[]) =>
  new Set(courses.filter((course) => course.activo).map(parallelGroupKey)).size
