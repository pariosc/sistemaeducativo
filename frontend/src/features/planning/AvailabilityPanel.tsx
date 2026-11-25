import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, CalendarSession, Course, CourseSchedule, Holiday, PlanningRoom, ScheduleBlock, User, Weekday } from "../../api/client"
import { WEEKDAYS, formatDate, formatTime, parseDate, timeRangesOverlap, todayIso } from "./dates"

type ScheduleInput = Omit<CourseSchedule, "id">
type Booking = { session: CalendarSession; course: Course }

function firstDate(period: AcademicPeriod) {
  const today = todayIso()
  return today < period.fecha_inicio || today > period.fecha_fin ? period.fecha_inicio : today
}

export function AvailabilityPanel({ period, courses, teachers, rooms, blocks, selectedCourse, revision, onChanged, onOpenCourse, onClose, onReturnToCourse, onAddSchedule, onDateChange, embedded = false }: {
  period: AcademicPeriod
  courses: Course[]
  teachers: User[]
  rooms: PlanningRoom[]
  blocks: ScheduleBlock[]
  selectedCourse: Course | null
  revision: number
  onChanged: () => Promise<void>
  onOpenCourse: (id: string) => void
  onClose: () => void
  onReturnToCourse: () => void
  onAddSchedule: (input: ScheduleInput) => void
  onDateChange: (date: string) => void
  /** Oculta el encabezado propio cuando el panel se muestra dentro de un Drawer. */
  embedded?: boolean
}) {
  const [date, setDate] = useState(() => firstDate(period))
  const [start, setStart] = useState("08:00")
  const [end, setEnd] = useState("10:00")
  const [blockId, setBlockId] = useState("")
  const [seats, setSeats] = useState("")
  const [query, setQuery] = useState("")
  const [onlyFree, setOnlyFree] = useState(false)
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loadedDate, setLoadedDate] = useState("")
  const [loadedRevision, setLoadedRevision] = useState(-1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    void Promise.all([api.getPlanningAvailability(date), api.listHolidays(period.id)]).then(([items, days]) => {
      if (!cancelled) { setSessions(items); setHolidays(days); setLoadedDate(date); setLoadedRevision(revision) }
    }).catch((reason: Error) => { if (!cancelled) { setLoadedDate(date); setLoadedRevision(revision); setSessions([]); setError(reason.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period.id, date, revision])

  const validTime = Boolean(start && end && start < end)
  const waiting = loading || loadedDate !== date || loadedRevision !== revision
  const inPeriod = date >= period.fecha_inicio && date <= period.fecha_fin
  const holiday = holidays.find((item) => item.fecha === date)
  const coursesById = new Map(courses.map((course) => [course.id, course]))
  const allBookings: Booking[] = waiting || !validTime ? [] : sessions
    .filter((session) => session.fecha === date && timeRangesOverlap(start, end, session.hora_inicio, session.hora_fin))
    .flatMap((session) => {
      const course = coursesById.get(session.curso_id)
      return course ? [{ session, course }] : []
    })
  const otherBookings = allBookings.filter((booking) => booking.course.id !== selectedCourse?.id)
  const needle = query.trim().toLocaleLowerCase()
  const activeTeachers = teachers.filter((item) => item.activo && `${item.nombres} ${item.apellidos}`.toLocaleLowerCase().includes(needle))
  const activeRooms = rooms.filter((item) => item.activa && item.codigo.toLocaleLowerCase().includes(needle))
  const requiredSeats = selectedCourse?.cupo ?? (seats ? Number(seats) : 0)
  const teacherConflicts = (id: string) => otherBookings.filter((booking) => booking.course.docente_id === id)
  const roomConflicts = (code: string) => otherBookings.filter((booking) => booking.session.aula === code)
  const roomCapacityIssue = (room: PlanningRoom) => room.capacidad === null ? "Capacidad pendiente" : requiredSeats > room.capacidad ? `Insuficiente para ${requiredSeats} estudiantes` : ""
  const shownTeachers = activeTeachers.filter((item) => !onlyFree || teacherConflicts(item.id).length === 0)
  const shownRooms = activeRooms.filter((item) => !onlyFree || (!roomConflicts(item.codigo).length && !roomCapacityIssue(item)))
  const dayIndex = (parseDate(date).getDay() + 6) % 7
  const weekday: Weekday = WEEKDAYS[dayIndex].value
  const matchingSlot = selectedCourse?.horarios.find((slot) => slot.dia_semana === weekday && slot.hora_inicio.slice(0, 5) === start && slot.hora_fin.slice(0, 5) === end)
  const ownOriginalSession = allBookings.some((booking) => booking.course.id === selectedCourse?.id && !booking.session.reprogramada && booking.session.hora_inicio.slice(0, 5) === start && booking.session.hora_fin.slice(0, 5) === end)
  const inCourseDates = Boolean(selectedCourse && date >= selectedCourse.fecha_inicio && date <= selectedCourse.fecha_fin)
  const canAssign = Boolean(selectedCourse && validTime && inPeriod && !waiting && !error && !holiday && inCourseDates)

  async function assign(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("")
    try { await action(); await onChanged(); setNotice(success) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la asignación.") }
    finally { setBusy(false) }
  }

  return <section className="pl-availability" aria-labelledby={embedded ? undefined : "availability-title"}>
    {!embedded && <div className="pl-availability-head"><div><h2 id="availability-title">Disponibilidad</h2><p>Consulta docentes y aulas de todas las carreras para una fecha y franja.</p></div><button type="button" className="ui-btn ui-btn-quiet ui-btn-sm" onClick={onClose} aria-label="Cerrar disponibilidad">Cerrar</button></div>}
    {selectedCourse && <div className="pl-availability-context"><strong>{selectedCourse.materia_codigo} · {selectedCourse.paralelo}</strong><button type="button" className="ui-link-button" onClick={onReturnToCourse}>Volver al paralelo</button><small>La consulta es de una fecha. Al asignar, el servidor revisa todas las fechas del paralelo.</small></div>}
    <div className="pl-availability-fields">
      <label>Fecha<input className="ui-input" type="date" min={period.fecha_inicio} max={period.fecha_fin} value={date} onChange={(event) => { const next = event.target.value; if (next >= period.fecha_inicio && next <= period.fecha_fin) { setDate(next); onDateChange(next); setNotice("") } }} /></label>
      <label>Franja de turno<select className="ui-select" value={blockId} onChange={(event) => { const block = blocks.find((item) => item.id === event.target.value); setBlockId(event.target.value); if (block) { setStart(block.hora_inicio.slice(0, 5)); setEnd(block.hora_fin.slice(0, 5)) } }}><option value="">Horas manuales</option>{blocks.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.turno.toLowerCase()} ({formatTime(item.hora_inicio)}–{formatTime(item.hora_fin)})</option>)}</select></label>
      <label>Desde<input className="ui-input" type="time" value={start} onChange={(event) => { setStart(event.target.value); setBlockId("") }} /></label>
      <label>Hasta<input className="ui-input" type="time" value={end} onChange={(event) => { setEnd(event.target.value); setBlockId("") }} /></label>
      {!selectedCourse && <label>Asientos mínimos<input className="ui-input" type="number" min="1" value={seats} placeholder="Sin mínimo" onChange={(event) => setSeats(event.target.value)} /></label>}
      <label>Buscar recurso<input className="ui-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Docente o aula" /></label>
    </div>
    <label className="pl-check-row"><input type="checkbox" checked={onlyFree} onChange={(event) => setOnlyFree(event.target.checked)} />Mostrar solo disponibles</label>
    {!validTime && <p className="ui-alert ui-alert-error">La hora de fin debe ser posterior a la de inicio.</p>}
    {holiday && <p className="ui-alert ui-alert-warning">{formatDate(date)} es feriado: {holiday.descripcion}. El calendario no programa clases ordinarias ese día.</p>}
    {selectedCourse && !inCourseDates && <p className="ui-alert ui-alert-info">La fecha elegida está fuera de las fechas de este paralelo. Puedes consultar recursos, pero no asignarlos desde aquí.</p>}
    {selectedCourse?.activo && matchingSlot && !ownOriginalSession && !holiday && inCourseDates && !waiting && <p className="ui-alert ui-alert-info">Esta franja no tiene una clase ordinaria en la fecha elegida. Revisa las excepciones del paralelo antes de cambiar su aula.</p>}
    {error && <p className="ui-alert ui-alert-error" role="alert">{error}</p>}
    {notice && <p className="ui-alert ui-alert-success" role="status">{notice}</p>}
    {waiting ? <p role="status">Comprobando clases de esta fecha…</p> : validTime && !error && <>
      <section className="pl-availability-group" aria-labelledby="available-teachers-title"><h3 id="available-teachers-title">Docentes <small>{activeTeachers.filter((item) => !teacherConflicts(item.id).length).length} libres</small></h3><ul>
        {shownTeachers.map((teacher) => {
          const conflicts = teacherConflicts(teacher.id)
          return <li key={teacher.id}><div><strong>{teacher.nombres} {teacher.apellidos}</strong><span className={conflicts.length ? "pl-availability-busy" : "pl-availability-free"}>{conflicts.length ? "Ocupado" : "Libre"}</span></div>
            {conflicts.map(({ course, session }) => <small key={`${course.id}-${session.hora_inicio}`}><button type="button" className="ui-link-button" onClick={() => onOpenCourse(course.id)}>{course.materia_codigo} · {course.paralelo}</button> {formatTime(session.hora_inicio)}–{formatTime(session.hora_fin)}</small>)}
            {canAssign && !conflicts.length && selectedCourse!.docente_id !== teacher.id && <button type="button" className="ui-link-button" disabled={busy} onClick={() => void assign(() => api.updateCourse(selectedCourse!.id, { docente_id: teacher.id }), `Docente ${teacher.nombres} ${teacher.apellidos} asignado.`)}>Asignar al paralelo</button>}
            {selectedCourse?.docente_id === teacher.id && <small>Docente asignado</small>}
          </li>
        })}
        {shownTeachers.length === 0 && <li>{onlyFree ? "No hay docentes libres para esta franja." : "No hay docentes activos para esta búsqueda."}</li>}
      </ul></section>
      <section className="pl-availability-group" aria-labelledby="available-rooms-title"><h3 id="available-rooms-title">Aulas <small>{activeRooms.filter((item) => !roomConflicts(item.codigo).length && !roomCapacityIssue(item)).length} libres y con capacidad</small></h3><ul>
        {shownRooms.map((room) => {
          const conflicts = roomConflicts(room.codigo)
          const capacityIssue = roomCapacityIssue(room)
          return <li key={room.codigo}><div><strong>{room.codigo} · {room.capacidad === null ? "sin capacidad" : `${room.capacidad} asientos`}</strong><span className={conflicts.length || capacityIssue ? "pl-availability-busy" : "pl-availability-free"}>{conflicts.length ? "Ocupada" : capacityIssue || "Libre"}</span></div>
            {conflicts.map(({ course, session }) => <small key={`${course.id}-${session.hora_inicio}`}><button type="button" className="ui-link-button" onClick={() => onOpenCourse(course.id)}>{course.materia_codigo} · {course.paralelo}</button> {formatTime(session.hora_inicio)}–{formatTime(session.hora_fin)}</small>)}
            {canAssign && !conflicts.length && !capacityIssue && matchingSlot && ownOriginalSession && matchingSlot.aula !== room.codigo && <button type="button" className="ui-link-button" disabled={busy} onClick={() => void assign(() => api.replaceCourseSchedules(selectedCourse!.id, selectedCourse!.horarios.map((slot) => ({ dia_semana: slot.dia_semana, hora_inicio: slot.hora_inicio, hora_fin: slot.hora_fin, aula: slot.id === matchingSlot.id ? room.codigo : slot.aula }))), `Aula ${room.codigo} asignada al horario semanal.`)}>Asignar al horario semanal</button>}
            {canAssign && !conflicts.length && !capacityIssue && !matchingSlot && <button type="button" className="ui-link-button" disabled={busy} onClick={() => onAddSchedule({ dia_semana: weekday, hora_inicio: start, hora_fin: end, aula: room.codigo })}>Agregar horario con esta aula</button>}
            {matchingSlot?.aula === room.codigo && <small>Aula asignada a esta franja semanal</small>}
          </li>
        })}
        {shownRooms.length === 0 && <li>{onlyFree ? "No hay aulas libres con capacidad para esta franja." : "No hay aulas activas para esta búsqueda."}</li>}
      </ul></section>
    </>}
  </section>
}
