import type { ReactNode } from "react"

import { AdminNavigation } from "../shared/AdminNavigation"
import "../shared/ui.css"
import "../curriculum/curriculum.css" /* estilos compartidos del selector de sección y de la carga */
import "./planning.css"

const STEPS = [
  { id: "periodos", label: "Semestre académico", href: "/admin/periodos" },
  { id: "paralelos", label: "Oferta y paralelos", href: "/admin/paralelos" },
  { id: "recursos", label: "Aulas y turnos", href: "/admin/planificacion-config" },
  { id: "habilitaciones", label: "Habilitaciones", href: "/admin/habilitaciones" },
] as const

export type PlanningSection = (typeof STEPS)[number]["id"] | "habilitaciones"

/**
 * Marco de Planificación académica. Los pasos 2 y 3 conservan el semestre elegido
 * (?periodo_id=) para no tener que volver a seleccionarlo.
 */
export function PlanningShell({ current, periodId, children }: { current: PlanningSection; periodId?: string; children: ReactNode }) {
  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap cx">
        <nav className="ui-section-nav" aria-label="Pasos de la planificación académica">
          {STEPS.map((step, index) => (
            <a
              key={step.id}
              className="ui-nav-link"
              href={index > 0 && periodId ? `${step.href}?periodo_id=${periodId}` : step.href}
              aria-current={step.id === current ? "page" : undefined}
            >
              <span className="ui-nav-step" aria-hidden="true">{index + 1}</span>
              {step.label}
            </a>
          ))}
        </nav>
        {children}
      </section>
    </main>
  )
}
