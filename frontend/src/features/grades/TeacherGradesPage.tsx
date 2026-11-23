import { useEffect, useState } from "react"

import { api, type GradeWorkItem } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"
import { gradeSchema, messageOf } from "../shared/validation"

export function TeacherGradesPage() {
  const [items, setItems] = useState<GradeWorkItem[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({})
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")

  async function reload() {
    const data = await api.teacherGradebook()
    setItems(data)
    setValues((current) => Object.fromEntries(data.map((item) => [item.inscripcion_id, current[item.inscripcion_id] ?? (item.nota_final === null ? "" : String(item.nota_final))])))
  }
  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])

  async function save(item: GradeWorkItem) {
    const raw = values[item.inscripcion_id] ?? ""
    const invalid = raw.trim() === "" ? "Ingresa una nota." : messageOf(gradeSchema, Number(raw))
    setRowErrors((current) => ({ ...current, [item.inscripcion_id]: invalid }))
    if (invalid) return
    if (item.nota_final !== null && !window.confirm(`¿Corregir la nota de ${item.estudiante_nombre} de ${item.nota_final} a ${raw}?`)) return
    setError(""); setMessage(""); setSaving(item.inscripcion_id)
    try {
      if (item.nota_final === null) await api.registerGrade(item.inscripcion_id, Number(raw))
      else await api.correctGrade(item.inscripcion_id, Number(raw))
      await reload(); setMessage("Calificación guardada.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la calificación.") }
    finally { setSaving("") }
  }

  if (loading) return <main className="simple-page"><p className="loading-copy">Cargando calificaciones…</p></main>
  return <main className="dashboard-page">
    <header className="topbar"><a className="small-brand" href="/">GA <span>Gestión Académica</span></a><AdminNavigation /></header>
    <section className="content-wrap"><span className="eyebrow">DOCENCIA</span><h1>Calificaciones de mis paralelos</h1>
      <p className="section-intro">Registra y corrige notas finales para estudiantes inscritos en tus paralelos.</p>
      {error && <p role="alert" className="form-alert">{error}</p>}{message && <p role="status" className="success-note">{message}</p>}
      {items.length === 0 ? <section className="profile-card"><p>No hay estudiantes inscritos en tus paralelos activos.</p></section> : <section className="profile-card users-table-card"><div className="table-scroll"><table>
        <thead><tr><th>Periodo</th><th>Materia / paralelo</th><th>Estudiante</th><th>Nota final</th><th>Registrada</th><th></th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.inscripcion_id}>
          <td>{item.periodo_denominacion}</td><td>{item.materia_codigo} — {item.materia_nombre} · {item.paralelo}</td><td>{item.estudiante_nombre} ({item.estudiante_ci})</td>
          <td><input className="form-input compact-select" aria-label={`Nota para ${item.estudiante_nombre}`} type="number" min={0} max={100} step={1} value={values[item.inscripcion_id] ?? ""} aria-invalid={Boolean(rowErrors[item.inscripcion_id])} aria-describedby={rowErrors[item.inscripcion_id] ? `nota-error-${item.inscripcion_id}` : undefined} onChange={(event) => { setValues({ ...values, [item.inscripcion_id]: event.target.value }); setRowErrors((current) => ({ ...current, [item.inscripcion_id]: null })) }} />
            {rowErrors[item.inscripcion_id] && <span id={`nota-error-${item.inscripcion_id}`} className="field-error">{rowErrors[item.inscripcion_id]}</span>}</td>
          <td>{item.fecha_registro ? new Date(item.fecha_registro).toLocaleString() : "Pendiente"}</td>
          <td><button className="text-action" disabled={saving === item.inscripcion_id} onClick={() => void save(item)}>{saving === item.inscripcion_id ? "Guardando…" : item.nota_final === null ? "Registrar" : "Corregir"}</button></td>
        </tr>)}</tbody>
      </table></div></section>}
    </section>
  </main>
}
