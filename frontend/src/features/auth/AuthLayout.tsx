import type { ReactNode } from "react"

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="auth-brand-panel" aria-label="Gestión Académica">
        <div className="brand-mark" aria-hidden="true">GA</div>
        <div>
          <p className="brand-kicker">UPDS · LA PAZ</p>
          <h1>Gestión<br />Académica</h1>
          <p className="brand-description">Tu espacio para organizar y consultar la vida académica.</p>
        </div>
        <span className="brand-footer">Programación IV · 2026</span>
      </aside>
      <section className="auth-content">
        <div className="auth-card">{children}</div>
        <p className="auth-legal">Sistema Web de Gestión Académica</p>
      </section>
    </main>
  )
}
