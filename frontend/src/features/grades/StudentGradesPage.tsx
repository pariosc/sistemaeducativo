import { useEffect, useState } from "react"

import { api, type Grade } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"

export function StudentGradesPage() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => { void api.studentGrades().then(setGrades).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])

  if (loading) return <main className="simple-page"><p className="loading-copy">Cargando tus calificaciones…</p></main>
  return <main className="dashboard-page">
    <header className="topbar"><a className="small-brand" href="/">GA <span>Gestión Académica</span></a><AdminNavigation /></header>
    <section className="content-wrap"><span className="eyebrow">MI FORMACIÓN</span><h1>Mis calificaciones</h1>
      <p className="section-intro">Consulta tus notas finales por materia y periodo.</p>
      {error && <p role="alert" className="form-alert">{error}</p>}
      {grades.length === 0 ? <section className="profile-card"><p>Aún no tienes calificaciones registradas.</p></section> : <section className="profile-card users-table-card"><div className="table-scroll"><table>
        <thead><tr><th>Periodo</th><th>Materia</th><th>Paralelo</th><th>Nota final</th><th>Resultado</th></tr></thead>
        <tbody>{grades.map((grade) => <tr key={grade.id}><td>{grade.periodo_denominacion}</td><td>{grade.materia_codigo} — {grade.materia_nombre}</td><td>{grade.paralelo}</td><td>{grade.nota_final}</td><td>{grade.nota_final >= 51 ? "Aprobada" : "Reprobada"}</td></tr>)}</tbody>
      </table></div></section>}
    </section>
  </main>
}
