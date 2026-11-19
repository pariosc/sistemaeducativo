import { useEffect, useState } from "react"

import { api, type AcademicPeriod, type StudentAuthorization } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"

const periodQuery = new URLSearchParams(window.location.search).get("periodo_id") ?? ""

export function AuthorizationsPage() {
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [periodId, setPeriodId] = useState(periodQuery)
  const [students, setStudents] = useState<StudentAuthorization[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void api.listPeriods().then((data) => {
      setPeriods(data)
      setPeriodId((current) => data.some((period) => period.id === current) ? current : data[0]?.id || "")
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!periodId) { setStudents([]); return }
    void api.listAuthorizations(periodId).then(setStudents).catch((reason: Error) => setError(reason.message))
  }, [periodId])

  async function toggle(student: StudentAuthorization) {
    setError("")
    try {
      await api.setAuthorization(periodId, student.estudiante_id, !student.habilitada)
      setStudents(await api.listAuthorizations(periodId))
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la habilitación.") }
  }

  return <main className="dashboard-page">
    <header className="topbar"><a className="small-brand" href="/">GA <span>Gestión Académica</span></a><AdminNavigation /></header>
    <section className="content-wrap">
      <span className="eyebrow">PLANIFICACIÓN ACADÉMICA</span><h1>Habilitaciones del semestre</h1>
      <p className="section-intro">Autoriza o revoca individualmente a estudiantes para inscribirse durante este semestre académico. Esta autorización no abre los paralelos.</p>
      {error && <p role="alert" className="form-alert">{error}</p>}
      {loading ? <p>Cargando periodos…</p> : periods.length === 0 ? <section className="profile-card"><p>Primero registra un periodo académico.</p></section> : <>
        <section className="profile-card prerequisite-card planning-context">
          <label>Semestre académico<select className="form-input" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>{periods.map((period) => <option key={period.id} value={period.id}>{period.denominacion} · {period.fecha_inicio} a {period.fecha_fin}</option>)}</select></label>
          <p>La autorización es distinta de la oferta académica. Revisa los <a href={`/admin/paralelos?periodo_id=${periodId}`}>paralelos programados para este semestre</a> y confirma que abran inscripciones según corresponda.</p>
        </section>
        <section className="profile-card users-table-card"><h2>Estudiantes</h2>{students.length === 0 ? <p>No hay estudiantes registrados.</p> : <div className="table-scroll"><table>
          <thead><tr><th>CI</th><th>Estudiante</th><th>Estado</th><th>Último cambio</th><th></th></tr></thead>
          <tbody>{students.map((student) => <tr key={student.estudiante_id}>
            <td>{student.estudiante_ci}</td><td>{student.estudiante_nombre}</td>
            <td>{student.habilitada ? "Habilitada" : student.id ? "Revocada" : "Sin habilitar"}</td>
            <td>{student.fecha_autorizacion ? new Date(student.fecha_autorizacion).toLocaleString() : "—"}</td>
            <td><button className="text-action" onClick={() => void toggle(student)}>{student.habilitada ? "Revocar" : "Habilitar"}</button></td>
          </tr>)}</tbody>
        </table></div>}</section>
      </>}
    </section>
  </main>
}
