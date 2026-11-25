import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, Course, Holiday, ModularSubjectInput, ModularTemplate, PlanningBooking, PlanningRoom, PlanningShift, ScheduleBlock, User } from "../../api/client"
import { addCalendarDays, formatDate, formatTime, parseDate, timeRangesOverlap } from "./dates"

export type DraftSequence = {
  planId: string; groupId: string; shift: PlanningShift; start: string
  selected: string[]; rows: Record<string, ModularSubjectInput>
}
export type ProjectedModule = {
  key: string; planId: string; groupId: string; subjectId: string; paralelo: string
  cupo: number; docenteId: string | null; aula: string; start: string; end: string
  dates: string[]; horaInicio: string; horaFin: string; shift: PlanningShift
}
export type ResourceStatus = { available: boolean; reason: string }

export function useModularResources(period: AcademicPeriod, revision: string) {
  const [bookings, setBookings] = useState<PlanningBooking[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshCount, setRefreshCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    void Promise.all([
      api.getPlanningAvailabilityRange(period.fecha_inicio, period.fecha_fin),
      api.listHolidays(period.id),
    ]).then(([items, days]) => { if (!cancelled) { setBookings(items); setHolidays(days) } })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period.id, period.fecha_inicio, period.fecha_fin, revision, refreshCount])
  return { bookings, holidays, loading, error, refresh: () => setRefreshCount((value) => value + 1) }
}

export function projectModularModules(sequences: DraftSequence[], template: ModularTemplate | undefined, blocks: ScheduleBlock[], holidays: Holiday[]): ProjectedModule[] {
  if (!template) return []
  const excluded = new Set(holidays.map((item) => item.fecha))
  const modules: ProjectedModule[] = []
  for (const sequence of sequences) {
    const block = blocks.find((item) => item.activo && item.predeterminado_modular && item.turno === sequence.shift)
    if (!block || !sequence.groupId || !sequence.start) continue
    let cursor = sequence.start
    for (const subjectId of sequence.selected) {
      const row = sequence.rows[subjectId]
      if (!row) continue
      const count = row.clases ?? template.clases_por_modulo
      if (count < 1 || count > 366) continue
      const dates: string[] = []
      for (let scanned = 0; dates.length < count && scanned < 550; scanned += 1) {
        const weekday = parseDate(cursor).getDay()
        if (weekday >= 1 && weekday <= 5 && !excluded.has(cursor)) dates.push(cursor)
        cursor = addCalendarDays(cursor, 1)
      }
      if (!dates.length) continue
      modules.push({
        key: `${sequence.planId}:${subjectId}`, planId: sequence.planId,
        groupId: sequence.groupId, subjectId, paralelo: row.paralelo.trim().toUpperCase(),
        cupo: row.cupo, docenteId: row.docente_id, aula: row.aula,
        start: dates[0], end: dates.at(-1)!, dates,
        horaInicio: block.hora_inicio, horaFin: block.hora_fin, shift: sequence.shift,
      })
    }
  }
  return modules
}

function firstSharedDate(left: ProjectedModule, right: ProjectedModule) {
  if (!timeRangesOverlap(left.horaInicio, left.horaFin, right.horaInicio, right.horaFin)) return ""
  const rightDates = new Set(right.dates)
  return left.dates.find((day) => rightDates.has(day)) ?? ""
}

export function groupSequenceIssue(module: ProjectedModule, modules: ProjectedModule[], courses: Course[]) {
  const peer = modules.find((item) => item.key !== module.key && item.groupId === module.groupId && item.shift === module.shift && item.paralelo === module.paralelo && item.subjectId !== module.subjectId && item.start <= module.end && module.start <= item.end)
  if (peer) return `Se cruza con otra materia propuesta del paralelo ${module.paralelo} (${formatDate(peer.start)}–${formatDate(peer.end)}).`
  const existing = courses.find((course) => course.activo && course.apertura_plan_id === module.groupId && course.turno_modular === module.shift && course.paralelo === module.paralelo && course.materia_plan_id !== module.subjectId && course.fecha_inicio <= module.end && module.start <= course.fecha_fin)
  return existing ? `Se cruza con ${existing.materia_codigo} del paralelo ${module.paralelo} (${formatDate(existing.fecha_inicio)}–${formatDate(existing.fecha_fin)}).` : ""
}

export function roomStatus(module: ProjectedModule, room: PlanningRoom, bookings: PlanningBooking[], modules: ProjectedModule[]): ResourceStatus {
  if (!room.activa) return { available: false, reason: "Aula inactiva" }
  if (room.capacidad === null) return { available: false, reason: "Capacidad sin configurar" }
  if (module.cupo > room.capacidad) return { available: false, reason: `Cupo ${module.cupo} supera ${room.capacidad} asientos` }
  const days = new Set(module.dates)
  const occupied = bookings.find((item) => item.aula === room.codigo && days.has(item.fecha) && timeRangesOverlap(module.horaInicio, module.horaFin, item.hora_inicio, item.hora_fin))
  if (occupied) return { available: false, reason: `${formatDate(occupied.fecha)} ${formatTime(occupied.hora_inicio)}–${formatTime(occupied.hora_fin)}: ${occupied.materia_codigo} · ${occupied.paralelo}` }
  const draft = modules.find((item) => item.key !== module.key && item.aula === room.codigo && firstSharedDate(module, item))
  if (draft) return { available: false, reason: `${formatDate(firstSharedDate(module, draft))}: otra materia del borrador` }
  return { available: true, reason: "Libre durante todo el módulo" }
}

export function teacherStatus(module: ProjectedModule, teacher: User, bookings: PlanningBooking[], modules: ProjectedModule[]): ResourceStatus {
  if (!teacher.activo) return { available: false, reason: "Docente inactivo" }
  const days = new Set(module.dates)
  const occupied = bookings.find((item) => item.docente_id === teacher.id && days.has(item.fecha) && timeRangesOverlap(module.horaInicio, module.horaFin, item.hora_inicio, item.hora_fin))
  if (occupied) return { available: false, reason: `${formatDate(occupied.fecha)} ${formatTime(occupied.hora_inicio)}–${formatTime(occupied.hora_fin)}: ${occupied.materia_codigo} · ${occupied.paralelo}` }
  const draft = modules.find((item) => item.key !== module.key && item.docenteId === teacher.id && firstSharedDate(module, item))
  if (draft) return { available: false, reason: `${formatDate(firstSharedDate(module, draft))}: otra materia del borrador` }
  return { available: true, reason: "Libre durante todo el módulo" }
}
