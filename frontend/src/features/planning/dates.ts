import type { AcademicPeriod, Weekday } from "../../api/client"

/* Utilidades de fechas y semestres. Las fechas de la API llegan como "AAAA-MM-DD":
   se interpretan en hora LOCAL (con new Date("AAAA-MM-DD") se corrían un día en Bolivia). */

export const WEEKDAYS: { value: Weekday; label: string; short: string }[] = [
  { value: "LUNES", label: "Lunes", short: "Lun" }, { value: "MARTES", label: "Martes", short: "Mar" },
  { value: "MIERCOLES", label: "Miércoles", short: "Mié" }, { value: "JUEVES", label: "Jueves", short: "Jue" },
  { value: "VIERNES", label: "Viernes", short: "Vie" }, { value: "SABADO", label: "Sábado", short: "Sáb" },
  { value: "DOMINGO", label: "Domingo", short: "Dom" },
]
export const weekdayLabel = (value: Weekday) => WEEKDAYS.find((day) => day.value === value)?.label ?? value

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

export function parseDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number)
  return new Date(year, month - 1, day)
}
export const formatDate = (iso: string) => { const d = parseDate(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
export const formatDateWithWeekday = (iso: string) => { const d = parseDate(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
export const monthShort = (iso: string) => MONTHS[parseDate(iso).getMonth()]
export const dayOfMonth = (iso: string) => String(parseDate(iso).getDate())
export const formatTime = (value: string | null) => (value ? value.slice(0, 5) : "")
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
export const daysBetween = (start: string, end: string) => Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000) + 1

export type PeriodState = "current" | "upcoming" | "past"
export type Tone = "green" | "amber" | "gray"
export const PERIOD_STATE_LABEL: Record<PeriodState, string> = { current: "En curso", upcoming: "Próximo", past: "Finalizado" }
export const PERIOD_STATE_TONE: Record<PeriodState, Tone> = { current: "green", upcoming: "amber", past: "gray" }

export function periodState(period: AcademicPeriod): PeriodState {
  const today = todayIso()
  return today < period.fecha_inicio ? "upcoming" : today > period.fecha_fin ? "past" : "current"
}
/** Más reciente primero. */
export const sortPeriods = (periods: AcademicPeriod[]) => [...periods].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))
/** Semestre por defecto: el que está en curso; si no hay, el más reciente. */
export const pickDefaultPeriod = (sorted: AcademicPeriod[]) => sorted.find((period) => periodState(period) === "current") ?? sorted[0]
