import { useEffect, useState } from "react"

import { api, type AcademicNotification, type DashboardData } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AdminNavigation } from "../shared/AdminNavigation"

const links: Record<string, { label: string; href: string }[]> = {
  ADMINISTRADOR: [
    { label: "Usuarios", href: "/admin/usuarios" }, { label: "Currículo", href: "/admin/planes" },
    { label: "Periodos", href: "/admin/periodos" }, { label: "Paralelos", href: "/admin/paralelos" },
    { label: "Habilitaciones", href: "/admin/habilitaciones" }, { label: "Reportes", href: "/reportes" },
  ],
  DOCENTE: [{ label: "Calificaciones", href: "/docente/calificaciones" }, { label: "Reportes", href: "/reportes" }],
  ESTUDIANTE: [
    { label: "Oferta e inscripciones", href: "/estudiante/oferta" },
    { label: "Mis calificaciones", href: "/estudiante/calificaciones" }, { label: "Reportes", href: "/reportes" },
  ],
}

export function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [notifications, setNotifications] = useState<AcademicNotification[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  async function reload() {
    const [dashboard, notices] = await Promise.all([api.dashboard(), api.listNotifications()])
    setData(dashboard); setNotifications(notices)
  }
  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])

  async function markRead(noticeId: string) {
    try {
      await api.markNotificationRead(noticeId)
      setNotifications((current) => current.map((item) => item.id === noticeId ? { ...item, leida: true } : item))
      setData((current) => current ? { ...current, notificaciones_pendientes: Math.max(0, current.notificaciones_pendientes - 1) } : current)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar el aviso.") }
  }

  if (loading) return <main className="simple-page"><p className="loading-copy">Cargando panel…</p></main>
  return <main className="dashboard-page">
    <header className="topbar"><a className="small-brand" href="/">GA <span>Gestión Académica</span></a><AdminNavigation /></header>
    <section className="content-wrap"><span className="eyebrow">PANEL PRINCIPAL</span><h1>Hola, {user?.nombres}</h1>
      <p className="section-intro">Resumen académico y actividad reciente de tu cuenta.</p>
      {error && <p role="alert" className="form-alert">{error}</p>}
      {data && <>
        <div className="dashboard-metrics">{data.indicadores.map((metric) => <article className="dashboard-metric" key={metric.clave}><span>{metric.etiqueta}</span><strong>{metric.valor}</strong></article>)}</div>
        <section className="dashboard-links" aria-label="Accesos rápidos">{links[data.rol].map((link) => <a className="dashboard-shortcut" key={link.href} href={link.href}>{link.label}<span aria-hidden="true">↗</span></a>)}</section>
        <div className="dashboard-columns">
          <section className="profile-card"><h2>Actividad reciente</h2>{data.actividad.length === 0 ? <p>Aún no hay actividad académica para mostrar.</p> : <ul className="activity-list">{data.actividad.map((item, index) => <li key={`${item.tipo}-${item.fecha}-${index}`}>
            <span className="activity-dot" aria-hidden="true"/><div><p>{item.mensaje}</p><time dateTime={item.fecha}>{new Date(item.fecha).toLocaleString()}</time></div>
          </li>)}</ul>}</section>
          <section className="profile-card"><div className="unit-card-heading"><h2>Avisos</h2><span className="role-badge">{data.notificaciones_pendientes} sin leer</span></div>
            {notifications.length === 0 ? <p>No tienes avisos.</p> : <ul className="notification-list">{notifications.map((notice) => <li className={notice.leida ? "notification-read" : "notification-unread"} key={notice.id}>
              <div><strong>{notice.titulo}</strong><p>{notice.mensaje}</p><time dateTime={notice.fecha_creacion}>{new Date(notice.fecha_creacion).toLocaleString()}</time></div>
              {!notice.leida && <button className="text-action" onClick={() => void markRead(notice.id)}>Marcar leída</button>}
            </li>)}</ul>}
          </section>
        </div>
      </>}
    </section>
  </main>
}
