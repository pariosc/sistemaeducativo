import { useState } from "react"

import type { Holiday, PlanningBooking, PlanningRoom } from "../../api/client"
import { Modal } from "../shared/Modal"
import { addCalendarDays, formatDate, formatTime, mondayOf } from "./dates"
import { roomStatus } from "./modularResources"
import type { ProjectedModule } from "./modularResources"

const startMinute = 6 * 60
const endMinute = 22 * 60
const rowHeight = 28
const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))

export function RoomAgendaModal({ module, subjectLabel, rooms, bookings, holidays, modules, loading, error, onChoose, onClose, refresh }: {
  module: ProjectedModule
  subjectLabel: string
  rooms: PlanningRoom[]
  bookings: PlanningBooking[]
  holidays: Holiday[]
  modules: ProjectedModule[]
  loading: boolean
  error: string
  onChoose: (code: string) => void
  onClose: () => void
  refresh: () => void
}) {
  const [roomCode, setRoomCode] = useState(module.aula || rooms.find((room) => room.activa)?.codigo || "")
  const [week, setWeek] = useState(mondayOf(module.start))
  const room = rooms.find((item) => item.codigo === roomCode)
  const status = room ? roomStatus(module, room, bookings, modules) : null
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(week, index))
  const ticks = Array.from({ length: (endMinute - startMinute) / 30 }, (_, index) => startMinute + index * 30)
  return <Modal title="Agenda de aulas" description={`${subjectLabel} · paralelo ${module.paralelo} · ${formatDate(module.start)}–${formatDate(module.end)} · ${formatTime(module.horaInicio)}–${formatTime(module.horaFin)} · cupo ${module.cupo}. La selección comprueba todas sus clases.`} onClose={onClose}>
    <div className="pl-room-agenda">
      <div className="pl-agenda-toolbar">
        <label>Aula<select className="ui-select" value={roomCode} onChange={(event) => setRoomCode(event.target.value)}>{rooms.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo} · {item.capacidad ?? "sin capacidad"} asientos{item.activa ? "" : " · inactiva"}</option>)}</select></label>
        <div className="pl-agenda-navigation"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setWeek(addCalendarDays(week, -7))}>← Semana</button><input className="ui-input" type="date" aria-label="Semana de la agenda" value={week} onChange={(event) => event.target.value && setWeek(mondayOf(event.target.value))} /><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setWeek(addCalendarDays(week, 7))}>Semana →</button></div>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={refresh}>Actualizar ocupación</button>
      </div>
      {error && <p className="ui-alert ui-alert-error">No se pudo actualizar la ocupación: {error}</p>}
      {loading && <p className="ui-alert ui-alert-info">Actualizando ocupación…</p>}
      {status && !loading && !error && <p className={status.available ? "ui-alert ui-alert-info" : "ui-alert ui-alert-warning"}>{status.available ? "Disponible todo el módulo." : `Ocupada en el módulo: ${status.reason}`}</p>}
      <div className="pl-agenda-scroll"><div className="pl-agenda-grid">
        <div className="pl-agenda-header">Hora</div>{days.map((day) => { const holiday = holidays.find((item) => item.fecha === day); return <div className="pl-agenda-header" key={day}>{formatDate(day)}{holiday && <small className="pl-agenda-holiday">Feriado: {holiday.descripcion}</small>}</div> })}
        <div className="pl-agenda-times">{ticks.map((value) => <div key={value}>{String(Math.floor(value / 60)).padStart(2, "0")}:{String(value % 60).padStart(2, "0")}</div>)}</div>
        {days.map((day) => <div className="pl-agenda-day" key={day} style={{ height: ticks.length * rowHeight }}>
          {roomCode && bookings.filter((item) => item.aula === roomCode && item.fecha === day && minute(item.hora_fin) > startMinute && minute(item.hora_inicio) < endMinute).map((item) => <div className="pl-agenda-event" key={`${item.curso_id}-${item.fecha}-${item.hora_inicio}`} style={{ top: (Math.max(0, minute(item.hora_inicio) - startMinute) / 30) * rowHeight, height: Math.max(rowHeight, ((Math.min(endMinute, minute(item.hora_fin)) - Math.max(startMinute, minute(item.hora_inicio))) / 30) * rowHeight) }} title={`${item.materia_nombre} · ${item.docente_nombre || "Docente pendiente"} · ${formatDate(item.fecha_inicio_curso)}–${formatDate(item.fecha_fin_curso)}`}><strong>{item.materia_codigo} · {item.paralelo}{item.reprogramada ? " · Reprogramada" : ""}</strong><span>{formatTime(item.hora_inicio)}–{formatTime(item.hora_fin)} · {item.docente_nombre || "Docente pendiente"}</span><span>{formatDate(item.fecha_inicio_curso)}–{formatDate(item.fecha_fin_curso)}</span></div>)}
          {modules.filter((item) => item.aula === roomCode && item.dates.includes(day)).map((item) => <div className="pl-agenda-event pl-agenda-event--draft" key={item.key} style={{ top: ((minute(item.horaInicio) - startMinute) / 30) * rowHeight, height: Math.max(rowHeight, ((minute(item.horaFin) - minute(item.horaInicio)) / 30) * rowHeight) }} title={`Borrador · ${item.key}`}><strong>{item.key === module.key ? "Esta materia" : "Otra materia propuesta"} · {item.paralelo}</strong><span>{formatTime(item.horaInicio)}–{formatTime(item.horaFin)}</span></div>)}
        </div>)}
      </div></div>
      <p className="ui-text-muted">Vista de lunes a domingo, 06:00–22:00. Las ocupaciones muestran fecha, materia, paralelo y docente; la disponibilidad considera el módulo completo.</p>
      <div className="ui-modal-actions"><button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>Cerrar</button><button type="button" className="ui-btn ui-btn-primary" disabled={!status?.available || loading || !!error} onClick={() => onChoose(roomCode)}>Elegir aula {roomCode}</button></div>
    </div>
  </Modal>
}
