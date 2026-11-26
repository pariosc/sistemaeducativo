import { useEffect, useMemo, useState } from "react"

import { api, type CalendarSession, type Course } from "../../api/client"

const weekdays = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"]

function dateValue(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
}

function mondayOf(day: Date) {
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
  return result
}

function localDate(value: string) { return new Date(`${value}T00:00:00`) }
function shortDate(value: string) { return localDate(value).toLocaleDateString("es-BO", { day: "numeric", month: "short" }) }

export function WeeklySchedule({ courses }: { courses: Course[] }) {
  const [week, setWeek] = useState(() => dateValue(mondayOf(new Date())))
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])

  useEffect(() => {
    let active = true
    setLoading(true)
    api.myCalendar(week).then((data) => { if (active) { setSessions(data); setError("") } })
      .catch((reason: Error) => { if (active) setError(reason.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [week, courses])

  function changeWeek(offset: number) {
    const next = localDate(week)
    next.setDate(next.getDate() + offset * 7)
    setWeek(dateValue(next))
  }

  const days = weekdays.map((label, index) => {
    const date = localDate(week)
    date.setDate(date.getDate() + index)
    const value = dateValue(date)
    return { label, value, sessions: sessions.filter((session) => session.fecha === value && courseById.has(session.curso_id)) }
  })

  return <section className="profile-card personal-schedule" aria-label="Agenda semanal">
    <div className="personal-schedule-heading"><div><h2>Mi agenda semanal</h2><p>Clases efectivas, con feriados y reprogramaciones aplicados.</p></div>
      <div className="personal-schedule-controls"><button type="button" onClick={() => changeWeek(-1)} aria-label="Semana anterior">←</button><span>{shortDate(week)} – {shortDate(days[6].value)}</span><button type="button" onClick={() => changeWeek(1)} aria-label="Semana siguiente">→</button></div>
    </div>
    {error && <p role="alert" className="form-alert">{error}</p>}
    {loading ? <p>Cargando agenda…</p> : sessions.length === 0 ? <p>No tienes clases programadas esta semana.</p> :
      <div className="personal-schedule-grid">{days.map((day) => <div key={day.value} className="personal-schedule-day"><h3>{day.label.toLowerCase()} <small>{shortDate(day.value)}</small></h3>
        {day.sessions.length === 0 ? <p>—</p> : day.sessions.map((session, index) => {
          const course = courseById.get(session.curso_id)!
          return <div className="personal-schedule-session" key={`${session.curso_id}-${session.hora_inicio}-${index}`}>
            <strong>{session.hora_inicio.slice(0, 5)}–{session.hora_fin.slice(0, 5)}</strong>
            <span>{course.materia_codigo} · Paralelo {course.paralelo}</span>
            <span>Aula: {session.aula ?? "Pendiente"}</span>
            {session.reprogramada && <small>Reprogramada</small>}
          </div>
        })}</div>)}</div>}
  </section>
}

export function CourseWeeklySlots({ course }: { course: Course }) {
  const sorted = [...course.horarios].sort((a, b) => weekdays.indexOf(a.dia_semana) - weekdays.indexOf(b.dia_semana) || a.hora_inicio.localeCompare(b.hora_inicio))
  return sorted.length === 0 ? <span>Horario y aula pendientes</span> : <ul className="personal-schedule-slots">{sorted.map((slot) => <li key={slot.id}>{slot.dia_semana.toLowerCase()} {slot.hora_inicio.slice(0, 5)}–{slot.hora_fin.slice(0, 5)} · Aula {slot.aula ?? "pendiente"}</li>)}</ul>
}
