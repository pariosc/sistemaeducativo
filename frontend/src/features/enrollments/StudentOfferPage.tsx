import { useEffect, useState } from "react"

import { api, type CourseOffer, type Enrollment } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"

export function StudentOfferPage() {
  const [offer, setOffer] = useState<CourseOffer[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState("")

  async function reload() {
    const [offerData, enrollmentData] = await Promise.all([api.studentOffer(), api.studentEnrollments()])
    setOffer(offerData); setEnrollments(enrollmentData)
  }
  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])

  async function enroll(courseId: string, label: string) {
    if (!window.confirm(`¿Solicitar inscripción en ${label}?`)) return
    setError(""); setMessage(""); setEnrolling(courseId)
    try { await api.enrollInCourse(courseId); await reload(); setMessage("Inscripción confirmada. Revisa tus inscripciones y avisos.") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo realizar la inscripción.") }
    finally { setEnrolling("") }
  }

  if (loading) return <main className="simple-page"><p className="loading-copy">Cargando oferta académica…</p></main>
  return <main className="dashboard-page">
    <header className="topbar"><a className="small-brand" href="/">GA <span>Gestión Académica</span></a><AdminNavigation /></header>
    <section className="content-wrap"><span className="eyebrow">MI FORMACIÓN</span><h1>Oferta e inscripciones</h1>
      <p className="section-intro">Consulta la oferta de tu plan y solicita inscripción en los paralelos disponibles.</p>
      {error && <p role="alert" className="form-alert">{error}</p>}{message && <p role="status" className="success-note">{message}</p>}
      <div className="unit-list">{offer.length === 0 ? <section className="profile-card"><p>No hay oferta disponible para tu plan vigente.</p></section> : offer.map(({ curso, semestre_numero, semestre_nombre, cupos_disponibles, inscrito, prerrequisitos_pendientes }) => {
        const reasons: string[] = []
        if (!curso.activo) reasons.push("el paralelo está inactivo")
        if (!curso.inscripcion_abierta) reasons.push("la inscripción está cerrada")
        if (cupos_disponibles === 0) reasons.push("no hay cupos disponibles")
        if (prerrequisitos_pendientes.length > 0) reasons.push("faltan prerrequisitos")
        const label = `${curso.materia_codigo} — ${curso.materia_nombre}, paralelo ${curso.paralelo}`
        return <article className="profile-card unit-card" key={curso.id}>
          <h2>{label}</h2>
          <p>Semestre {semestre_numero}: {semestre_nombre} · {curso.plan_codigo} · {curso.periodo_denominacion} · {curso.fecha_inicio} a {curso.fecha_fin}</p>
          <p>Docente: {curso.docente_nombre ?? "Pendiente"} · Cupos disponibles: {cupos_disponibles}</p>
          <p>Inscripción {curso.inscripcion_abierta ? "abierta" : "cerrada"}</p>
          {prerrequisitos_pendientes.length > 0 && <p className="notice-box">Para inscribirte, primero debes aprobar: {prerrequisitos_pendientes.map((item) => `${item.codigo} — ${item.nombre}`).join(", ")} (nota mínima 51).</p>}
          {curso.horarios.map((schedule) => <p key={schedule.id}>{schedule.dia_semana}: {schedule.hora_inicio.slice(0, 5)}–{schedule.hora_fin.slice(0, 5)}{schedule.aula ? ` · ${schedule.aula}` : ""}</p>)}
          {inscrito ? <p className="success-note">Ya estás inscrito.</p> : <>
            {reasons.length > 0 && <p className="field-error" role="status">No puedes inscribirte: {reasons.join(", ")}.</p>}
            <button className="primary-button" disabled={reasons.length > 0 || enrolling === curso.id} title={reasons.length > 0 ? reasons.join(", ") : undefined} onClick={() => void enroll(curso.id, label)}>{enrolling === curso.id ? "Inscribiendo…" : "Solicitar inscripción"}</button>
          </>}
        </article>
      })}</div>
      <section className="profile-card assignments-card"><h2>Mis inscripciones</h2>{enrollments.length === 0 ? <p>Aún no tienes inscripciones.</p> : <ul className="prerequisite-list">{enrollments.map((item) => <li key={item.id}>{item.curso.materia_codigo} — {item.curso.materia_nombre}, paralelo {item.curso.paralelo} ({item.curso.periodo_denominacion}) · {item.estado}</li>)}</ul>}</section>
    </section>
  </main>
}
