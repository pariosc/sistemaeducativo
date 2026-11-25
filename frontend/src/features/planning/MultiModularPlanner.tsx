import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, Course, ModularBatchInput, ModularBatchPreview, ModularSubjectInput, PeriodPlanning, PeriodSubjectOverview, PlanOpening, PlanningRoom, PlanningShift, ScheduleBlock, StudyPlan, User } from "../../api/client"
import { Notices } from "../shared/ui"
import { addCalendarDays, formatDate } from "./dates"
import { ModularShiftSetup } from "./ModularShiftSetup"
import { RoomAgendaModal } from "./RoomAgendaModal"
import { groupSequenceIssue, projectModularModules, roomStatus, teacherStatus, useModularResources } from "./modularResources"

type PlanDraft = { groupId: string; parallel: string; shift: PlanningShift; start: string; selected: string[]; rows: Record<string, ModularSubjectInput> }
const SHIFTS: { value: PlanningShift; label: string }[] = [
  { value: "MADRUGADA", label: "Madrugada" }, { value: "MANANA", label: "Mañana" },
  { value: "TARDE", label: "Tarde" }, { value: "NOCHE", label: "Noche" },
]
function blankDraft(period: AcademicPeriod): PlanDraft {
  return { groupId: "", parallel: "A", shift: "MANANA", start: period.fecha_inicio, selected: [], rows: {} }
}
function nextParallel(courses: Course[], subjectId: string, periodId: string) {
  const used = new Set(courses.filter((course) => course.materia_plan_id === subjectId && course.periodo_id === periodId).map((course) => course.paralelo))
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((letter) => !used.has(letter)) ?? ""
}
function blockDuration(block: ScheduleBlock): number {
  return (Number(block.hora_fin.slice(0, 2)) * 60 + Number(block.hora_fin.slice(3, 5))) -
    (Number(block.hora_inicio.slice(0, 2)) * 60 + Number(block.hora_inicio.slice(3, 5)))
}

