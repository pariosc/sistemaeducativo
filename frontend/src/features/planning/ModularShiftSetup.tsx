import { useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type { PlanningShift, ScheduleBlock } from "../../api/client"

const shiftNames: Record<PlanningShift, string> = {
  MADRUGADA: "madrugada",
  MANANA: "mañana",
  TARDE: "tarde",
  NOCHE: "noche",
}

function minutesBetween(start: string, end: string): number {
  return (Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5))) -
    (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)))
}

function endTime(start: string, duration: number): string | null {
  if (!/^\d{2}:\d{2}$/.test(start)) return null
  const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + duration
  if (total > 23 * 60 + 59) return null
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

export function ModularShiftSetup({ shift, duration, blocks, onConfigured }: {
  shift: PlanningShift
  duration: number
  blocks: ScheduleBlock[]
  onConfigured: () => Promise<void>
}) {
  const [start, setStart] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const compatible = blocks.filter((block) => block.activo && block.turno === shift && minutesBetween(block.hora_inicio, block.hora_fin) === duration)
  const chosenId = selectedId || compatible[0]?.id || ""
  const end = endTime(start, duration)

  async function configure(action: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await action()
      await onConfigured()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el horario del turno.")
    } finally {
      setBusy(false)
    }
  }

  function create(event: FormEvent) {
    event.preventDefault()
    if (!end || busy) return
    void configure(() => api.createScheduleBlock({
      turno: shift,
      nombre: `Modular ${start}-${end}`,
      hora_inicio: start,
      hora_fin: end,
      predeterminado_modular: true,
    }))
  }

  return <div className="ui-alert ui-alert-info pl-shift-setup">
    <strong>Falta definir el horario del turno {shiftNames[shift]}.</strong>
    <p>Una franja horaria indica a qué hora empieza y termina cada clase. La plantilla de este semestre pide {duration / 60} horas por día. Configúrala aquí para continuar sin perder las materias y asignaciones que ya elegiste.</p>
    {compatible.length > 0 && <div className="pl-shift-setup-row">
      <label>Usar un horario existente
        <select className="ui-select" value={chosenId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
          {compatible.map((block) => <option key={block.id} value={block.id}>{block.nombre} · {block.hora_inicio.slice(0, 5)}–{block.hora_fin.slice(0, 5)}</option>)}
        </select>
      </label>
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || !chosenId} onClick={() => void configure(() => api.updateScheduleBlock(chosenId, { predeterminado_modular: true }))}>Usar este horario</button>
    </div>}
    <form className="pl-shift-setup-row" onSubmit={create}>
      <label>O crear un horario: hora de inicio
        <input className="ui-input" type="time" value={start} onChange={(event) => setStart(event.target.value)} disabled={busy} required />
      </label>
      <span>Hora de fin: <strong>{end ?? "—"}</strong></span>
      <button type="submit" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || !end}>{busy ? "Guardando…" : "Guardar horario del turno"}</button>
    </form>
    {start && !end && <p role="alert">Elige una hora de inicio que permita terminar la clase antes de medianoche.</p>}
    {error && <p className="ui-alert ui-alert-error" role="alert">{error}</p>}
  </div>
}
