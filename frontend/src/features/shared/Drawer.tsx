import { useEffect, useId, useRef } from "react"
import type { ReactNode } from "react"

import "./ui.css"

interface DrawerProps {
  title: string
  description?: string
  onClose: () => void
  /** Mientras es true (p. ej. guardando) el panel no se puede cerrar con Esc, la X ni el fondo. */
  locked?: boolean
  children: ReactNode
  /** Acciones fijas al pie del panel. */
  footer?: ReactNode
}

/**
 * Panel lateral accesible basado en el <dialog> nativo, igual que Modal:
 *  - showModal() atrapa el foco y deja inerte el resto de la página.
 *  - Esc lo cierra (salvo que `locked` sea true).
 *  - Clic en el fondo lo cierra (salvo que `locked` sea true).
 *  - Al cerrarse devuelve el foco al elemento que lo abrió.
 *  - Para elegir qué recibe el foco al abrir, marca el elemento con `data-autofocus`.
 *
 * Se monta cuando hay que mostrarlo y se desmonta al cerrarlo; así los
 * formularios internos siempre empiezan limpios.
 */
export function Drawer({ title, description, onClose, locked = false, children, footer }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const alive = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    alive.current = true
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    return () => {
      alive.current = false
      if (dialog.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className="ui-drawer"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { if (locked) event.preventDefault() }}
      onClick={(event) => { if (!locked && event.target === event.currentTarget) onClose() }}
      onClose={(event) => {
        // Ignora los eventos "close" que provoca nuestra propia limpieza (p. ej. el doble montaje de
        // React.StrictMode en desarrollo); solo cuenta el cierre real (Esc, X o clic en el fondo).
        if (alive.current && !event.currentTarget.open) onClose()
      }}
    >
      <div className="ui-drawer-panel">
        <div className="ui-drawer-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId} className="ui-drawer-description">{description}</p>}
          </div>
          <button type="button" className="ui-icon-button" aria-label="Cerrar panel" disabled={locked} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="ui-drawer-body">{children}</div>
        {footer && <div className="ui-drawer-footer">{footer}</div>}
      </div>
    </dialog>
  )
}
