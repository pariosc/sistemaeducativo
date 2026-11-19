import { useAuth } from "../auth/AuthContext"

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
    <aside className="admin-sidebar">
      <nav className="sidebar-menu" aria-label="Navegación principal">
        <p className="sidebar-caption">MENÚ PRINCIPAL</p>
        {groups.map((group) => <SidebarGroup key={group.title} {...group} />)}
        <SidebarGroup title="Mi cuenta" entries={[{ label: "Perfil", href: "/perfil" }]} />
      </nav>
      <button
        className="sidebar-logout"
        onClick={() => void logout().then(() => { window.location.href = "/login" })}
      >
        Cerrar sesión
      </button>
    </aside>
  )
}
