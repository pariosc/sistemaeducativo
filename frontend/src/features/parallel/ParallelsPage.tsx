import { useEffect, useState } from "react"

import { api, type AcademicPeriod, type Course, type ScheduleException, type StudyPlan, type User, type Weekday } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"

const weekdays: { value: Weekday; label: string }[] = [
  { value: "LUNES", label: "Lunes" }, { value: "MARTES", label: "Martes" },
  { value: "MIERCOLES", label: "Miércoles" }, { value: "JUEVES", label: "Jueves" },
  { value: "VIERNES", label: "Viernes" }, { value: "SABADO", label: "Sábado" },
  { value: "DOMINGO", label: "Domingo" },
]
const emptySchedule = { dia_semana: "LUNES" as Weekday, hora_inicio: "08:00", hora_fin: "10:00", aula: "" }
const periodQuery = new URLSearchParams(window.location.search).get("periodo_id") ?? ""

export function ParallelsPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState(periodQuery)
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ materia_plan_id: "", periodo_id: "", paralelo: "A", cupo: "30", fecha_inicio: "", fecha_fin: "", docente_id: "" })
  const [scheduleForms, setScheduleForms] = useState<Record<string, typeof emptySchedule>>({})
  const [exceptions, setExceptions] = useState<Record<string, ScheduleException[]>>({})
  const [exceptionForms, setExceptionForms] = useState<Record<string, { fecha_original: string; tipo: "CANCELADA" | "REPROGRAMADA"; fecha_reprogramada: string; hora_inicio: string; hora_fin: string; motivo: string }>>({})
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)

  const planSubjects = plans.filter((plan) => plan.estado === "VIGENTE").flatMap((plan) => plan.unidades.flatMap((unit) => unit.materias))
  const periodCourses = courses.filter((course) => course.periodo_id === selectedPeriodId)

  async function reload() {
    const [courseData, periodData, planData, userData] = await Promise.all([api.listCourses(), api.listPeriods(), api.listPlans(), api.listUsers()])
    setCourses(courseData); setPeriods(periodData); setPlans(planData); setUsers(userData.filter((user) => user.rol === "DOCENTE" && user.activo))
    const preferredPeriod = periodData.some((period) => period.id === periodQuery) ? periodQuery : periodData[0]?.id ?? ""
    setSelectedPeriodId((current) => periodData.some((period) => period.id === current) ? current : preferredPeriod)
    setForm((current) => ({ ...current, periodo_id: periodData.some((period) => period.id === current.periodo_id) ? current.periodo_id : preferredPeriod, materia_plan_id: current.materia_plan_id || planData.find((plan) => plan.estado === "VIGENTE")?.unidades.flatMap((unit) => unit.materias)[0]?.id || "" }))
  }

  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(""); setMessage("")
    try { await action(); await reload(); if (success) setMessage(success) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la operación.") }
  }

  async function createCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { cupo, docente_id, ...rest } = form
    await run(() => api.createCourse({ ...rest, cupo: Number(cupo), ...(docente_id ? { docente_id } : {}) }), "Paralelo creado. Agrega su horario para poder abrir inscripciones.")
    setForm((current) => ({ ...current, paralelo: "", cupo: "30" }))
  }

  async function addSchedule(course: Course) {
    const input = scheduleForms[course.id] ?? emptySchedule
    const existing = course.horarios.map(({ dia_semana, hora_inicio, hora_fin, aula }) => ({ dia_semana, hora_inicio, hora_fin, aula }))
    await run(() => api.replaceCourseSchedules(course.id, [...existing, { ...input, aula: input.aula || null }]), "Horario actualizado.")
  }

  async function loadExceptions(courseId: string) {
    try { const data = await api.listExceptions(courseId); setExceptions((current) => ({ ...current, [courseId]: data })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar las excepciones.") }
  }

  async function addException(course: Course) {
    const data = exceptionForms[course.id]
    if (!data) return
    const payload = data.tipo === "CANCELADA"
      ? { fecha_original: data.fecha_original, tipo: data.tipo, motivo: data.motivo || undefined }
      : { fecha_original: data.fecha_original, tipo: data.tipo, fecha_reprogramada: data.fecha_reprogramada, hora_inicio: data.hora_inicio, hora_fin: data.hora_fin, motivo: data.motivo || undefined }
    await run(async () => { await api.createException(course.id, payload); await loadExceptions(course.id) }, "Excepción de calendario registrada.")
  }

  if (loading) return <main className="simple-page"><p className="loading-copy">Cargando paralelos…</p></main>
  return <main className="dashboard-page">
    <header className="topbar"><a className="small-brand" href="/">GA <span>Gestión Académica</span></a><AdminNavigation /></header>
    <section className="content-wrap">
      <span className="eyebrow">PLANIFICACIÓN ACADÉMICA</span><h1>Oferta y paralelos</h1>
      <p className="section-intro">Organiza las materias que se abrirán en un semestre académico. En planes modulares, define las fechas de cada paralelo para ubicarlo en su bloque mensual.</p>
      {error && <p role="alert" className="form-alert">{error}</p>}{message && <p role="status" className="success-note">{message}</p>}
      {periods.length > 0 && <section className="profile-card prerequisite-card planning-context">
        <label>Semestre académico<select className="form-input" value={selectedPeriodId} onChange={(event) => { setSelectedPeriodId(event.target.value); setForm((current) => ({ ...current, periodo_id: event.target.value })) }}>
          {periods.map((period) => <option key={period.id} value={period.id}>{period.denominacion} · {period.fecha_inicio} a {period.fecha_fin}</option>)}
        </select></label>
        <p>Al terminar de preparar la oferta, continúa con <a href={`/admin/habilitaciones?periodo_id=${selectedPeriodId}`}>las habilitaciones de este semestre</a>.</p>
      </section>}
      <section className="profile-card prerequisite-card"><h2>Crear paralelo</h2>
        {planSubjects.length === 0 || periods.length === 0 ? <p>Registra un periodo y agrega materias a un plan vigente antes de crear paralelos.</p> : <form className="inline-form" onSubmit={(event) => void createCourse(event)}>
          <label>Materia del plan<select className="form-input" value={form.materia_plan_id} onChange={(event) => setForm({ ...form, materia_plan_id: event.target.value })} required>
            {planSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.codigo} — {subject.nombre}</option>)}
          </select></label>
          <label>Semestre académico<select className="form-input" value={form.periodo_id} onChange={(event) => { setForm({ ...form, periodo_id: event.target.value }); setSelectedPeriodId(event.target.value) }} required>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.denominacion}</option>)}
          </select></label>
          <label>Paralelo<input className="form-input" value={form.paralelo} onChange={(event) => setForm({ ...form, paralelo: event.target.value.toUpperCase() })} required maxLength={32} /></label>
          <label>Cupo<input className="form-input" type="number" min={1} value={form.cupo} onChange={(event) => setForm({ ...form, cupo: event.target.value })} required /></label>
          <label>Inicio<input className="form-input" type="date" value={form.fecha_inicio} onChange={(event) => setForm({ ...form, fecha_inicio: event.target.value })} required /></label>
          <label>Fin<input className="form-input" type="date" min={form.fecha_inicio || undefined} value={form.fecha_fin} onChange={(event) => setForm({ ...form, fecha_fin: event.target.value })} required /></label>
          <label>Docente<select className="form-input" value={form.docente_id} onChange={(event) => setForm({ ...form, docente_id: event.target.value })}><option value="">Sin asignar</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nombres} {user.apellidos}</option>)}</select></label>
          <button className="primary-button" type="submit">Crear paralelo</button>
        </form>}
      </section>
      <h2 className="subsection-heading">Oferta registrada</h2>
      {periodCourses.length === 0 ? <section className="profile-card"><p>No hay paralelos programados para este semestre.</p></section> : <div className="unit-list">{periodCourses.map((course) => <article className="profile-card unit-card" key={course.id}>
        <div className="unit-card-heading"><div><h3>{course.materia_codigo} — {course.materia_nombre} · {course.paralelo}</h3><p>{course.plan_codigo} · {course.periodo_denominacion} · {course.fecha_inicio} a {course.fecha_fin} · cupo {course.cupo}</p><p>Docente: {course.docente_nombre ?? "Sin asignar"} · {course.activo ? "Activo" : "Inactivo"} · Inscripciones {course.inscripcion_abierta ? "abiertas" : "cerradas"}</p></div>
          <div className="table-actions"><button className="text-action" onClick={() => void run(() => api.updateCourse(course.id, { activo: !course.activo }), course.activo ? "Paralelo inactivado; las inscripciones quedaron cerradas." : "Paralelo activado; las inscripciones permanecen cerradas.")}>{course.activo ? "Inactivar" : "Activar"}</button>
            <button className="text-action" onClick={() => void run(() => api.setCourseRegistration(course.id, !course.inscripcion_abierta), course.inscripcion_abierta ? "Inscripciones cerradas." : "Inscripciones abiertas.")}>{course.inscripcion_abierta ? "Cerrar inscripción" : "Abrir inscripción"}</button>
            <button className="text-action" onClick={() => { if (window.confirm(`¿Eliminar paralelo ${course.paralelo}?`)) void run(() => api.deleteCourse(course.id)) }}>Eliminar</button></div>
        </div>
        <p><strong>Horario semanal:</strong> {course.horarios.length ? course.horarios.map((item) => `${weekdays.find((day) => day.value === item.dia_semana)?.label} ${item.hora_inicio.slice(0, 5)}–${item.hora_fin.slice(0, 5)}${item.aula ? ` (${item.aula})` : ""}`).join(" · ") : "Sin horario"}</p>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void addSchedule(course) }}>
          <label>Día<select className="form-input" value={(scheduleForms[course.id] ?? emptySchedule).dia_semana} onChange={(event) => setScheduleForms({ ...scheduleForms, [course.id]: { ...(scheduleForms[course.id] ?? emptySchedule), dia_semana: event.target.value as Weekday } })}>{weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
          <label>Desde<input className="form-input" type="time" value={(scheduleForms[course.id] ?? emptySchedule).hora_inicio} onChange={(event) => setScheduleForms({ ...scheduleForms, [course.id]: { ...(scheduleForms[course.id] ?? emptySchedule), hora_inicio: event.target.value } })} required /></label>
          <label>Hasta<input className="form-input" type="time" value={(scheduleForms[course.id] ?? emptySchedule).hora_fin} onChange={(event) => setScheduleForms({ ...scheduleForms, [course.id]: { ...(scheduleForms[course.id] ?? emptySchedule), hora_fin: event.target.value } })} required /></label>
          <label>Aula<input className="form-input" value={(scheduleForms[course.id] ?? emptySchedule).aula} onChange={(event) => setScheduleForms({ ...scheduleForms, [course.id]: { ...(scheduleForms[course.id] ?? emptySchedule), aula: event.target.value } })} maxLength={120} /></label>
          <button className="primary-button" type="submit">Agregar horario</button>
        </form>
        <details onToggle={(event) => { if (event.currentTarget.open && !exceptions[course.id]) void loadExceptions(course.id) }}>
          <summary>Excepciones de calendario</summary>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void addException(course) }}>
            <label>Clase original<input className="form-input" type="date" min={course.fecha_inicio} max={course.fecha_fin} value={(exceptionForms[course.id] ?? { fecha_original: "", tipo: "CANCELADA" as const, fecha_reprogramada: "", hora_inicio: "08:00", hora_fin: "10:00", motivo: "" }).fecha_original} onChange={(event) => setExceptionForms({ ...exceptionForms, [course.id]: { ...(exceptionForms[course.id] ?? { tipo: "CANCELADA" as const, fecha_reprogramada: "", hora_inicio: "08:00", hora_fin: "10:00", motivo: "" }), fecha_original: event.target.value } })} required /></label>
            <label>Acción<select className="form-input" value={(exceptionForms[course.id]?.tipo ?? "CANCELADA")} onChange={(event) => setExceptionForms({ ...exceptionForms, [course.id]: { ...(exceptionForms[course.id] ?? { fecha_original: "", fecha_reprogramada: "", hora_inicio: "08:00", hora_fin: "10:00", motivo: "" }), tipo: event.target.value as "CANCELADA" | "REPROGRAMADA" } })}><option value="CANCELADA">Cancelar</option><option value="REPROGRAMADA">Reprogramar</option></select></label>
            {exceptionForms[course.id]?.tipo === "REPROGRAMADA" && <><label>Nueva fecha<input className="form-input" type="date" value={exceptionForms[course.id]?.fecha_reprogramada ?? ""} onChange={(event) => setExceptionForms({ ...exceptionForms, [course.id]: { ...exceptionForms[course.id], tipo: "REPROGRAMADA", fecha_original: exceptionForms[course.id]?.fecha_original ?? "", fecha_reprogramada: event.target.value, hora_inicio: exceptionForms[course.id]?.hora_inicio ?? "08:00", hora_fin: exceptionForms[course.id]?.hora_fin ?? "10:00", motivo: exceptionForms[course.id]?.motivo ?? "" } })} required /></label>
              <label>Desde<input className="form-input" type="time" value={exceptionForms[course.id]?.hora_inicio ?? "08:00"} onChange={(event) => setExceptionForms({ ...exceptionForms, [course.id]: { ...exceptionForms[course.id], tipo: "REPROGRAMADA", fecha_original: exceptionForms[course.id]?.fecha_original ?? "", fecha_reprogramada: exceptionForms[course.id]?.fecha_reprogramada ?? "", hora_inicio: event.target.value, hora_fin: exceptionForms[course.id]?.hora_fin ?? "10:00", motivo: exceptionForms[course.id]?.motivo ?? "" } })} required /></label>
              <label>Hasta<input className="form-input" type="time" value={exceptionForms[course.id]?.hora_fin ?? "10:00"} onChange={(event) => setExceptionForms({ ...exceptionForms, [course.id]: { ...exceptionForms[course.id], tipo: "REPROGRAMADA", fecha_original: exceptionForms[course.id]?.fecha_original ?? "", fecha_reprogramada: exceptionForms[course.id]?.fecha_reprogramada ?? "", hora_inicio: exceptionForms[course.id]?.hora_inicio ?? "08:00", hora_fin: event.target.value, motivo: exceptionForms[course.id]?.motivo ?? "" } })} required /></label></>}
            <label>Motivo<input className="form-input" value={exceptionForms[course.id]?.motivo ?? ""} onChange={(event) => setExceptionForms({ ...exceptionForms, [course.id]: { ...exceptionForms[course.id], tipo: exceptionForms[course.id]?.tipo ?? "CANCELADA", fecha_original: exceptionForms[course.id]?.fecha_original ?? "", fecha_reprogramada: exceptionForms[course.id]?.fecha_reprogramada ?? "", hora_inicio: exceptionForms[course.id]?.hora_inicio ?? "08:00", hora_fin: exceptionForms[course.id]?.hora_fin ?? "10:00", motivo: event.target.value } })} maxLength={240} /></label>
            <button className="primary-button" type="submit">Guardar excepción</button>
          </form>
          {(exceptions[course.id] ?? []).map((exception) => <p key={exception.id}>{exception.fecha_original}: {exception.tipo === "CANCELADA" ? "cancelada" : `reprogramada al ${exception.fecha_reprogramada} (${exception.hora_inicio?.slice(0, 5)}–${exception.hora_fin?.slice(0, 5)})`} {exception.motivo ?? ""} <button className="text-action" onClick={() => void run(async () => { await api.deleteException(course.id, exception.id); await loadExceptions(course.id) })}>Quitar</button></p>)}
        </details>
      </article>)}</div>}
    </section>
  </main>
}
