import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, CalendarSession, Course, Holiday } from "../../api/client"
import { WEEKDAYS, addCalendarDays, formatDate, formatTime, mondayOf, todayIso } from "./dates"

function initialWeek(period: AcademicPeriod) {
  const today = todayIso()
  return mondayOf(today < period.fecha_inicio || today > period.fecha_fin ? period.fecha_inicio : today)
}

const FIRST_MINUTE = 7 * 60
const LAST_MINUTE = 22 * 60
const SLOT_HEIGHT = 30
const minuteOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))

function placeSessions(items: CalendarSession[]) {
  const ordered = [...items].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || a.hora_fin.localeCompare(b.hora_fin))
  const placed: { session: CalendarSession; lane: number; lanes: number }[] = []
  let cluster: typeof placed = []
  let clusterEnd = 0
  let laneEnds: number[] = []
  const finish = () => {
    const lanes = Math.max(1, laneEnds.length)
    for (const item of cluster) item.lanes = lanes
    placed.push(...cluster)
    cluster = []
    laneEnds = []
  }
  for (const session of ordered) {
    const start = minuteOf(session.hora_inicio)
    const end = minuteOf(session.hora_fin)
    if (cluster.length && start >= clusterEnd) finish()
    let lane = laneEnds.findIndex((occupiedUntil) => occupiedUntil <= start)
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(end) } else laneEnds[lane] = end
    cluster.push({ session, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, end)
  }
  if (cluster.length) finish()
  return placed
}

