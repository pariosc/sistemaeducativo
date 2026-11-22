import type { ReactNode } from "react"

import { AdminNavigation } from "../shared/AdminNavigation"
import "../shared/ui.css"
import "./curriculum.css"

const SECTIONS = [
  { id: "facultades", label: "Facultades", href: "/admin/facultades" },
  { id: "carreras", label: "Carreras", href: "/admin/carreras" },
  { id: "materias", label: "Materias", href: "/admin/materias" },
  { id: "planes", label: "Planes de estudio", href: "/admin/planes" },
] as const

export type CurriculumSection = (typeof SECTIONS)[number]["id"]

/**
 * Marco común de todas las pantallas de Currículo: barra lateral del sistema + selector de sección.
 * Los números 1-4 sugieren el orden natural de trabajo (cada paso se apoya en el anterior).
 */
export function CurriculumShell({ current, children }: { current: CurriculumSection; children: ReactNode }) {
  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap cx">
        <nav className="ui-section-nav" aria-label="Secciones de Currículo">
          {SECTIONS.map((section, index) => (
            <a key={section.id} className="ui-nav-link" href={section.href} aria-current={section.id === current ? "page" : undefined}>
              <span className="ui-nav-step" aria-hidden="true">{index + 1}</span>
              {section.label}
            </a>
          ))}
        </nav>
        {children}
      </section>
    </main>
  )
}
