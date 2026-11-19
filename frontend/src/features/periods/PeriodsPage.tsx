import { useEffect, useState } from "react"

import { api, type AcademicPeriod } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"

const emptyForm = { denominacion: "", fecha_inicio: "", fecha_fin: "" }
const periodQuery = new URLSearchParams(window.location.search).get("periodo_id") ?? ""

export function PeriodsPage() {
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState(periodQuery)
  const [holidays, setHolidays] = useState<Awaited<ReturnType<typeof api.listHolidays>>>([])
  const [holidayForm, setHolidayForm] = useState({ fecha: "", descripcion: "" })
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)

  async function reload() {
    const data = await api.listPeriods()
    setPeriods(data)
    if (!data.some((period) => period.id === selectedPeriodId)) setSelectedPeriodId(data[0]?.id ?? "")
  }
  useEffect(() => {
    void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!selectedPeriodId) { setHolidays([]); return }
    void api.listHolidays(selectedPeriodId).then(setHolidays).catch((reason: Error) => setError(reason.message))
  }, [selectedPeriodId])

  async function createPeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    try {
      await api.createPeriod(form)
      setForm(emptyForm)
      setMessage("Periodo académico registrado.")
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo registrar el periodo.")
    }
  }

  async function createHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPeriodId) return
    setError(""); setMessage("")
    try {
      await api.createHoliday(selectedPeriodId, holidayForm)
      setHolidayForm({ fecha: "", descripcion: "" })
      setHolidays(await api.listHolidays(selectedPeriodId))
      setMessage("Feriado registrado para todo el periodo.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo registrar el feriado.") }
  }

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap">
        <span className="eyebrow">PLANIFICACIÓN ACADÉMICA</span>
        <h1>Planificación del semestre</h1>
        <p className="section-intro">El semestre académico es el ciclo común de oferta e inscripción para planes semestrales y modulares. En un plan modular, cada paralelo puede impartirse en un bloque mensual dentro de este ciclo.</p>
        <section className="profile-card prerequisite-card">
          <h2>Flujo de preparación</h2>
          <ol className="planning-steps">
            <li><strong>Definir semestre académico.</strong> Registra sus fechas y calendario.</li>
            <li><strong>Programar la oferta.</strong> Crea paralelos para las materias que se abrirán y asigna docente, fechas, cupo y horarios.</li>
            <li><strong>Habilitar estudiantes.</strong> Autoriza su inscripción para este semestre; después, abre cada paralelo cuando esté listo.</li>
          </ol>
          <p className="form-help">El semestre curricular que ubica una materia en el plan es distinto: un estudiante puede cursar materias de distintos semestres curriculares durante este mismo ciclo.</p>
        </section>
        {error && <p role="alert" className="form-alert">{error}</p>}
        {message && <p role="status" className="success-note">{message}</p>}
        <div className="profile-grid users-grid">
          <section className="profile-card">
            <h2>Nuevo semestre académico</h2>
            <form className="stack-form" onSubmit={(event) => void createPeriod(event)}>
              <label>Denominación<input className="form-input" value={form.denominacion} onChange={(event) => setForm({ ...form, denominacion: event.target.value })} required maxLength={160} placeholder="2027-I" /></label>
              <label>Fecha inicial<input className="form-input" type="date" value={form.fecha_inicio} onChange={(event) => setForm({ ...form, fecha_inicio: event.target.value })} required /></label>
              <label>Fecha final<input className="form-input" type="date" value={form.fecha_fin} onChange={(event) => setForm({ ...form, fecha_fin: event.target.value })} required min={form.fecha_inicio || undefined} /></label>
              <button className="primary-button" type="submit">Crear semestre</button>
            </form>
          </section>
          <section className="profile-card users-table-card">
            <h2>Semestres académicos</h2>
            {loading ? <p>Cargando…</p> : periods.length === 0 ? <p>Aún no hay semestres. Crea uno para empezar a organizar su oferta.</p> : <div className="table-scroll"><table>
              <thead><tr><th>Denominación</th><th>Inicio</th><th>Fin</th><th>Preparar</th></tr></thead>
              <tbody>{periods.map((period) => <tr key={period.id}>
                <td>{period.denominacion}</td><td>{period.fecha_inicio}</td><td>{period.fecha_fin}</td><td><div className="table-actions">
                  <a className="text-action" href={`/admin/paralelos?periodo_id=${period.id}`}>Programar oferta</a>
                  <a className="text-action" href={`/admin/habilitaciones?periodo_id=${period.id}`}>Habilitar estudiantes</a>
                </div></td>
              </tr>)}</tbody>
            </table></div>}
          </section>
        </div>
        {periods.length > 0 && <section className="profile-card prerequisite-card">
          <h2>Calendario del semestre</h2>
          <p>Los feriados excluyen las clases recurrentes de todos los paralelos de este semestre.</p>
          <label>Semestre académico<select className="form-input" value={selectedPeriodId} onChange={(event) => setSelectedPeriodId(event.target.value)}>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.denominacion}</option>)}
          </select></label>
          <form className="inline-form" onSubmit={(event) => void createHoliday(event)}>
            <label>Fecha<input className="form-input" type="date" value={holidayForm.fecha} onChange={(event) => setHolidayForm({ ...holidayForm, fecha: event.target.value })} required /></label>
            <label>Descripción<input className="form-input" value={holidayForm.descripcion} onChange={(event) => setHolidayForm({ ...holidayForm, descripcion: event.target.value })} required maxLength={160} /></label>
            <button className="primary-button" type="submit">Agregar feriado</button>
          </form>
          {holidays.length === 0 ? <p>No hay feriados registrados.</p> : <ul className="prerequisite-list">{holidays.map((holiday) => <li key={holiday.id}>
            {holiday.fecha} — {holiday.descripcion}<button className="text-action" onClick={() => void api.deleteHoliday(selectedPeriodId, holiday.id).then(() => api.listHolidays(selectedPeriodId)).then(setHolidays).catch((reason: Error) => setError(reason.message))}>Quitar</button>
          </li>)}</ul>}
        </section>}
      </section>
    </main>
  )
}
