import type { ReactNode } from "react"

import type { Role } from "../../api/client"
import { AdminNavigation } from "./AdminNavigation"
import "./ui.css"
import "./pages.css"

/** Marco común de Inicio, Consultas, Administración y Mi cuenta: barra lateral + contenido con el sistema de diseño. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap cx">{children}</section>
    </main>
  )
}

export function PageLoading({ children }: { children: ReactNode }) {
  return <p className="ap-loading" role="status">{children}</p>
}

const ROLE_LABEL: Record<Role, string> = { ADMINISTRADOR: "Administrador", DOCENTE: "Docente", ESTUDIANTE: "Estudiante" }

/** Etiqueta de rol (siempre con texto): principal, administrador, docente o estudiante. */
export function RoleChip({ rol, principal = false }: { rol: Role; principal?: boolean }) {
  const key = principal ? "principal" : rol === "ADMINISTRADOR" ? "admin" : rol === "DOCENTE" ? "docente" : "estudiante"
  return <span className={`ap-role ap-role--${key}`}>{principal ? "Administrador principal" : ROLE_LABEL[rol]}</span>
}
