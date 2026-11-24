import { useEffect, useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type { PlanningRoom, PlanningShift, ScheduleBlock } from "../../api/client"
import { Field, Notices, PageHeader } from "../shared/ui"
import { PlanningShell } from "./PlanningShell"
import "./planning.css"

const shifts: { value: PlanningShift; label: string }[] = [
  { value: "MADRUGADA", label: "Madrugada" }, { value: "MANANA", label: "Mañana" },
  { value: "TARDE", label: "Tarde" }, { value: "NOCHE", label: "Noche" },
]

export function PlanningResourcesPage() {
  const [rooms, setRooms] = useState<PlanningRoom[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [roomCode, setRoomCode] = useState("")
  const [shift, setShift] = useState<PlanningShift>("MANANA")
  const [blockName, setBlockName] = useState("")
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [start, setStart] = useState("08:00")
  const [end, setEnd] = useState("10:00")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [roomData, blockData] = await Promise.all([api.listPlanningRooms(), api.listScheduleBlocks()])
    setRooms(roomData)
    setBlocks(blockData)
  }
  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)) }, [])

  async function save(event: FormEvent, action: () => Promise<unknown>, message: string) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("")
    try { await action(); await reload(); setNotice(message) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la configuración.") }
    finally { setBusy(false) }
  }

  return (
    <PlanningShell current="recursos">
      <Notices notice={notice} error={error} />
      <PageHeader eyebrow="PLANIFICACIÓN ACADÉMICA" title="Aulas y turnos" description="Administra los códigos de aula y las franjas reutilizables para programar los paralelos. Las horas ya asignadas se conservan aunque cambie una plantilla." />
      <div className="pl-resource-grid">
        <section className="ui-card pl-resource-card" aria-labelledby="rooms-title">
          <div><h2 id="rooms-title">Aulas</h2><p className="ui-text-muted">Registra el código que aparece en el campus, por ejemplo 101 o 204.</p></div>
          <form onSubmit={(event) => void save(event, () => api.createPlanningRoom(roomCode.trim()), `Aula ${roomCode.trim().toUpperCase()} agregada.`)}>
            <Field id="room-code" label="Código del aula"><input id="room-code" className="ui-input" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9 -]*" required /></Field>
            <button className="ui-btn ui-btn-primary" disabled={busy}>Agregar aula</button>
          </form>
          <ul className="pl-resource-list">
            {rooms.map((room) => <li key={room.codigo}><strong>{room.codigo}</strong><span>{room.activa ? "Activa" : "Inactiva"}</span><button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => { setBusy(true); void api.updatePlanningRoom(room.codigo, !room.activa).then(reload).then(() => setNotice(`Aula ${room.codigo} ${room.activa ? "inactivada" : "activada"}.`)).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)) }}>{room.activa ? "Inactivar" : "Activar"}</button></li>)}
            {rooms.length === 0 && <li className="ui-text-muted">Aún no hay aulas registradas.</li>}
          </ul>
        </section>

        <section className="ui-card pl-resource-card" aria-labelledby="blocks-title">
          <div><h2 id="blocks-title">Turnos y bloques</h2><p className="ui-text-muted">Define franjas por turno. Las plantillas facilitan la captura; no modifican horarios guardados.</p></div>
          <form onSubmit={(event) => void save(event, () => editingBlockId
            ? api.updateScheduleBlock(editingBlockId, { turno: shift, nombre: blockName.trim(), hora_inicio: start, hora_fin: end })
            : api.createScheduleBlock({ turno: shift, nombre: blockName.trim(), hora_inicio: start, hora_fin: end }), editingBlockId ? "Bloque horario actualizado." : "Bloque horario agregado.") }>
            <div className="pl-form-row">
              <Field id="block-shift" label="Turno"><select id="block-shift" className="ui-select" value={shift} onChange={(event) => setShift(event.target.value as PlanningShift)}>{shifts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
              <Field id="block-name" label="Nombre de la franja"><input id="block-name" className="ui-input" value={blockName} onChange={(event) => setBlockName(event.target.value)} maxLength={48} required placeholder="Ej. Bloque 1" /></Field>
            </div>
            <div className="pl-form-row">
              <Field id="block-start" label="Desde"><input id="block-start" className="ui-input" type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></Field>
              <Field id="block-end" label="Hasta"><input id="block-end" className="ui-input" type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /></Field>
            </div>
            <div className="ui-page-header-actions"><button className="ui-btn ui-btn-primary" disabled={busy}>{editingBlockId ? "Guardar franja" : "Agregar franja"}</button>{editingBlockId && <button type="button" className="ui-btn ui-btn-secondary" onClick={() => { setEditingBlockId(null); setBlockName("") }}>Cancelar edición</button>}</div>
          </form>
          <ul className="pl-resource-list">
            {blocks.map((block) => <li key={block.id}><strong>{shifts.find((item) => item.value === block.turno)?.label} · {block.nombre}</strong><span>{block.hora_inicio.slice(0, 5)}–{block.hora_fin.slice(0, 5)} · {block.activo ? "Activo" : "Inactivo"}</span><div className="pl-resource-actions"><button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => { setEditingBlockId(block.id); setShift(block.turno); setBlockName(block.nombre); setStart(block.hora_inicio.slice(0, 5)); setEnd(block.hora_fin.slice(0, 5)) }}>Editar</button><button className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => { setBusy(true); void api.updateScheduleBlock(block.id, { activo: !block.activo }).then(reload).then(() => setNotice(`Franja ${block.nombre} ${block.activo ? "inactivada" : "activada"}.`)).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)) }}>{block.activo ? "Inactivar" : "Activar"}</button></div></li>)}
            {blocks.length === 0 && <li className="ui-text-muted">Aún no hay franjas configuradas.</li>}
          </ul>
        </section>
      </div>
    </PlanningShell>
  )
}