export function PeriodWeekCalendar({ period, courses, revision, focusDate, onOpen, onAvailability }: {
  period: AcademicPeriod
  courses: Course[]
  revision: number
  focusDate: string
  onOpen: (courseId: string) => void
  onAvailability: () => void
}) {
  const [week, setWeek] = useState(() => initialWeek(period))
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => { if (focusDate) setWeek(mondayOf(focusDate)) }, [focusDate])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    void Promise.all([api.getPeriodCalendar(period.id, week), api.listHolidays(period.id)]).then(([items, days]) => {
      if (!cancelled) { setSessions(items); setHolidays(days) }
    }).catch((reason: Error) => { if (!cancelled) { setSessions([]); setError(reason.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period.id, week, revision])

  const byId = new Map(courses.map((course) => [course.id, course]))
  const visible = sessions.filter((session) => byId.has(session.curso_id))
  const firstMinute = Math.min(FIRST_MINUTE, ...visible.map((session) => minuteOf(session.hora_inicio)))
  const lastMinute = Math.max(LAST_MINUTE, ...visible.map((session) => minuteOf(session.hora_fin)))
  const dates = Array.from({ length: 7 }, (_, index) => addCalendarDays(week, index))
  const holidayByDate = new Map(holidays.map((holiday) => [holiday.fecha, holiday.descripcion]))
  const collisions = new Set<string>()
  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i], b = visible[j]
      const courseA = byId.get(a.curso_id), courseB = byId.get(b.curso_id)
      if (a.curso_id === b.curso_id || a.fecha !== b.fecha || a.hora_inicio >= b.hora_fin || b.hora_inicio >= a.hora_fin) continue
      if (a.aula && a.aula === b.aula) collisions.add(`Aula ${a.aula} · ${formatDate(a.fecha)} · ${formatTime(a.hora_inicio)}–${formatTime(a.hora_fin)}`)
      if (courseA?.docente_id && courseA.docente_id === courseB?.docente_id) collisions.add(`Docente ${courseA.docente_nombre} · ${formatDate(a.fecha)} · ${formatTime(a.hora_inicio)}–${formatTime(a.hora_fin)}`)
    }
  }

  return <section className="pl-week-planner" aria-labelledby="weekly-planner-title">
    <div className="pl-week-planner-head"><div><h2 id="weekly-planner-title">Calendario de clases</h2><p>Fechas reales del semestre, con feriados y reprogramaciones. Selecciona una clase para gestionarla aquí mismo.</p></div><div className="pl-week-actions"><span>{visible.length} clases esta semana</span><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onAvailability}>Consultar disponibilidad</button></div></div>
    <div className="pl-week-navigation">
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={addCalendarDays(week, -7) < mondayOf(period.fecha_inicio)} onClick={() => setWeek(addCalendarDays(week, -7))}>← Semana anterior</button>
      <label>Fecha de referencia<input className="ui-input" type="date" min={period.fecha_inicio} max={period.fecha_fin} value={week < period.fecha_inicio ? period.fecha_inicio : week} onChange={(event) => { if (event.target.value) setWeek(mondayOf(event.target.value)) }} /></label>
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={addCalendarDays(week, 7) > period.fecha_fin} onClick={() => setWeek(addCalendarDays(week, 7))}>Semana siguiente →</button>
      <span>{formatDate(dates[0])} – {formatDate(dates[6])}</span>
    </div>
    {error && <p className="ui-alert ui-alert-error" role="alert">{error}</p>}
    {loading ? <p role="status">Cargando clases de esta semana…</p> : <div className="pl-timetable-scroll"><div className="pl-timetable" role="group" aria-label="Horario semanal de clases, normalmente de 07:00 a 22:00; se amplía si hay clases fuera de ese rango">
      <div className="pl-timetable-head pl-timetable-time-head">Hora</div>
      {dates.map((day, index) => <div key={day} className="pl-timetable-head" data-outside={day < period.fecha_inicio || day > period.fecha_fin || undefined}><strong>{WEEKDAYS[index].short}</strong><time dateTime={day}>{formatDate(day)}</time>{holidayByDate.has(day) && <small>Feriado: {holidayByDate.get(day)}</small>}</div>)}
      <div className="pl-timetable-times">{Array.from({ length: Math.ceil((lastMinute - firstMinute) / 30) }, (_, index) => { const value = firstMinute + index * 30; return <div key={value}>{String(Math.floor(value / 60)).padStart(2, "0")}:{String(value % 60).padStart(2, "0")}</div> })}</div>
      {dates.map((day) => <div className="pl-timetable-day" key={day} data-outside={day < period.fecha_inicio || day > period.fecha_fin || undefined} style={{ height: Math.ceil((lastMinute - firstMinute) / 30) * SLOT_HEIGHT }}>
        {placeSessions(visible.filter((session) => session.fecha === day)).map(({ session, lane, lanes }, index) => {
          const course = byId.get(session.curso_id)!
          const top = (minuteOf(session.hora_inicio) - firstMinute) / 30 * SLOT_HEIGHT
          const height = Math.max(SLOT_HEIGHT, (minuteOf(session.hora_fin) - minuteOf(session.hora_inicio)) / 30 * SLOT_HEIGHT)
          return <button key={`${session.curso_id}-${session.hora_inicio}-${index}`} type="button" className="pl-timetable-event" style={{ top, height, left: `${lane / lanes * 100}%`, width: `${100 / lanes}%` }} onClick={() => onOpen(course.id)} title={`${course.materia_nombre} · paralelo ${course.paralelo} · ${course.docente_nombre || "Sin docente"} · ${session.aula || "Sin aula"}`}>
            <strong>{course.materia_codigo} · {course.paralelo}</strong><span>{formatTime(session.hora_inicio)}–{formatTime(session.hora_fin)}</span><small>{course.carrera_nombre}</small><small>{session.aula || "Sin aula"} · {course.docente_nombre || "Sin docente"}{session.reprogramada ? " · Reprogramada" : ""}</small>
          </button>
        })}
      </div>)}
    </div></div>}
    {!loading && collisions.size > 0 && <div className="ui-alert ui-alert-error" role="alert"><strong>{collisions.size} posible(s) cruce(s) en esta vista</strong><ul>{[...collisions].map((item) => <li key={item}>{item}</li>)}</ul></div>}
  </section>
}
