import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { AcademicNotification, DashboardData } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AppShell, PageLoading } from "../shared/AppShell"
import { Icon } from "../shared/icons"
import type { IconName } from "../shared/icons"
import { ButtonLabel, EmptyState, Notices, StatusBadge } from "../shared/ui"

type Shortcut = { label: string; href: string; icon: IconName; hint: string }

// Mismos accesos y destinos por rol que antes; se añade un ícono y una frase de ayuda a cada uno.
const links: Record<string, Shortcut[]> = {
  ADMINISTRADOR: [
    { label: "Usuarios", href: "/admin/usuarios", icon: "users", hint: "Crea y administra las cuentas" },
    { label: "Currículo", href: "/admin/planes", icon: "layers", hint: "Facultades, carreras, materias y planes" },
    { label: "Periodos", href: "/admin/periodos", icon: "calendar", hint: "Planifica el semestre y su calendario" },
    { label: "Paralelos", href: "/admin/paralelos", icon: "columns", hint: "Programa la oferta del semestre" },
    { label: "Habilitaciones", href: "/admin/habilitaciones", icon: "shield", hint: "Autoriza a los estudiantes a inscribirse" },
    { label: "Reportes", href: "/reportes", icon: "chart", hint: "Descarga reportes en PDF o Excel" },
  ],
  DOCENTE: [
    { label: "Calificaciones", href: "/docente/calificaciones", icon: "clipboard", hint: "Registra las notas de tus paralelos" },
    { label: "Reportes", href: "/reportes", icon: "chart", hint: "Descarga reportes en PDF o Excel" },
  ],
  ESTUDIANTE: [
    { label: "Oferta e inscripciones", href: "/estudiante/oferta", icon: "columns", hint: "Consulta la oferta e inscríbete" },
    { label: "Mis calificaciones", href: "/estudiante/calificaciones", icon: "award", hint: "Revisa tus notas finales" },
    { label: "Reportes", href: "/reportes", icon: "chart", hint: "Descarga tu información en PDF o Excel" },
  ],
}

const ROLE_LABEL: Record<string, string> = { ADMINISTRADOR: "Administrador", DOCENTE: "Docente", ESTUDIANTE: "Estudiante" }

function todayLabel() {
  const text = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })
  return text.charAt(0).toUpperCase() + text.slice(1)
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

  if (loading) return <AppShell><PageLoading>Cargando panel…</PageLoading></AppShell>

  return (
    <AppShell>
      <Notices notice="" error={error} />
      <header className="hm-hero">
        <div>
          <span className="hm-hero-eyebrow">PANEL PRINCIPAL</span>
          <h1>Hola, {user?.nombres}</h1>
          <p>Resumen académico y actividad reciente de tu cuenta.</p>
        </div>
        <p className="hm-date"><Icon name="calendar" size={18} />{todayLabel()}{user ? ` · ${user.es_administrador_principal ? "Administrador principal" : ROLE_LABEL[user.rol]}` : ""}</p>
      </header>

      {data && (
        <>
          <section aria-labelledby="hm-metrics-title">
            <h2 id="hm-metrics-title" className="ui-visually-hidden">Indicadores</h2>
            <dl className="hm-metrics">
              {data.indicadores.map((metric, index) => (
                <div className="hm-metric" data-accent={index % 4} key={metric.clave}>
                  <dt>{metric.etiqueta}</dt>
                  <dd>{metric.valor}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="hm-section" aria-labelledby="hm-links-title">
            <h2 id="hm-links-title">Accesos rápidos</h2>
            <ul className="hm-shortcuts">
              {links[data.rol].map((link) => (
                <li key={link.href}>
                  <a className="hm-shortcut" href={link.href}>
                    <span className="hm-shortcut-icon"><Icon name={link.icon} size={22} /></span>
                    <span className="hm-shortcut-text"><strong>{link.label}</strong><small>{link.hint}</small></span>
                    <Icon name="arrow" size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <div className="hm-columns hm-section">
            <section className="ui-card hm-panel" aria-labelledby="hm-activity-title">
              <div className="hm-panel-head"><h2 id="hm-activity-title">Actividad reciente</h2></div>
              {data.actividad.length === 0 ? (
                <EmptyState icon="clock" title="Aún no hay actividad">Cuando haya movimientos académicos en tu cuenta aparecerán aquí.</EmptyState>
              ) : (
                <ul className="hm-timeline">
                  {data.actividad.map((item, index) => (
                    <li key={`${item.tipo}-${item.fecha}-${index}`}>
                      <span className="hm-dot" aria-hidden="true" />
                      <div><p>{item.mensaje}</p><time dateTime={item.fecha}>{new Date(item.fecha).toLocaleString()}</time></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ui-card hm-panel" aria-labelledby="hm-notices-title">
              <div className="hm-panel-head">
                <h2 id="hm-notices-title">Avisos</h2>
                <StatusBadge tone={data.notificaciones_pendientes > 0 ? "amber" : "gray"}>{data.notificaciones_pendientes} sin leer</StatusBadge>
              </div>
              {notifications.length === 0 ? (
                <EmptyState icon="bell" title="No tienes avisos">Los avisos de inscripciones y cambios de horario llegarán aquí.</EmptyState>
              ) : (
                <ul className="hm-notices">
                  {notifications.map((notice) => (
                    <li className={notice.leida ? "hm-notice hm-notice--read" : "hm-notice hm-notice--unread"} key={notice.id}>
                      <div>
                        <strong>{!notice.leida && <span className="hm-new">Nuevo</span>}{notice.titulo}</strong>
                        <p>{notice.mensaje}</p>
                        <time dateTime={notice.fecha_creacion}>{new Date(notice.fecha_creacion).toLocaleString()}</time>
                      </div>
                      {!notice.leida && (
                        <button type="button" className="ui-btn ui-btn-quiet" aria-label={`Marcar como leído: ${notice.titulo}`} onClick={() => void markRead(notice.id)}>
                          <ButtonLabel icon="check">Marcar leída</ButtonLabel>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </AppShell>
  )
}
