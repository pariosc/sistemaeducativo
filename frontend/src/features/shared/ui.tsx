import type { ReactNode, RefObject } from "react"

import { Icon } from "./icons"
import type { IconName } from "./icons"
import { Modal } from "./Modal"
import "./ui.css"

/* Componentes de interfaz compartidos. Úsalos en todas las pantallas para mantener consistencia. */

export function PageHeader({ eyebrow, title, description, actions, headingRef }: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  headingRef?: RefObject<HTMLHeadingElement | null>
}) {
  return (
    <div className="ui-page-header">
      <div className="ui-page-header-text">
        <span className="ui-eyebrow">{eyebrow}</span>
        <h1 ref={headingRef} tabIndex={-1} className="ui-heading-focus">{title}</h1>
        {description && <p className="ui-lead">{description}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </div>
  )
}

/** Avisos de la página: éxito (se anuncia con cortesía) y error (se anuncia de inmediato). */
export function Notices({ notice, error }: { notice: string; error: string }) {
  return (
    <>
      <div role="status" aria-live="polite">{notice && <p className="ui-alert ui-alert-success">{notice}</p>}</div>
      <div role="alert">{error && <p className="ui-alert ui-alert-error">{error}</p>}</div>
    </>
  )
}

export function DialogError({ error }: { error: string }) {
  return error ? <p role="alert" className="ui-alert ui-alert-error ui-alert-flush">{error}</p> : null
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="ui-field-hint">{hint}</p>}
    </div>
  )
}

export function ButtonLabel({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return <>{icon && <Icon name={icon} />}<span>{children}</span></>
}

/** Pie de formulario: "Cancelar" + acción principal. Verde para confirmar, rojo si es destructiva. */
export function FormActions({ busy, onClose, submitLabel, danger = false, focusCancel = false, icon }: {
  busy: boolean
  onClose: () => void
  submitLabel: string
  danger?: boolean
  focusCancel?: boolean
  icon?: IconName
}) {
  return (
    <div className="ui-modal-actions">
      <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={busy} data-autofocus={focusCancel ? "" : undefined}>Cancelar</button>
      <button type="submit" className={danger ? "ui-btn ui-btn-danger" : "ui-btn ui-btn-primary"} disabled={busy}>
        {busy ? "Guardando…" : <ButtonLabel icon={icon}>{submitLabel}</ButtonLabel>}
      </button>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel, busy, error, onClose, onConfirm, danger = true }: {
  title: string
  message: string
  confirmLabel: string
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
  danger?: boolean
}) {
  return (
    <Modal title={title} description={message} onClose={onClose} locked={busy} tone={danger ? "danger" : "default"}>
      <form onSubmit={(event) => { event.preventDefault(); onConfirm() }}>
        <DialogError error={error} />
        <FormActions busy={busy} onClose={onClose} submitLabel={confirmLabel} danger={danger} focusCancel icon={danger ? "trash" : "check"} />
      </form>
    </Modal>
  )
}

/** Etiqueta de estado: siempre texto + color (nunca solo color). */
export function StatusBadge({ tone, children }: { tone: "green" | "amber" | "gray"; children: ReactNode }) {
  return <span className={`ui-badge ui-badge-${tone}`}><span className="ui-badge-dot" aria-hidden="true" />{children}</span>
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-icon"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}
