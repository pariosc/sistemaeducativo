import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type {
  AcademicPeriod, Course, ModularPlanInput, ModularPlanPreview, ModularSubjectInput,
  ModularTemplate, PeriodPlanning, PlanOpening, PlanningRoom, PlanningShift,
  ScheduleBlock, StudyPlan, SubjectSuggestion, User,
} from "../../api/client"
import { Notices } from "../shared/ui"
import { formatDate } from "./dates"
import { ModularShiftSetup } from "./ModularShiftSetup"
import { RoomAgendaModal } from "./RoomAgendaModal"
import { groupSequenceIssue, projectModularModules, roomStatus, teacherStatus, useModularResources } from "./modularResources"

const shifts: { value: PlanningShift; label: string }[] = [
  { value: "MADRUGADA", label: "Madrugada" },
  { value: "MANANA", label: "Mañana" },
  { value: "TARDE", label: "Tarde" },
  { value: "NOCHE", label: "Noche" },
]

function nextDate(value: string) {
  const day = new Date(`${value}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}

type Row = ModularSubjectInput

export function ModularPlanner({ period, plans, planning, planId, onPlan, openings, suggestions, teachers, rooms, blocks, courses, onCreated }: {
  period: AcademicPeriod
  plans: StudyPlan[]
  planning: PeriodPlanning
  planId: string
  onPlan: (id: string) => void
  openings: PlanOpening[]
  suggestions: SubjectSuggestion[]
  teachers: User[]
  rooms: PlanningRoom[]
  blocks: ScheduleBlock[]
  courses: Course[]
  onCreated: () => Promise<void>
}) {
  const [templates, setTemplates] = useState<ModularTemplate[]>([])
  const [groupId, setGroupId] = useState("")
  const [shift, setShift] = useState<PlanningShift>("MANANA")
  const [start, setStart] = useState(period.fecha_inicio)
  const [selected, setSelected] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [preview, setPreview] = useState<ModularPlanPreview | null>(null)
  const [previewKey, setPreviewKey] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [sort, setSort] = useState<"semestre" | "codigo" | "demanda">("semestre")
  const [parallel, setParallel] = useState("A")
  const [agendaKey, setAgendaKey] = useState("")
  const [agendaSubjectId, setAgendaSubjectId] = useState("")
  const resources = useModularResources(period, courses.map((course) => course.id).join(","))

  useEffect(() => { void api.listModularTemplates().then(setTemplates).catch((reason: Error) => setError(reason.message)) }, [])
  useEffect(() => { setSelected([]); setRows({}); setParallel("A"); setPreview(null); setPreviewKey(""); setError(""); setNotice("") }, [planId, period.id])
  useEffect(() => {
    setGroupId((current) => openings.some((opening) => opening.id === current && opening.semestre_proyectado !== null) ? current : openings.find((opening) => opening.semestre_proyectado !== null)?.id ?? "")
  }, [openings])

  const template = templates.find((item) => item.id === planning.plantilla_modular_id)
  const plan = plans.find((item) => item.id === planId)
  const availablePlans = plans.filter((item) => planning.plan_ids.includes(item.id) && item.modalidad === "MODULAR")
  const groupCourses = courses.filter((item) => item.apertura_plan_id === groupId && item.turno_modular === shift && item.activo).sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
  const sequenceParallel = parallel.trim().toUpperCase()
  const lastCourse = groupCourses.filter((course) => course.paralelo === sequenceParallel).at(-1)
  const defaultStart = lastCourse ? nextDate(lastCourse.fecha_fin) : period.fecha_inicio
  const block = blocks.find((item) => item.turno === shift && item.activo && item.predeterminado_modular)
  const blockMinutes = block ? (
    Number(block.hora_fin.slice(0, 2)) * 60 + Number(block.hora_fin.slice(3, 5)) -
    Number(block.hora_inicio.slice(0, 2)) * 60 - Number(block.hora_inicio.slice(3, 5))
  ) : null
  const durationMatches = Boolean(template && blockMinutes === template.minutos_por_clase)
  const groupSemester = openings.find((opening) => opening.id === groupId)?.semestre_proyectado
  const orderedSuggestions = suggestions.filter((subject) => groupSemester !== null && groupSemester !== undefined && subject.semestre_numero <= groupSemester).sort((a, b) => sort === "codigo" ? a.codigo.localeCompare(b.codigo) : sort === "demanda" ? (b.aptos + b.repetidores) - (a.aptos + a.repetidores) : a.semestre_numero - b.semestre_numero || a.codigo.localeCompare(b.codigo))

  function updateRow(id: string, change: Partial<Row>) {
    setRows((current) => ({ ...current, [id]: { ...current[id], ...change } }))
  }
  function toggle(id: string) {
    if (selected.includes(id)) { setSelected((current) => current.filter((item) => item !== id)); return }
    setRows((current) => ({
      ...current,
      [id]: current[id] ?? { materia_plan_id: id, paralelo: sequenceParallel, cupo: 0, docente_id: null, aula: "", clases: template?.clases_por_modulo ?? 21 },
    }))
    setSelected((current) => [...current, id])
  }
  function move(id: string, direction: number) {
    setSelected((current) => {
      const next = [...current]
      const at = next.indexOf(id)
      const destination = at + direction
      if (destination < 0 || destination >= next.length) return current
      ;[next[at], next[destination]] = [next[destination], next[at]]
      return next
    })
  }

  const modules = projectModularModules([{ planId, groupId, shift, start, selected, rows }], template, blocks, resources.holidays)
  const agendaSelection = selected.includes(agendaSubjectId) ? agendaSubjectId : selected[0]
  const agendaModule = modules.find((item) => item.key === agendaKey)
  const roomIssues = selected.flatMap((id) => {
    const row = rows[id]
    if (!row?.aula || !row.cupo) return []
    const room = rooms.find((item) => item.codigo === row.aula)
    const subject = suggestions.find((item) => item.materia_plan_id === id)?.codigo ?? "La materia"
    if (!room || room.capacidad === null) return [`${subject}: define la capacidad del aula ${row.aula}.`]
    if (row.cupo > room.capacidad) return [`${subject}: el cupo ${row.cupo} supera los ${room.capacidad} asientos del aula ${row.aula}.`]
    return []
  })

  const readinessIssues: string[] = []
  if (!template) readinessIssues.push("Selecciona una plantilla modular para el semestre.")
  if (!parallel.trim()) readinessIssues.push("Indica el paralelo de la secuencia.")
  if (resources.loading) readinessIssues.push("Consultando la ocupación de aulas y docentes…")
  if (resources.error) readinessIssues.push(`No se pudo consultar la ocupación: ${resources.error}`)
  if (!groupId) readinessIssues.push("Selecciona un grupo de ingreso.")
  if (!start || start < period.fecha_inicio || start > period.fecha_fin) readinessIssues.push("El inicio debe estar dentro del semestre.")
  if (template && (!block || !durationMatches)) readinessIssues.push("Configura un horario predeterminado para el turno con la duración de la plantilla.")
  if (!selected.length) readinessIssues.push("Selecciona al menos una materia.")
  for (const id of selected) {
    const row = rows[id]
    const code = suggestions.find((subject) => subject.materia_plan_id === id)?.codigo ?? "Materia"
    if (!row?.paralelo.trim()) readinessIssues.push(`${code}: indica el paralelo.`)
    if (!row || row.cupo <= 0) readinessIssues.push(`${code}: indica un cupo mayor que cero.`)
    if (!row?.aula) readinessIssues.push(`${code}: selecciona un aula.`)
    if (!row || (row.clases ?? template?.clases_por_modulo ?? 0) <= 0) readinessIssues.push(`${code}: indica la cantidad de clases.`)
  }
  readinessIssues.push(...roomIssues)
  for (const module of modules) {
    const code = suggestions.find((subject) => subject.materia_plan_id === module.subjectId)?.codigo ?? "Materia"
    const issue = groupSequenceIssue(module, modules, courses)
    if (issue) readinessIssues.push(`${code}: ${issue}`)
    const room = rooms.find((item) => item.codigo === module.aula)
    if (room && !resources.loading && !resources.error) {
      const status = roomStatus(module, room, resources.bookings, modules)
      if (!status.available) readinessIssues.push(`${code}: aula ${room.codigo}: ${status.reason}`)
    }
    const teacher = teachers.find((item) => item.id === module.docenteId)
    if (teacher && !resources.loading && !resources.error) {
      const status = teacherStatus(module, teacher, resources.bookings, modules)
      if (!status.available) readinessIssues.push(`${code}: docente ${teacher.nombres} ${teacher.apellidos}: ${status.reason}`)
    }
    if (module.end > period.fecha_fin) readinessIssues.push(`${code}: termina fuera del semestre (${formatDate(module.end)}).`)
  }
  const ready = readinessIssues.length === 0
  const draft: ModularPlanInput | null = ready ? {
    plan_id: planId,
    apertura_plan_id: groupId,
    turno: shift,
    fecha_inicio: start,
    materias: selected.map((id) => rows[id]),
  } : null
  const draftKey = draft ? JSON.stringify(draft) : ""

  useEffect(() => {
    setPreview(null)
    setPreviewKey("")
    setError("")
    if (!draftKey) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void api.previewModularPlan(period.id, JSON.parse(draftKey) as ModularPlanInput)
        .then((result) => { if (!cancelled) { setPreview(result); setPreviewKey(draftKey); setError("") } })
        .catch((reason: Error) => { if (!cancelled) setError(reason.message) })
    }, 350)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [draftKey, period.id])

  async function saveSequence() {
    if (!draft || previewKey !== draftKey || !preview?.cabe_en_semestre || busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      const created = await api.createModularPlan(period.id, draft)
      await onCreated()
      resources.refresh()
      setSelected([]); setRows({}); setPreview(null)
      setStart(nextDate(created.at(-1)!.fecha_fin))
      setNotice(`Secuencia guardada: ${created.length} materias, con inscripciones cerradas.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la secuencia.")
    } finally {
      setBusy(false)
    }
  }

  return <section className="pl-section pl-modular-planner" aria-labelledby="modular-planner-title">
    <div className="pl-toolbar"><div><h2 id="modular-planner-title">Programación modular por grupo</h2><p className="pl-lead">Marca las materias en el orden en que se dictarán. Las fechas se proponen sin cargar cada día y se revisan antes de guardar.</p></div><a className="ui-link-button" href={`/admin/periodos?periodo_id=${period.id}`}>Configurar semestre y feriados</a></div>
    <Notices notice={notice} error={error} />
    {!template ? <p className="ui-alert ui-alert-info">Selecciona una plantilla modular para este semestre en «Planificar semestre».</p> : <p className="pl-lead"><strong>{template.nombre}</strong> · {template.clases_por_modulo} clases por módulo · {template.minutos_por_clase / 60} horas por clase</p>}
    <div className="pl-modular-filters">
      <label>Plan de estudios<select className="ui-select" value={planId} onChange={(event) => onPlan(event.target.value)}>{availablePlans.map((item) => <option key={item.id} value={item.id}>{item.carrera_nombre} · {item.codigo}</option>)}</select></label>
      <label>Grupo de ingreso<select className="ui-select" value={groupId} onChange={(event) => { setGroupId(event.target.value); setSelected([]); setRows({}); setPreview(null) }}><option value="">Selecciona un grupo</option>{openings.filter((item) => item.semestre_proyectado !== null).map((item) => <option key={item.id} value={item.id}>{item.codigo} · semestre {item.semestre_proyectado}</option>)}</select></label>
      <label>Paralelo de esta secuencia<input className="ui-input" aria-label="Paralelo de la secuencia" value={parallel} maxLength={32} onChange={(event) => { const value = event.target.value.toUpperCase(); setParallel(value); setRows((current) => Object.fromEntries(Object.entries(current).map(([id, row]) => [id, { ...row, paralelo: value }]))) }} /></label>
      <label>Turno<select className="ui-select" value={shift} onChange={(event) => { setShift(event.target.value as PlanningShift); setPreview(null) }}>{shifts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Inicio propuesto<input className="ui-input" type="date" min={period.fecha_inicio} max={period.fecha_fin} value={start} onChange={(event) => setStart(event.target.value)} /></label>
    </div>
    {durationMatches && block && <p className="ui-text-muted">Horario del turno: {block.hora_inicio.slice(0, 5)}–{block.hora_fin.slice(0, 5)}. {lastCourse && <>Último módulo del paralelo {sequenceParallel}: {formatDate(lastCourse.fecha_fin)}. <button type="button" className="ui-link-button" onClick={() => setStart(defaultStart)}>Usar siguiente fecha</button></>}</p>}
    {template && !durationMatches && <ModularShiftSetup key={`${shift}-${template.id}`} shift={shift} duration={template.minutos_por_clase} blocks={blocks} onConfigured={onCreated} />}
    {groupCourses.length > 0 && <div className="pl-table-scroll"><table className="pl-data-table"><caption>Módulos ya programados para este grupo y turno</caption><thead><tr><th>Materia</th><th>Desde</th><th>Hasta</th><th>Clases</th></tr></thead><tbody>{groupCourses.map((course) => <tr key={course.id}><td>{course.materia_codigo} · {course.paralelo}</td><td>{formatDate(course.fecha_inicio)}</td><td>{formatDate(course.fecha_fin)}</td><td className={course.clases_objetivo !== course.clases_programadas ? "pl-warn" : ""}>{course.clases_programadas ?? "—"}/{course.clases_objetivo ?? "—"}</td></tr>)}</tbody></table></div>}
    {plan && <div className="pl-table-scroll"><table className="pl-data-table"><caption>Materias de {plan.codigo} · hasta semestre {groupSemester ?? "—"} del grupo</caption><thead><tr><th>Elegir</th><th>Semestre</th><th>Materia</th><th>Aptos</th><th>Repetidores</th><th>Estado</th></tr></thead><tbody>{orderedSuggestions.map((subject) => <tr key={subject.materia_plan_id}><td><input type="checkbox" aria-label={`Programar ${subject.codigo}`} checked={selected.includes(subject.materia_plan_id)} onChange={() => toggle(subject.materia_plan_id)} /></td><td>{subject.semestre_numero}</td><td>{subject.codigo} · {subject.nombre}</td><td>{subject.aptos}</td><td>{subject.repetidores}</td><td>{subject.semestre_numero === groupSemester ? "Prevista por grupo" : "Semestre anterior"}</td></tr>)}{orderedSuggestions.length === 0 && <tr><td colSpan={6}>{groupId ? "Este grupo no tiene materias en un semestre vigente del plan." : "Selecciona un grupo de ingreso para ver sus materias."}</td></tr>}</tbody></table></div>}
    <label className="pl-modular-sort">Ordenar materias por <select className="ui-select" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="semestre">Semestre</option><option value="codigo">Código</option><option value="demanda">Demanda</option></select></label>
    {selected.length > 0 && <p className="ui-text-muted">Puedes dejar el docente pendiente. El paralelo se guardará con inscripción cerrada hasta asignarlo.</p>}
    {selected.length > 0 && <div className="pl-assignment-toolbar"><h3>Orden y asignaciones</h3><label>Materia para la agenda<select className="ui-select" value={agendaSelection} onChange={(event) => setAgendaSubjectId(event.target.value)}>{selected.map((id) => <option key={id} value={id}>{suggestions.find((item) => item.materia_plan_id === id)?.codigo ?? "Materia"}</option>)}</select></label><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!modules.some((item) => item.subjectId === agendaSelection) || resources.loading || !!resources.error} onClick={() => setAgendaKey(`${planId}:${agendaSelection}`)}>Ver agenda de aulas</button></div>}
    {selected.length > 0 && <div className="pl-table-scroll"><table className="pl-data-table pl-modular-assignment"><caption className="ui-visually-hidden">Secuencia y asignaciones</caption><thead><tr><th>Orden</th><th>Materia</th><th>Fechas propuestas</th><th>Clases</th><th>Cupo</th><th>Docente</th><th>Aula</th></tr></thead><tbody>{selected.map((id, index) => {
      const row = rows[id], subject = suggestions.find((item) => item.materia_plan_id === id)
      const module = modules.find((item) => item.key === `${planId}:${id}`)
      const issue = module ? groupSequenceIssue(module, modules, courses) : ""
      const teacher = teachers.find((item) => item.id === row?.docente_id)
      const teacherIssue = module && teacher ? teacherStatus(module, teacher, resources.bookings, modules) : null
      const room = rooms.find((item) => item.codigo === row?.aula)
      const roomIssue = module && room ? roomStatus(module, room, resources.bookings, modules) : null
      return <tr key={id}><td><div className="pl-order-controls"><span>{index + 1}</span><button type="button" aria-label={`Subir ${subject?.codigo}`} disabled={index === 0} onClick={() => move(id, -1)}>↑</button><button type="button" aria-label={`Bajar ${subject?.codigo}`} disabled={index === selected.length - 1} onClick={() => move(id, 1)}>↓</button></div></td><td>{subject?.codigo} · {subject?.nombre}</td><td>{module ? <><strong>{formatDate(module.start)}–{formatDate(module.end)}</strong><small className="pl-table-secondary">{module.dates.length} clases · {module.horaInicio.slice(0, 5)}–{module.horaFin.slice(0, 5)}</small>{issue && <small className="pl-resource-issue">{issue}</small>}</> : "Configura grupo, turno e inicio"}</td><td><input className="ui-input" aria-label={`Clases de ${subject?.codigo}`} type="number" min="1" max="366" value={row?.clases ?? template?.clases_por_modulo ?? 21} onChange={(event) => updateRow(id, { clases: Number(event.target.value) })} /></td><td><input className="ui-input" aria-label={`Cupo de ${subject?.codigo}`} type="number" min="1" value={row?.cupo || ""} onChange={(event) => updateRow(id, { cupo: Number(event.target.value) })} /></td><td><select className="ui-select" aria-label={`Docente de ${subject?.codigo}`} value={row?.docente_id ?? ""} onChange={(event) => updateRow(id, { docente_id: event.target.value || null })}><option value="">Asignar después</option>{teachers.map((item) => { const status = module ? teacherStatus(module, item, resources.bookings, modules) : null; return <option key={item.id} value={item.id} disabled={!module || resources.loading || !!resources.error || !status?.available}>{item.nombres} {item.apellidos}{status && !status.available ? ` · Ocupado: ${status.reason}` : ""}</option> })}</select>{teacherIssue && !teacherIssue.available && <small className="pl-resource-issue">{teacherIssue.reason}</small>}</td><td><select className="ui-select" aria-label={`Aula de ${subject?.codigo}`} value={row?.aula ?? ""} onChange={(event) => updateRow(id, { aula: event.target.value })}><option value="">Selecciona</option>{rooms.map((item) => { const status = module ? roomStatus(module, item, resources.bookings, modules) : null; return <option key={item.codigo} value={item.codigo} disabled={!module || resources.loading || !!resources.error || !status?.available}>{item.codigo} · {item.capacidad === null ? "sin capacidad" : `${item.capacidad} asientos`}{status && !status.available ? ` · No disponible: ${status.reason}` : ""}</option> })}</select>{roomIssue && !roomIssue.available && <small className="pl-resource-issue">{roomIssue.reason}</small>}</td></tr>
    })}</tbody></table></div>}
    {selected.length > 0 && readinessIssues.length > 0 && <div className="ui-alert ui-alert-warning" id="modular-save-status" role="status"><strong>Para guardar la secuencia:</strong><ul>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    {ready && (!preview || previewKey !== draftKey) && <p className={error ? "ui-alert ui-alert-error" : "ui-alert ui-alert-info"} id="modular-save-status" role={error ? "alert" : "status"}>{error || "Comprobando fechas, docentes y aulas antes de guardar…"}</p>}
    {preview && previewKey === draftKey && <div className="pl-modular-preview" id="modular-save-status"><h3>Vista previa de fechas</h3>{preview.cabe_en_semestre ? <p className="ui-alert ui-alert-info">La secuencia cabe en el semestre y no tiene cruces de docentes ni aulas.</p> : <p className="ui-alert ui-alert-error">La secuencia terminaría el {formatDate(preview.fin_estimado)}, fuera del semestre. Ajusta las clases o la oferta.</p>}<div className="pl-table-scroll"><table className="pl-data-table"><thead><tr><th>Materia</th><th>Inicio</th><th>Fin</th><th>Clases efectivas</th><th>Fechas</th></tr></thead><tbody>{preview.materias.map((item) => <tr key={item.materia_plan_id}><td>{suggestions.find((subject) => subject.materia_plan_id === item.materia_plan_id)?.codigo} · {item.paralelo}</td><td>{formatDate(item.fecha_inicio)}</td><td>{formatDate(item.fecha_fin)}</td><td>{item.clases}</td><td><details><summary>Ver fechas</summary><div className="pl-date-list">{item.fechas_clase.map((day) => <time key={day} dateTime={day}>{formatDate(day)}</time>)}</div></details></td></tr>)}</tbody></table></div></div>}
    <div className="ui-page-header-actions"><button type="button" className="ui-btn ui-btn-primary pl-modular-save" aria-describedby="modular-save-status" disabled={!preview?.cabe_en_semestre || previewKey !== draftKey || busy} onClick={() => void saveSequence()}>{busy ? "Guardando…" : `Guardar secuencia (${selected.length} materias)`}</button></div>
    {agendaModule && <RoomAgendaModal module={agendaModule} subjectLabel={suggestions.find((item) => item.materia_plan_id === agendaModule.subjectId)?.nombre ?? "Materia"} rooms={rooms} bookings={resources.bookings} holidays={resources.holidays} modules={modules} loading={resources.loading} error={resources.error} refresh={resources.refresh} onClose={() => setAgendaKey("")} onChoose={(code) => { updateRow(agendaModule.subjectId, { aula: code }); setAgendaKey("") }} />}
  </section>
}
