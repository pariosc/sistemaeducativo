import { useEffect, useId, useRef } from "react"
import type { ReactNode } from "react"

import "./ui.css"

interface ModalProps {
  title: string
  description?: string
  onClose: () => void
  /** Mientras es true (p. ej. guardando) la ventana no se puede cerrar con Esc ni con la X. */
  locked?: boolean
  /** "danger" tiñe de rojo el borde superior: avisa visualmente de una acción destructiva. */
  tone?: "default" | "danger"
  children: ReactNode
}

/**
 * Ventana modal accesible basada en el <dialog> nativo:
 *  - showModal() atrapa el foco y deja inerte el resto de la página.
 *  - Esc la cierra (salvo que `locked` sea true).
 *  - Al cerrarse devuelve el foco al elemento que la abrió.
 *  - Para elegir qué recibe el foco al abrir, marca el elemento con `data-autofocus`.
 *
 * Se monta cuando hay que mostrarla y se desmonta al cerrarla; así los
 * formularios internos siempre empiezan limpios.
 */
export function Modal({ title, description, onClose, locked = false, tone = "default", children }: ModalProps) {
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
      className={tone === "danger" ? "ui-modal ui-modal--danger" : "ui-modal"}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { if (locked) event.preventDefault() }}
      onClose={(event) => {
        // Ignora los eventos "close" que provoca nuestra propia limpieza (p. ej. el doble montaje de
        // React.StrictMode en desarrollo); solo cuenta el cierre real (Esc, X o Cancelar).
        if (alive.current && !event.currentTarget.open) onClose()
      }}
    >
      <div className="ui-modal-body">
        <div className="ui-modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ui-icon-button" aria-label="Cerrar ventana" disabled={locked} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {description && <p id={descriptionId} className="ui-modal-description">{description}</p>}
        {children}
      </div>
    </dialog>
  )
}