export function MultiModularPlanner({ period, planning, plans, overview, courses, teachers, rooms, blocks, focusPlanId, focusSubjectId, focusCourse, focusToken, onCreated }: {
  period: AcademicPeriod
  planning: PeriodPlanning
  plans: StudyPlan[]
  overview: PeriodSubjectOverview[]
  courses: Course[]
  teachers: User[]
  rooms: PlanningRoom[]
  blocks: ScheduleBlock[]
  focusPlanId: string
  focusSubjectId: string
  focusCourse: Course | null
  focusToken: number
  onCreated: () => Promise<void>
}) {
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof api.listModularTemplates>>>([])
  const [openings, setOpenings] = useState<Record<string, PlanOpening[]>>({})
  const [selectedPlans, setSelectedPlans] = useState<string[]>([])
  const [planQuery, setPlanQuery] = useState("")
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({})
  const [preview, setPreview] = useState<ModularBatchPreview | null>(null)
  const [previewKey, setPreviewKey] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [agendaKey, setAgendaKey] = useState("")
  const [agendaTarget, setAgendaTarget] = useState("")
  const resources = useModularResources(period, courses.map((course) => course.id).join(","))

  const modularPlans = plans.filter((plan) => planning.plan_ids.includes(plan.id) && plan.modalidad === "MODULAR" && plan.estado === "VIGENTE").sort((a, b) => a.carrera_nombre.localeCompare(b.carrera_nombre) || a.codigo.localeCompare(b.codigo))
  const filteredPlans = modularPlans.filter((plan) => {
    const faculty = overview.find((subject) => subject.plan_id === plan.id)?.facultad_nombre ?? ""
    return `${faculty} ${plan.carrera_nombre} ${plan.codigo}`.toLocaleLowerCase().includes(planQuery.trim().toLocaleLowerCase())
  })
  const planIdsKey = modularPlans.map((plan) => plan.id).join(",")
  useEffect(() => {
    let cancelled = false
    void api.listModularTemplates().then((items) => { if (!cancelled) setTemplates(items) }).catch((reason: Error) => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    void Promise.all(modularPlans.map(async (plan) => [plan.id, await api.listPeriodOpenings(period.id, plan.id)] as const))
      .then((items) => { if (!cancelled) setOpenings(Object.fromEntries(items)) })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [period.id, planIdsKey])
  useEffect(() => {
    if (!modularPlans.some((plan) => plan.id === focusPlanId)) return
    setSelectedPlans((current) => current.includes(focusPlanId) ? current : [...current, focusPlanId])
    setDrafts((current) => {
      if (focusCourse?.plan_id === focusPlanId) {
        const subjectId = focusCourse.materia_plan_id
        return { ...current, [focusPlanId]: {
          groupId: focusCourse.apertura_plan_id ?? "",
          parallel: nextParallel(courses, subjectId, period.id) || "A",
          shift: (focusCourse.turno_modular as PlanningShift | null) ?? "MANANA",
          start: focusCourse.fecha_inicio,
          selected: [subjectId],
          rows: { [subjectId]: {
            materia_plan_id: subjectId,
            paralelo: nextParallel(courses, subjectId, period.id),
            cupo: focusCourse.cupo,
            docente_id: null,
            aula: "",
            clases: focusCourse.clases_objetivo ?? undefined,
          } },
        } }
      }
      if (focusSubjectId) {
        const draft = current[focusPlanId] ?? blankDraft(period)
        return { ...current, [focusPlanId]: {
          ...draft,
          selected: draft.selected.includes(focusSubjectId) ? draft.selected : [...draft.selected, focusSubjectId],
          rows: { ...draft.rows, [focusSubjectId]: draft.rows[focusSubjectId] ?? {
            materia_plan_id: focusSubjectId,
            paralelo: draft.parallel,
            cupo: 0,
            docente_id: null,
            aula: "",
          } },
        } }
      }
      return current[focusPlanId] ? current : { ...current, [focusPlanId]: blankDraft(period) }
    })
  }, [focusPlanId, focusSubjectId, focusCourse?.id, focusToken, period.id, planIdsKey])
  useEffect(() => {
    setDrafts((current) => {
      let next = current
      for (const id of selectedPlans) {
        const firstGroup = openings[id]?.find((group) => group.semestre_proyectado !== null)
        if (firstGroup && current[id] && !current[id].groupId) next = { ...next, [id]: { ...next[id], groupId: firstGroup.id } }
      }
      return next
    })
  }, [openings, selectedPlans])

  const template = templates.find((item) => item.id === planning.plantilla_modular_id)
  function updatePlan(id: string, change: Partial<PlanDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? blankDraft(period)), ...change } }))
  }
  function togglePlan(id: string) {
    setSelectedPlans((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setDrafts((current) => current[id] ? current : { ...current, [id]: blankDraft(period) })
    setPreview(null); setError(""); setNotice("")
  }
  function selectSubject(planId: string, subjectId: string) {
    const draft = drafts[planId] ?? blankDraft(period)
    if (draft.selected.includes(subjectId)) { updatePlan(planId, { selected: draft.selected.filter((id) => id !== subjectId) }); return }
    const row: ModularSubjectInput = { materia_plan_id: subjectId, paralelo: draft.parallel, cupo: 0, docente_id: null, aula: "" }
    updatePlan(planId, { selected: [...draft.selected, subjectId], rows: { ...draft.rows, [subjectId]: draft.rows[subjectId] ?? row } })
  }
  function selectSuggested(planId: string) {
    const draft = drafts[planId] ?? blankDraft(period)
    const semester = openings[planId]?.find((group) => group.id === draft.groupId)?.semestre_proyectado
    const suggested = overview.filter((subject) => subject.plan_id === planId && semester !== null && semester !== undefined && (subject.semestre_numero === semester || (subject.semestre_numero < semester && subject.repetidores > 0)) && !draft.selected.includes(subject.materia_plan_id))
    updatePlan(planId, {
      selected: [...draft.selected, ...suggested.map((subject) => subject.materia_plan_id)],
      rows: Object.fromEntries([...Object.entries(draft.rows), ...suggested.map((subject) => [subject.materia_plan_id, draft.rows[subject.materia_plan_id] ?? { materia_plan_id: subject.materia_plan_id, paralelo: draft.parallel, cupo: 0, docente_id: null, aula: "" }])]),
    })
  }
  function updateRow(planId: string, subjectId: string, change: Partial<ModularSubjectInput>) {
    const draft = drafts[planId]
    if (!draft) return
    updatePlan(planId, { rows: { ...draft.rows, [subjectId]: { ...draft.rows[subjectId], ...change } } })
  }
  function updateParallel(planId: string, parallel: string) {
    const draft = drafts[planId] ?? blankDraft(period)
    updatePlan(planId, { parallel, rows: Object.fromEntries(Object.entries(draft.rows).map(([id, row]) => [id, { ...row, paralelo: parallel }])) })
  }
  function move(planId: string, subjectId: string, direction: number) {
    const selected = [...(drafts[planId]?.selected ?? [])]
    const position = selected.indexOf(subjectId), next = position + direction
    if (position < 0 || next < 0 || next >= selected.length) return
    ;[selected[position], selected[next]] = [selected[next], selected[position]]
    updatePlan(planId, { selected })
  }

  const modules = projectModularModules(selectedPlans.map((id) => ({ planId: id, groupId: drafts[id]?.groupId ?? "", shift: drafts[id]?.shift ?? "MANANA", start: drafts[id]?.start ?? "", selected: drafts[id]?.selected ?? [], rows: drafts[id]?.rows ?? {} })), template, blocks, resources.holidays)
  const agendaModule = modules.find((item) => item.key === agendaKey)
  const roomIssues = selectedPlans.flatMap((planId) => (drafts[planId]?.selected ?? []).flatMap((subjectId) => {
    const row = drafts[planId]?.rows[subjectId]
    if (!row?.aula || row.cupo <= 0) return []
    const room = rooms.find((item) => item.codigo === row.aula && item.activa)
    const code = overview.find((subject) => subject.materia_plan_id === subjectId)?.codigo ?? "Materia"
    if (!room || room.capacidad === null) return [`${code}: el aula ${row.aula} no tiene capacidad configurada.`]
    return row.cupo > room.capacidad ? [`${code}: el cupo ${row.cupo} supera los ${room.capacidad} asientos del aula ${row.aula}.`] : []
  }))
  const readinessIssues: string[] = []
  if (!template) readinessIssues.push("Selecciona una plantilla modular para el semestre.")
  if (resources.loading) readinessIssues.push("Consultando la ocupación de aulas y docentes…")
  if (resources.error) readinessIssues.push(`No se pudo consultar la ocupación: ${resources.error}`)
  if (!selectedPlans.length) readinessIssues.push("Selecciona al menos un plan.")
  for (const id of selectedPlans) {
    const draft = drafts[id]
    const planName = modularPlans.find((plan) => plan.id === id)?.codigo ?? "Plan"
    if (!draft?.groupId) readinessIssues.push(`${planName}: selecciona un grupo de ingreso.`)
    if (!draft?.start || draft.start < period.fecha_inicio || draft.start > period.fecha_fin) readinessIssues.push(`${planName}: el inicio debe estar dentro del semestre.`)
    const block = blocks.find((item) => item.activo && item.predeterminado_modular && item.turno === draft?.shift)
    if (template && (!block || blockDuration(block) !== template.minutos_por_clase)) readinessIssues.push(`${planName}: configura un horario predeterminado para el turno con la duración de la plantilla.`)
    if (!draft?.selected.length) readinessIssues.push(`${planName}: selecciona al menos una materia.`)
    if (!draft?.parallel.trim()) readinessIssues.push(`${planName}: indica el paralelo de la secuencia.`)
    for (const subjectId of draft?.selected ?? []) {
      const row = draft.rows[subjectId]
      const code = overview.find((subject) => subject.materia_plan_id === subjectId)?.codigo ?? "Materia"
      if (!row?.paralelo.trim()) readinessIssues.push(`${code}: indica el paralelo.`)
      if (!row || row.cupo <= 0) readinessIssues.push(`${code}: indica un cupo mayor que cero.`)
      if (!row?.aula) readinessIssues.push(`${code}: selecciona un aula.`)
      if (!row || (row.clases ?? template?.clases_por_modulo ?? 0) <= 0) readinessIssues.push(`${code}: indica la cantidad de clases.`)
    }
  }
  readinessIssues.push(...roomIssues)
  for (const module of modules) {
    const code = overview.find((subject) => subject.materia_plan_id === module.subjectId)?.codigo ?? "Materia"
    const sequenceIssue = groupSequenceIssue(module, modules, courses)
    if (sequenceIssue) readinessIssues.push(`${code}: ${sequenceIssue}`)
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
  const batch: ModularBatchInput | null = ready ? { secuencias: selectedPlans.map((id) => ({
    plan_id: id, apertura_plan_id: drafts[id].groupId, turno: drafts[id].shift,
    fecha_inicio: drafts[id].start, materias: drafts[id].selected.map((subjectId) => drafts[id].rows[subjectId]),
  })) } : null
  const batchKey = batch ? JSON.stringify(batch) : ""
  useEffect(() => {
    setPreview(null); setPreviewKey(""); setError("")
    if (!batchKey) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void api.previewModularBatch(period.id, JSON.parse(batchKey) as ModularBatchInput)
        .then((result) => { if (!cancelled) { setPreview(result); setPreviewKey(batchKey) } })
        .catch((reason: Error) => { if (!cancelled) setError(reason.message) })
    }, 350)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [batchKey, period.id])

  async function save() {
    if (!batch || previewKey !== batchKey || !preview?.cabe_en_semestre || busy) return
    setBusy(true); setError(""); setNotice("")
    try {
      const created = await api.createModularBatch(period.id, batch)
      await onCreated()
      resources.refresh()
      setSelectedPlans([]); setDrafts({}); setPreview(null); setPreviewKey("")
      setNotice(`Secuencia guardada: ${created.length} materias en ${batch.secuencias.length} plan(es), con inscripciones cerradas.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la programación conjunta.") }
    finally { setBusy(false) }
  }

  return <section className="pl-section pl-multi-modular" aria-labelledby="multi-modular-title">
    <div className="pl-toolbar"><div><h2 id="multi-modular-title">Programación modular conjunta</h2><p className="pl-lead">Selecciona planes de varias carreras, ordena sus materias y asigna docente, aula y cupo. La vista previa comprueba las secuencias juntas antes de guardarlas.</p></div><a className="ui-link-button" href={`/admin/periodos?periodo_id=${period.id}`}>Configurar semestre y feriados</a></div>
    <Notices notice={notice} error={error} />
    {!template && <p className="ui-alert ui-alert-warning">Selecciona una plantilla modular para este semestre en «Planificar semestre».</p>}
    {template && <p className="pl-lead"><strong>{template.nombre}</strong> · {template.clases_por_modulo} clases por módulo · {template.minutos_por_clase / 60} horas por clase</p>}
    <label className="pl-multi-search">Buscar facultad, carrera o plan<input className="ui-input" type="search" value={planQuery} onChange={(event) => setPlanQuery(event.target.value)} /></label>
    <div className="pl-table-scroll"><table className="pl-data-table"><caption>Planes modulares del semestre</caption><thead><tr><th scope="col">Incluir</th><th scope="col">Facultad</th><th scope="col">Carrera</th><th scope="col">Plan</th><th scope="col">Materias sugeridas</th><th scope="col">Grupos con avance</th></tr></thead><tbody>{filteredPlans.map((plan) => <tr key={plan.id}><td><input type="checkbox" aria-label={`Incluir ${plan.carrera_nombre}, plan ${plan.codigo}`} checked={selectedPlans.includes(plan.id)} onChange={() => togglePlan(plan.id)} /></td><td>{overview.find((subject) => subject.plan_id === plan.id)?.facultad_nombre ?? "—"}</td><td>{plan.carrera_nombre}</td><td>{plan.codigo}</td><td>{overview.filter((subject) => subject.plan_id === plan.id && subject.recomendada).length}</td><td>{(openings[plan.id] ?? []).filter((group) => group.semestre_proyectado !== null).length}</td></tr>)}{filteredPlans.length === 0 && <tr><td colSpan={6}>{modularPlans.length ? "No hay planes para esta búsqueda." : "Este semestre no tiene planes modulares incorporados."}</td></tr>}</tbody></table></div>
    {selectedPlans.map((planId) => {
      const plan = modularPlans.find((item) => item.id === planId)
      const draft = drafts[planId] ?? blankDraft(period)
      const groupSemester = openings[planId]?.find((group) => group.id === draft.groupId)?.semestre_proyectado
      const subjects = overview.filter((item) => item.plan_id === planId && groupSemester !== null && groupSemester !== undefined && item.semestre_numero <= groupSemester).sort((a, b) => a.semestre_numero - b.semestre_numero || a.codigo.localeCompare(b.codigo))
      const block = blocks.find((item) => item.activo && item.predeterminado_modular && item.turno === draft.shift)
      const blockMinutes = block ? blockDuration(block) : null
      const parallelLabels = [...new Set(draft.selected.map((id) => draft.rows[id]?.paralelo.trim().toUpperCase()).filter(Boolean))]
      const sequenceParallel = parallelLabels.length === 1 ? parallelLabels[0] : ""
      const groupCourses = courses.filter((course) => course.apertura_plan_id === draft.groupId && course.turno_modular === draft.shift && course.paralelo === sequenceParallel && course.activo).sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin))
      const lastCourse = groupCourses.at(-1)
      const selectedAgendaKey = agendaTarget.startsWith(`${planId}:`) && draft.selected.includes(agendaTarget.slice(planId.length + 1)) ? agendaTarget : `${planId}:${draft.selected[0]}`
      const agendaReady = modules.some((item) => item.key === selectedAgendaKey)
      return <section className="pl-multi-plan" key={planId} aria-labelledby={`multi-plan-${planId}`}>
        <div className="pl-toolbar"><div><h3 id={`multi-plan-${planId}`}>{plan?.carrera_nombre} · {plan?.codigo}</h3><p className="ui-text-muted">{draft.selected.length} materias en la secuencia · hasta semestre {groupSemester ?? "—"} del grupo</p></div><button type="button" className="ui-btn ui-btn-quiet ui-btn-sm" onClick={() => togglePlan(planId)}>Quitar del lote</button></div>
        <div className="pl-modular-filters">
          <label>Grupo de ingreso<select className="ui-select" value={draft.groupId} onChange={(event) => updatePlan(planId, { groupId: event.target.value, selected: [], rows: {} })}><option value="">Selecciona un grupo</option>{(openings[planId] ?? []).filter((group) => group.semestre_proyectado !== null).map((group) => <option key={group.id} value={group.id}>{group.codigo} · semestre {group.semestre_proyectado}</option>)}</select></label>
          <label>Paralelo de esta secuencia<input className="ui-input" aria-label={`Paralelo de ${plan?.codigo}`} value={draft.parallel} maxLength={32} onChange={(event) => updateParallel(planId, event.target.value.toUpperCase())} /></label>
          <label>Turno<select className="ui-select" value={draft.shift} onChange={(event) => updatePlan(planId, { shift: event.target.value as PlanningShift })}>{SHIFTS.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}</select></label>
          <label>Inicio propuesto<input className="ui-input" type="date" min={period.fecha_inicio} max={period.fecha_fin} value={draft.start} onChange={(event) => updatePlan(planId, { start: event.target.value })} /></label>
        </div>
        {!draft.groupId && <p className="ui-alert ui-alert-info">Este plan necesita un grupo de ingreso con semestre proyectado. <a href={`/admin/periodos?periodo_id=${period.id}`}>Configurar grupo</a></p>}
        {template && block && blockMinutes === template.minutos_por_clase && <p className="ui-text-muted">Horario del turno: {block.hora_inicio.slice(0, 5)}–{block.hora_fin.slice(0, 5)}. {lastCourse && <>Último módulo del paralelo {sequenceParallel}: {formatDate(lastCourse.fecha_fin)}. <button type="button" className="ui-link-button" onClick={() => updatePlan(planId, { start: addCalendarDays(lastCourse.fecha_fin, 1) })}>Usar siguiente fecha</button></>}</p>}
        {template && (!block || blockMinutes !== template.minutos_por_clase) && <ModularShiftSetup key={`${planId}-${draft.shift}-${template.id}`} shift={draft.shift} duration={template.minutos_por_clase} blocks={blocks} onConfigured={onCreated} />}
        <div className="pl-multi-plan-actions"><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!draft.groupId} onClick={() => selectSuggested(planId)}>Seleccionar previstas</button><span>{subjects.length} materias del grupo</span></div>
        <div className="pl-table-scroll"><table className="pl-data-table"><thead><tr><th scope="col">Elegir</th><th scope="col">Semestre</th><th scope="col">Materia</th><th scope="col">Aptos</th><th scope="col">Repetidores</th><th scope="col">Estado</th></tr></thead><tbody>{subjects.map((subject) => <tr key={subject.materia_plan_id}><td><input type="checkbox" aria-label={`Programar ${subject.codigo} de ${plan?.carrera_nombre}`} checked={draft.selected.includes(subject.materia_plan_id)} onChange={() => selectSubject(planId, subject.materia_plan_id)} /></td><td>{subject.semestre_numero}</td><td>{subject.codigo} · {subject.nombre}</td><td>{subject.aptos}</td><td>{subject.repetidores}</td><td>{subject.semestre_numero === groupSemester ? "Prevista por grupo" : "Semestre anterior"}</td></tr>)}{subjects.length === 0 && <tr><td colSpan={6}>{draft.groupId ? "Este grupo no tiene materias en un semestre vigente del plan." : "Selecciona un grupo de ingreso."}</td></tr>}</tbody></table></div>
        {draft.selected.length > 0 && <p className="ui-text-muted">Puedes dejar docentes pendientes. Los paralelos se guardan con inscripción cerrada hasta asignarlos.</p>}
        {draft.selected.length > 0 && <div className="pl-assignment-toolbar"><h4>Orden y asignaciones de {plan?.codigo}</h4><label>Materia para la agenda<select className="ui-select" value={selectedAgendaKey} onChange={(event) => setAgendaTarget(event.target.value)}>{draft.selected.map((id) => <option key={id} value={`${planId}:${id}`}>{subjects.find((item) => item.materia_plan_id === id)?.codigo ?? "Materia"}</option>)}</select></label><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!agendaReady || resources.loading || !!resources.error} onClick={() => setAgendaKey(selectedAgendaKey)}>Ver agenda de aulas</button></div>}
        {draft.selected.length > 0 && <div className="pl-table-scroll"><table className="pl-data-table pl-multi-assignment"><caption className="ui-visually-hidden">Orden y asignaciones de {plan?.codigo}</caption><thead><tr><th scope="col">Orden</th><th scope="col">Materia</th><th scope="col">Fechas propuestas</th><th scope="col">Clases</th><th scope="col">Cupo</th><th scope="col">Docente</th><th scope="col">Aula</th></tr></thead><tbody>{draft.selected.map((subjectId, index) => {
          const subject = subjects.find((item) => item.materia_plan_id === subjectId), row = draft.rows[subjectId]
          const module = modules.find((item) => item.key === `${planId}:${subjectId}`)
          const issue = module ? groupSequenceIssue(module, modules, courses) : ""
          const selectedTeacher = teachers.find((item) => item.id === row?.docente_id)
          const teacherIssue = module && selectedTeacher ? teacherStatus(module, selectedTeacher, resources.bookings, modules) : null
          const selectedRoom = rooms.find((item) => item.codigo === row?.aula)
          const roomIssue = module && selectedRoom ? roomStatus(module, selectedRoom, resources.bookings, modules) : null
          return <tr key={subjectId}><td><div className="pl-order-controls"><span>{index + 1}</span><button type="button" aria-label={`Subir ${subject?.codigo}`} disabled={index === 0} onClick={() => move(planId, subjectId, -1)}>↑</button><button type="button" aria-label={`Bajar ${subject?.codigo}`} disabled={index === draft.selected.length - 1} onClick={() => move(planId, subjectId, 1)}>↓</button></div></td><td>{subject?.codigo}<small className="pl-table-secondary">{subject?.nombre}</small></td><td>{module ? <><strong>{formatDate(module.start)}–{formatDate(module.end)}</strong><small className="pl-table-secondary">{module.dates.length} clases · {module.horaInicio.slice(0, 5)}–{module.horaFin.slice(0, 5)}</small>{issue && <small className="pl-resource-issue">{issue}</small>}</> : "Configura grupo, turno e inicio"}</td><td><input className="ui-input" aria-label={`Clases de ${subject?.codigo}`} type="number" min="1" max="366" value={row?.clases ?? template?.clases_por_modulo ?? 21} onChange={(event) => updateRow(planId, subjectId, { clases: Number(event.target.value) })} /></td><td><input className="ui-input" aria-label={`Cupo de ${subject?.codigo}`} type="number" min="1" value={row?.cupo || ""} onChange={(event) => updateRow(planId, subjectId, { cupo: Number(event.target.value) })} /></td><td><select className="ui-select" aria-label={`Docente de ${subject?.codigo}`} value={row?.docente_id ?? ""} onChange={(event) => updateRow(planId, subjectId, { docente_id: event.target.value || null })}><option value="">Asignar después</option>{teachers.map((teacher) => { const status = module ? teacherStatus(module, teacher, resources.bookings, modules) : null; return <option key={teacher.id} value={teacher.id} disabled={!module || resources.loading || !!resources.error || !status?.available}>{teacher.nombres} {teacher.apellidos}{status && !status.available ? ` · Ocupado: ${status.reason}` : ""}</option> })}</select>{teacherIssue && !teacherIssue.available && <small className="pl-resource-issue">{teacherIssue.reason}</small>}</td><td><select className="ui-select" aria-label={`Aula de ${subject?.codigo}`} value={row?.aula ?? ""} onChange={(event) => updateRow(planId, subjectId, { aula: event.target.value })}><option value="">Selecciona</option>{rooms.map((room) => { const status = module ? roomStatus(module, room, resources.bookings, modules) : null; return <option key={room.codigo} value={room.codigo} disabled={!module || resources.loading || !!resources.error || !status?.available}>{room.codigo} · {room.capacidad === null ? "sin capacidad" : `${room.capacidad} asientos`}{status && !status.available ? ` · No disponible: ${status.reason}` : ""}</option> })}</select>{roomIssue && !roomIssue.available && <small className="pl-resource-issue">{roomIssue.reason}</small>}</td></tr>
        })}</tbody></table></div>}
      </section>
    })}
    {selectedPlans.length > 0 && readinessIssues.length > 0 && <div className="ui-alert ui-alert-warning" id="multi-save-status" role="status"><strong>Para guardar la secuencia:</strong><ul>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    {ready && (!preview || previewKey !== batchKey) && <p className={error ? "ui-alert ui-alert-error" : "ui-alert ui-alert-info"} id="multi-save-status" role={error ? "alert" : "status"}>{error || "Comprobando fechas, docentes y aulas antes de guardar…"}</p>}
    {preview && previewKey === batchKey && <div className="pl-modular-preview" id="multi-save-status"><h3>Vista previa conjunta</h3>{preview.cabe_en_semestre ? <p className="ui-alert ui-alert-info">Todas las secuencias caben en el semestre y no presentan cruces de docente ni aula.</p> : <p className="ui-alert ui-alert-error">Una o más secuencias terminan fuera del semestre. Ajusta el inicio o la cantidad de clases.</p>}<div className="pl-table-scroll"><table className="pl-data-table"><thead><tr><th scope="col">Carrera y plan</th><th scope="col">Materia</th><th scope="col">Inicio</th><th scope="col">Fin</th><th scope="col">Clases</th><th scope="col">Fechas</th></tr></thead><tbody>{preview.secuencias.flatMap((sequence, index) => sequence.materias.map((module) => <tr key={`${index}-${module.materia_plan_id}`}><td>{modularPlans.find((plan) => plan.id === batch?.secuencias[index]?.plan_id)?.carrera_nombre} · {modularPlans.find((plan) => plan.id === batch?.secuencias[index]?.plan_id)?.codigo}</td><td>{overview.find((subject) => subject.materia_plan_id === module.materia_plan_id)?.codigo} · {module.paralelo}</td><td>{formatDate(module.fecha_inicio)}</td><td>{formatDate(module.fecha_fin)}</td><td>{module.clases}</td><td><details><summary>Ver fechas</summary><div className="pl-date-list">{module.fechas_clase.map((day) => <time key={day} dateTime={day}>{formatDate(day)}</time>)}</div></details></td></tr>))}</tbody></table></div></div>}
    <div className="ui-page-header-actions"><button type="button" className="ui-btn ui-btn-primary pl-modular-save" aria-describedby="multi-save-status" disabled={!preview?.cabe_en_semestre || previewKey !== batchKey || busy} onClick={() => void save()}>{busy ? "Guardando…" : `Guardar secuencia (${batch?.secuencias.reduce((total, sequence) => total + sequence.materias.length, 0) ?? 0} materias)`}</button></div>
    {agendaModule && <RoomAgendaModal module={agendaModule} subjectLabel={overview.find((item) => item.materia_plan_id === agendaModule.subjectId)?.nombre ?? "Materia"} rooms={rooms} bookings={resources.bookings} holidays={resources.holidays} modules={modules} loading={resources.loading} error={resources.error} refresh={resources.refresh} onClose={() => setAgendaKey("")} onChoose={(code) => { updateRow(agendaModule.planId, agendaModule.subjectId, { aula: code }); setAgendaKey("") }} />}
  </section>
}
