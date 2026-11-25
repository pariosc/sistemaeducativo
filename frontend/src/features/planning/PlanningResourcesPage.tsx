import { useEffect, useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type { ModularTemplate, PlanningRoom, PlanningShift, ScheduleBlock } from "../../api/client"
import { Drawer } from "../shared/Drawer"
import { ButtonLabel, Field, Notices, PageHeader } from "../shared/ui"
import { PlanningShell } from "./PlanningShell"
import { Tabs } from "./Tabs"
import "./planning.css"

type Section = "rooms" | "blocks" | "templates"

const SECTIONS: { id: Section; label: string }[] = [
  { id: "rooms", label: "Aulas" }, { id: "blocks", label: "Turnos y franjas" }, { id: "templates", label: "Plantillas modulares" },
]

const shifts: { value: PlanningShift; label: string }[] = [
  { value: "MADRUGADA", label: "Madrugada" }, { value: "MANANA", label: "Mañana" },
  { value: "TARDE", label: "Tarde" }, { value: "NOCHE", label: "Noche" },
]

export function PlanningResourcesPage() {
  const [rooms, setRooms] = useState<PlanningRoom[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [templates, setTemplates] = useState<ModularTemplate[]>([])
  const [section, setSection] = useState<Section>("rooms")
  const [drawer, setDrawer] = useState<Section | null>(null)
  const [roomCode, setRoomCode] = useState("")
  const [roomCapacity, setRoomCapacity] = useState("")
  const [editingRoomCode, setEditingRoomCode] = useState<string | null>(null)
  const [shift, setShift] = useState<PlanningShift>("MANANA")
  const [blockName, setBlockName] = useState("")
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [start, setStart] = useState("08:00")
  const [end, setEnd] = useState("10:00")
  const [modularDefault, setModularDefault] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState("")
  const [templateClasses, setTemplateClasses] = useState(21)
  const [templateHours, setTemplateHours] = useState(3)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [roomData, blockData, templateData] = await Promise.all([api.listPlanningRooms(), api.listScheduleBlocks(), api.listModularTemplates()])
    setRooms(roomData)
    setBlocks(blockData)
    setTemplates(templateData)
  }
  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)) }, [])

  async function save(event: FormEvent, action: () => Promise<unknown>, message: string) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("")
    try { await action(); await reload(); setNotice(message); setDrawer(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la configuración.") }
    finally { setBusy(false) }
  }

  function openRoom(room?: PlanningRoom) {
    setEditingRoomCode(room?.codigo ?? null)
    setRoomCode(room?.codigo ?? "")
    setRoomCapacity(room?.capacidad?.toString() ?? "")
    setDrawer("rooms")
  }
  function openBlock(block?: ScheduleBlock) {
    setEditingBlockId(block?.id ?? null)
    setShift(block?.turno ?? "MANANA")
    setBlockName(block?.nombre ?? "")
    setStart(block?.hora_inicio.slice(0, 5) ?? "08:00")
    setEnd(block?.hora_fin.slice(0, 5) ?? "10:00")
    setModularDefault(block?.predeterminado_modular ?? false)
    setDrawer("blocks")
  }
  function openTemplate(template?: ModularTemplate) {
    setEditingTemplateId(template?.id ?? null)
    setTemplateName(template?.nombre ?? "")
    setTemplateClasses(template?.clases_por_modulo ?? 21)
    setTemplateHours(template ? template.minutos_por_clase / 60 : 3)
    setDrawer("templates")
  }

  const action = section === "rooms"
    ? { label: "Nueva aula", onClick: () => openRoom() }
    : section === "blocks"
      ? { label: "Nueva franja", onClick: () => openBlock() }
      : { label: "Nueva plantilla", onClick: () => openTemplate() }

  return (
    <PlanningShell current="recursos">
      <Notices notice={notice} error={error} />
      <PageHeader
        eyebrow="PLANIFICACIÓN ACADÉMICA"
        title="Aulas y turnos"
        description="Administra los códigos de aula, las franjas reutilizables y las plantillas modulares. Las horas ya asignadas se conservan aunque cambie una plantilla."
        actions={<button type="button" className="ui-btn ui-btn-primary" onClick={action.onClick}><ButtonLabel icon="plus">{action.label}</ButtonLabel></button>}
      />
      <Tabs items={SECTIONS} active={section} onChange={setSection} label="Configuración de planificación" idPrefix="res" />

      {section === "rooms" && (
        <div role="tabpanel" id="res-panel-rooms" aria-labelledby="res-rooms" className="pl-tabpanel" tabIndex={0}>
          <p className="pl-lead">Registra el código del campus y la cantidad física de asientos. El cupo de cada paralelo puede ser menor.</p>
          {rooms.length === 0 ? (
            <p className="ui-text-muted">Aún no hay aulas registradas.</p>
          ) : (
            <div className="pl-table-scroll"><table className="pl-data-table">
              <caption>Aulas registradas ({rooms.length})</caption>
              <thead><tr><th scope="col">Código</th><th scope="col">Capacidad</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>{rooms.map((room) => (
                <tr key={room.codigo}>
                  <td><strong>{room.codigo}</strong></td>
                  <td className={room.capacidad === null ? "pl-warn" : ""}>{room.capacidad === null ? "Capacidad pendiente" : `${room.capacidad} asientos`}</td>
                  <td>{room.activa ? "Activa" : "Inactiva"}</td>
                  <td><div className="pl-resource-actions">
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => openRoom(room)}>{room.capacidad === null ? "Definir capacidad" : "Editar capacidad"}</button>
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => { setBusy(true); void api.updatePlanningRoom(room.codigo, { activa: !room.activa }).then(reload).then(() => setNotice(`Aula ${room.codigo} ${room.activa ? "inactivada" : "activada"}.`)).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)) }}>{room.activa ? "Inactivar" : "Activar"}</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {section === "blocks" && (
        <div role="tabpanel" id="res-panel-blocks" aria-labelledby="res-blocks" className="pl-tabpanel" tabIndex={0}>
          <p className="pl-lead">Define franjas por turno. Las plantillas facilitan la captura; no modifican horarios guardados.</p>
          {blocks.length === 0 ? (
            <p className="ui-text-muted">Aún no hay franjas configuradas.</p>
          ) : (
            <div className="pl-table-scroll"><table className="pl-data-table">
              <caption>Turnos y franjas ({blocks.length})</caption>
              <thead><tr><th scope="col">Turno</th><th scope="col">Franja</th><th scope="col">Horario</th><th scope="col">Modular</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>{blocks.map((block) => (
                <tr key={block.id}>
                  <td>{shifts.find((item) => item.value === block.turno)?.label}</td>
                  <td><strong>{block.nombre}</strong></td>
                  <td>{block.hora_inicio.slice(0, 5)}–{block.hora_fin.slice(0, 5)}</td>
                  <td>{block.predeterminado_modular ? "Predeterminada" : "—"}</td>
                  <td>{block.activo ? "Activo" : "Inactivo"}</td>
                  <td><div className="pl-resource-actions">
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => openBlock(block)}>Editar</button>
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => { setBusy(true); void api.updateScheduleBlock(block.id, { activo: !block.activo }).then(reload).then(() => setNotice(`Franja ${block.nombre} ${block.activo ? "inactivada" : "activada"}.`)).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)) }}>{block.activo ? "Inactivar" : "Activar"}</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {section === "templates" && (
        <div role="tabpanel" id="res-panel-templates" aria-labelledby="res-templates" className="pl-tabpanel" tabIndex={0}>
          <p className="pl-lead">Define las clases y horas habituales para un módulo. Al asignar una plantilla a un semestre, sus valores quedan protegidos; crea otra para una gestión nueva.</p>
          {templates.length === 0 ? (
            <p className="ui-text-muted">Aún no hay plantillas modulares.</p>
          ) : (
            <div className="pl-table-scroll"><table className="pl-data-table">
              <caption>Plantillas modulares ({templates.length})</caption>
              <thead><tr><th scope="col">Plantilla</th><th scope="col">Clases</th><th scope="col">Horas por clase</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>{templates.map((template) => (
                <tr key={template.id}>
                  <td><strong>{template.nombre}</strong></td>
                  <td>{template.clases_por_modulo}</td>
                  <td>{template.minutos_por_clase / 60}</td>
                  <td>{template.activa ? "Activa" : "Inactiva"}</td>
                  <td><div className="pl-resource-actions">
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => openTemplate(template)}>Editar</button>
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => { setBusy(true); void api.updateModularTemplate(template.id, { activa: !template.activa }).then(reload).then(() => setNotice(`Plantilla ${template.activa ? "inactivada" : "activada"}.`)).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)) }}>{template.activa ? "Inactivar" : "Activar"}</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {drawer === "rooms" && (
        <Drawer title={editingRoomCode ? `Editar aula ${editingRoomCode}` : "Nueva aula"} description="Registra el código del campus y la cantidad física de asientos. El cupo de cada paralelo puede ser menor." onClose={() => setDrawer(null)} locked={busy}>
          <form onSubmit={(event) => void save(event, () => editingRoomCode
            ? api.updatePlanningRoom(editingRoomCode, { capacidad: Number(roomCapacity) })
            : api.createPlanningRoom({ codigo: roomCode.trim(), capacidad: Number(roomCapacity) }), editingRoomCode ? `Capacidad del aula ${editingRoomCode} actualizada.` : `Aula ${roomCode.trim().toUpperCase()} agregada.`)}>
            {error && <p className="ui-alert ui-alert-error" role="alert">{error}</p>}
            <Field id="room-code" label="Código del aula"><input id="room-code" className="ui-input" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9 -]*" required disabled={Boolean(editingRoomCode)} data-autofocus /></Field>
            <Field id="room-capacity" label="Capacidad física (asientos)"><input id="room-capacity" className="ui-input" type="number" min="1" step="1" value={roomCapacity} onChange={(event) => setRoomCapacity(event.target.value)} required /></Field>
            <div className="ui-drawer-footer-inline pl-resource-actions"><button className="ui-btn ui-btn-primary" disabled={busy}>{editingRoomCode ? "Guardar capacidad" : "Agregar aula"}</button><button type="button" className="ui-btn ui-btn-secondary" disabled={busy} onClick={() => setDrawer(null)}>Cancelar</button></div>
          </form>
        </Drawer>
      )}

      {drawer === "blocks" && (
        <Drawer title={editingBlockId ? "Editar franja horaria" : "Nueva franja horaria"} description="Define una franja reutilizable dentro de un turno. Marcar la predeterminada modular la propone al programar módulos." onClose={() => setDrawer(null)} locked={busy}>
          <form onSubmit={(event) => void save(event, () => editingBlockId
            ? api.updateScheduleBlock(editingBlockId, { turno: shift, nombre: blockName.trim(), hora_inicio: start, hora_fin: end, predeterminado_modular: modularDefault })
            : api.createScheduleBlock({ turno: shift, nombre: blockName.trim(), hora_inicio: start, hora_fin: end, predeterminado_modular: modularDefault }), editingBlockId ? "Bloque horario actualizado." : "Bloque horario agregado.") }>
            {error && <p className="ui-alert ui-alert-error" role="alert">{error}</p>}
            <div className="pl-form-row">
              <Field id="block-shift" label="Turno"><select id="block-shift" className="ui-select" value={shift} onChange={(event) => setShift(event.target.value as PlanningShift)} data-autofocus>{shifts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
              <Field id="block-name" label="Nombre de la franja"><input id="block-name" className="ui-input" value={blockName} onChange={(event) => setBlockName(event.target.value)} maxLength={48} required placeholder="Ej. Bloque 1" /></Field>
            </div>
            <div className="pl-form-row">
              <Field id="block-start" label="Desde"><input id="block-start" className="ui-input" type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></Field>
              <Field id="block-end" label="Hasta"><input id="block-end" className="ui-input" type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /></Field>
            </div>
            <label className="pl-check-row"><input type="checkbox" checked={modularDefault} onChange={(event) => setModularDefault(event.target.checked)} />Franja predeterminada para módulos de este turno</label>
            <div className="ui-drawer-footer-inline pl-resource-actions"><button className="ui-btn ui-btn-primary" disabled={busy}>{editingBlockId ? "Guardar franja" : "Agregar franja"}</button><button type="button" className="ui-btn ui-btn-secondary" disabled={busy} onClick={() => setDrawer(null)}>Cancelar</button></div>
          </form>
        </Drawer>
      )}

      {drawer === "templates" && (
        <Drawer title={editingTemplateId ? "Editar plantilla modular" : "Nueva plantilla modular"} description="Define las clases y horas habituales para un módulo. Al asignarla a un semestre, sus valores quedan protegidos." onClose={() => setDrawer(null)} locked={busy}>
          <form onSubmit={(event) => {
            const values = { nombre: templateName.trim(), clases_por_modulo: templateClasses, minutos_por_clase: Math.round(templateHours * 60) }
            void save(event, () => editingTemplateId ? api.updateModularTemplate(editingTemplateId, values) : api.createModularTemplate(values), editingTemplateId ? "Plantilla actualizada." : "Plantilla creada.")
          }}>
            {error && <p className="ui-alert ui-alert-error" role="alert">{error}</p>}
            <Field id="modular-template-name" label="Nombre"><input id="modular-template-name" className="ui-input" value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={120} placeholder="Sistema modular 2026" required data-autofocus /></Field>
            <div className="pl-form-row">
              <Field id="modular-template-classes" label="Clases por módulo"><input id="modular-template-classes" className="ui-input" type="number" min="1" max="366" value={templateClasses} onChange={(event) => setTemplateClasses(Number(event.target.value))} required /></Field>
              <Field id="modular-template-hours" label="Horas por clase"><input id="modular-template-hours" className="ui-input" type="number" min="0.25" max="23.5" step="0.25" value={templateHours} onChange={(event) => setTemplateHours(Number(event.target.value))} required /></Field>
            </div>
            <div className="ui-drawer-footer-inline pl-resource-actions"><button className="ui-btn ui-btn-primary" disabled={busy}>{editingTemplateId ? "Guardar plantilla" : "Crear plantilla"}</button><button type="button" className="ui-btn ui-btn-secondary" disabled={busy} onClick={() => setDrawer(null)}>Cancelar</button></div>
          </form>
        </Drawer>
      )}
    </PlanningShell>
  )
}
