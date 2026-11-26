import { useState } from "react"

import { useAuth } from "../auth/AuthContext"
import { Icon } from "./icons"
import { ThemeToggle } from "./ThemeToggle"

type Entry = { label: string; href: string }

function SidebarGroup({ title, entries }: { title: string; entries: Entry[] }) {
  const activePath = window.location.pathname
  const containsActivePage = entries.some((entry) => entry.href === activePath)
  return (
    <details className="sidebar-group" open={containsActivePage}>
      <summary>{title}</summary>
      <div className="sidebar-group-links">
        {entries.map((entry) => (
          <a
            className="sidebar-link"
            href={entry.href}
            key={entry.href}
            aria-current={entry.href === activePath ? "page" : undefined}
          >
            {entry.label}
          </a>
        ))}
      </div>
    </details>
  )
}

export function AdminNavigation() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem("academico-sidebar-open")
      if (saved !== null) return saved === "true"
    } catch { /* La navegación sigue funcionando si el almacenamiento está bloqueado. */ }
    return !window.matchMedia("(max-width: 780px)").matches
  })

  function toggleMenu() {
    setMenuOpen((current) => {
      const next = !current
      try { window.sessionStorage.setItem("academico-sidebar-open", String(next)) } catch { /* Estado local suficiente. */ }
      return next
    })
  }
  const role = user?.rol
  const groups: { title: string; entries: Entry[] }[] = role === "ADMINISTRADOR"
    ? [
        { title: "Inicio", entries: [{ label: "Panel principal", href: "/dashboard" }] },
        { title: "Currículo", entries: [
          { label: "Facultades", href: "/admin/facultades" },
          { label: "Carreras", href: "/admin/carreras" },
          { label: "Materias", href: "/admin/materias" },
          { label: "Planes de estudio", href: "/admin/planes" },
        ] },
        { title: "Planificación académica", entries: [
          { label: "Planificar semestre", href: "/admin/periodos" },
          { label: "Oferta y paralelos", href: "/admin/paralelos" },
          { label: "Aulas y turnos", href: "/admin/planificacion-config" },
          { label: "Habilitaciones", href: "/admin/habilitaciones" },
        ] },
        { title: "Consultas", entries: [{ label: "Reportes", href: "/reportes" }] },
        { title: "Administración", entries: [{ label: "Usuarios", href: "/admin/usuarios" }] },
      ]
    : role === "DOCENTE"
      ? [
          { title: "Inicio", entries: [{ label: "Panel principal", href: "/dashboard" }] },
          { title: "Docencia", entries: [{ label: "Calificaciones", href: "/docente/calificaciones" }] },
          { title: "Consultas", entries: [{ label: "Reportes", href: "/reportes" }] },
        ]
      : [
          { title: "Inicio", entries: [{ label: "Panel principal", href: "/dashboard" }] },
          { title: "Inscripción", entries: [{ label: "Oferta y mis inscripciones", href: "/estudiante/oferta" }] },
          { title: "Trayectoria académica", entries: [
            { label: "Mis calificaciones", href: "/estudiante/calificaciones" },
            { label: "Reportes", href: "/reportes" },
          ] },
        ]

  return (
    <>
      <button type="button" className="sidebar-toggle" onClick={toggleMenu} aria-controls="admin-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? "Ocultar menú lateral" : "Mostrar menú lateral"} title={menuOpen ? "Ocultar menú" : "Mostrar menú"}>
        <Icon name="menu" size={22} />
      </button>
      <aside className="admin-sidebar" id="admin-navigation" data-collapsed={String(!menuOpen)}>
        <nav className="sidebar-menu" aria-label="Navegación principal">
          <p className="sidebar-caption">MENÚ PRINCIPAL</p>
          {groups.map((group) => <SidebarGroup key={group.title} {...group} />)}
          <SidebarGroup title="Mi cuenta" entries={[{ label: "Perfil", href: "/perfil" }]} />
        </nav>
        <div className="sidebar-actions">
          <ThemeToggle />
          <button
            className="sidebar-logout"
            onClick={() => void logout().then(() => { window.location.href = "/login" })}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  )
}
