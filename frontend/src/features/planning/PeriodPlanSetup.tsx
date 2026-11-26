import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, Career, Course, Faculty, ModularTemplate, PeriodPlanning, PlanOpening, StudentPlan, StudyPlan } from "../../api/client"
import { ButtonLabel, EmptyState, Notices } from "../shared/ui"
import { Modal } from "../shared/Modal"
import { formatDate } from "./dates"
import { BulkCareerModal } from "./BulkCareerModal"

type PlanRow = { career: Career; plan: StudyPlan | null; group: PlanOpening | null }

export function PeriodPlanSetup({ periodId }: { periodId: string }) {
  const [planning, setPlanning] = useState<PeriodPlanning | null>(null)
  const [careers, setCareers] = useState<Career[]>([])
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [openings, setOpenings] = useState<PlanOpening[]>([])
  const [students, setStudents] = useState<StudentPlan[]>([])
  const [templates, setTemplates] = useState<ModularTemplate[]>([])
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [templateChoice, setTemplateChoice] = useState("")
  const [careerId, setCareerId] = useState("")
  const [facultyId, setFacultyId] = useState("")
  const [planId, setPlanId] = useState("")
  const [filterFaculty, setFilterFaculty] = useState("")
  const [filterCareer, setFilterCareer] = useState("")
  const [filterMonth, setFilterMonth] = useState("")
  const [sortBy, setSortBy] = useState("career")
  const [openingPlanId, setOpeningPlanId] = useState("")
  const [bulkOpen, setBulkOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function reload() {
    const [selection, careerRows, facultyRows, planRows, studentRows, templateRows, periodRows, courseRows] = await Promise.all([
      api.getPeriodPlanning(periodId), api.listCareers(), api.listFaculties(), api.listPlans(), api.listStudentPlanAssignments(), api.listModularTemplates(), api.listPeriods(), api.listCourses(),
    ])
    setPlanning(selection)
    setCareers(careerRows)
    setFaculties(facultyRows)
    setPlans(planRows)
    setStudents(studentRows)
    setTemplates(templateRows)
    setPeriods(periodRows)
    setCourses(courseRows)
    setTemplateChoice(selection.plantilla_modular_id ?? "")
    const groups = await Promise.all(selection.plan_ids.map((id) => api.listPeriodOpenings(periodId, id)))
    setOpenings(groups.flat())
  }

  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)) }, [periodId])

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
      await reload()
      setNotice(success)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la solicitud.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const selectedCareers = careers.filter((career) => planning?.carrera_ids.includes(career.id))
  const availableFaculties = faculties.filter((faculty) => faculty.activo && careers.some((career) => career.activo && career.facultad_id === faculty.id))
  const availableCareers = careers.filter((career) => career.activo && career.facultad_id === facultyId)
  const availablePlans = plans.filter((plan) =>
    plan.carrera_id === careerId && plan.estado === "VIGENTE" && !planning?.plan_ids.includes(plan.id),
  )
  const rows: PlanRow[] = selectedCareers.flatMap<PlanRow>((career) => {
    const ownPlans = plans.filter((plan) => plan.carrera_id === career.id && planning?.plan_ids.includes(plan.id))
    if (ownPlans.length === 0) return [{ career, plan: null, group: null }]
    return ownPlans.flatMap<PlanRow>((plan) => {
      const groups = openings.filter((opening) => opening.plan_id === plan.id && (opening.semestre_proyectado !== null || opening.periodo_inicio_id === periodId))
      return groups.length ? groups.map((group) => ({ career, plan, group })) : [{ career, plan, group: null }]
    })
  })
  const visibleRows = rows.filter(({ career, group }) =>
    (!filterFaculty || career.facultad_id === filterFaculty) &&
    (!filterCareer || career.id === filterCareer) &&
    (!filterMonth || (group && periods.find((period) => period.id === group.periodo_inicio_id)?.fecha_inicio.slice(5, 7) === filterMonth)),
  ).sort((left, right) => {
    if (sortBy === "faculty") return (left.career.facultad_nombre ?? "").localeCompare(right.career.facultad_nombre ?? "") || left.career.nombre.localeCompare(right.career.nombre)
    if (sortBy === "semester") return (left.group?.semestre_proyectado ?? 0) - (right.group?.semestre_proyectado ?? 0) || left.career.nombre.localeCompare(right.career.nombre)
    if (sortBy === "start") return (periods.find((period) => period.id === left.group?.periodo_inicio_id)?.fecha_inicio ?? "").localeCompare(periods.find((period) => period.id === right.group?.periodo_inicio_id)?.fecha_inicio ?? "") || left.career.nombre.localeCompare(right.career.nombre)
    return left.career.nombre.localeCompare(right.career.nombre) || (left.plan?.codigo ?? "").localeCompare(right.plan?.codigo ?? "")
  })

  return (
    <section className="pl-section" aria-labelledby="period-plans-title">
      <h2 id="period-plans-title">Carreras y planes de este semestre</h2>
      <p className="pl-lead">Elige la facultad y la carrera; después incorpora su plan vigente. Los grupos de ingreso se crean dentro del plan.</p>
      <Notices notice={notice} error={error} />

      <div className="pl-career-setup">
        <div className="pl-career-setup-head">
          <div><h3>Incorporar carrera y plan</h3><p>Selecciona una carrera o incorpora varias con sus planes vigentes.</p></div>
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !planning} onClick={() => { setError(""); setBulkOpen(true) }}>Incorporar varias carreras</button>
        </div>
        <div className="pl-plan-setup-actions">
        <div className="ui-field">
          <label htmlFor="period-faculty">1. Facultad</label>
          <select id="period-faculty" className="ui-select" value={facultyId} onChange={(event) => { setFacultyId(event.target.value); setCareerId(""); setPlanId("") }}>
            <option value="">Selecciona una facultad</option>
            {availableFaculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.nombre}</option>)}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="period-add-career">2. Carrera</label>
          <select id="period-add-career" className="ui-select" value={careerId} disabled={!facultyId} onChange={(event) => { setCareerId(event.target.value); setPlanId("") }}>
            <option value="">Selecciona una carrera</option>
            {availableCareers.map((career) => <option key={career.id} value={career.id}>{career.nombre}{planning?.carrera_ids.includes(career.id) ? " · incorporada" : ""}</option>)}
          </select>
        </div>
        <button type="button" className="ui-btn ui-btn-secondary" disabled={busy || !careerId || planning?.carrera_ids.includes(careerId)} onClick={() => void act(() => api.addPeriodCareer(periodId, careerId), "Carrera incorporada. Selecciona su plan vigente.")}><ButtonLabel icon="plus">Incorporar carrera</ButtonLabel></button>
        {careerId && planning?.carrera_ids.includes(careerId) && availablePlans.length > 0 && <>
          <div className="ui-field">
            <label htmlFor="period-add-plan">3. Plan vigente</label>
            <select id="period-add-plan" className="ui-select" value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">Selecciona un plan</option>
              {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.codigo} · {plan.modalidad} · {Math.max(0, ...plan.unidades.map((unit) => unit.numero))} semestres</option>)}
            </select>
          </div>
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !planId} onClick={() => { const chosen = planId; setPlanId(""); void act(() => api.addPeriodPlan(periodId, chosen), "Plan incorporado al semestre.") }}><ButtonLabel icon="plus">Incorporar plan</ButtonLabel></button>
        </>}
        {careerId && planning?.carrera_ids.includes(careerId) && availablePlans.length === 0 && <p className="pl-plan-complete">No quedan planes vigentes de esta carrera por incorporar.</p>}
        </div>
      </div>

      {!planning ? <p role="status">Cargando carreras y planes…</p> : selectedCareers.length === 0 ? (
        <EmptyState icon="layers" title="Todavía no hay carreras seleccionadas">Incorpora una carrera para planificar sus materias.</EmptyState>
      ) : <>
        <div className="pl-plan-table-filters" aria-label="Filtros de carreras y grupos">
          <div className="ui-field"><label htmlFor="period-filter-faculty">Facultad</label><select id="period-filter-faculty" className="ui-select" value={filterFaculty} onChange={(event) => { setFilterFaculty(event.target.value); setFilterCareer("") }}><option value="">Todas</option>{faculties.filter((faculty) => selectedCareers.some((career) => career.facultad_id === faculty.id)).map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.nombre}</option>)}</select></div>
          <div className="ui-field"><label htmlFor="period-filter-career">Carrera</label><select id="period-filter-career" className="ui-select" value={filterCareer} onChange={(event) => setFilterCareer(event.target.value)}><option value="">Todas</option>{selectedCareers.filter((career) => !filterFaculty || career.facultad_id === filterFaculty).map((career) => <option key={career.id} value={career.id}>{career.nombre}</option>)}</select></div>
          <div className="ui-field"><label htmlFor="period-filter-month">Mes de inicio del grupo</label><select id="period-filter-month" className="ui-select" value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)}><option value="">Todos</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, "0")}>{new Intl.DateTimeFormat("es-BO", { month: "long" }).format(new Date(2026, index, 1))}</option>)}</select></div>
          <div className="ui-field"><label htmlFor="period-sort">Ordenar por</label><select id="period-sort" className="ui-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="career">Carrera</option><option value="faculty">Facultad</option><option value="semester">Semestre previsto</option><option value="start">Fecha de inicio</option></select></div>
        </div>
        <p className="pl-table-count" role="status">{visibleRows.length} de {rows.length} registros</p>
        <div className="pl-table-scroll">
          <table className="pl-data-table pl-period-table">
            <thead><tr><th scope="col">Facultad / carrera</th><th scope="col">Plan</th><th scope="col">Grupo de ingreso</th><th scope="col">Semestre previsto</th><th scope="col">Estudiantes</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              {visibleRows.length === 0 ? <tr><td colSpan={6}>No hay registros con estos filtros.</td></tr> : visibleRows.map(({ career, plan, group }) => {
                const planGroups = plan ? openings.filter((opening) => opening.plan_id === plan.id) : []
                const careerStartedHere = openings.some((opening) =>
                  opening.periodo_inicio_id === periodId && plans.some((item) => item.id === opening.plan_id && item.carrera_id === career.id))
                const canUndo = group && group.periodo_inicio_id === periodId && group.estudiantes === 0 && !courses.some((course) => course.apertura_plan_id === group.id)
                const canRemovePlan = plan && !planGroups.some((opening) => opening.periodo_inicio_id === periodId) && !courses.some((course) => course.periodo_id === periodId && course.plan_id === plan.id)
                const startDate = periods.find((period) => period.id === group?.periodo_inicio_id)?.fecha_inicio
                return <tr key={`${career.id}-${plan?.id ?? "no-plan"}-${group?.id ?? "no-group"}`}>
                  <td><strong>{career.nombre}</strong><small>{career.facultad_nombre} · {career.codigo}</small></td>
                  <td>{plan ? <><strong>{plan.codigo}</strong><small>{plan.modalidad} · {Math.max(0, ...plan.unidades.map((unit) => unit.numero))} semestres</small></> : <span className="ui-text-muted">Sin plan</span>}</td>
                  <td>{group ? <><strong>{group.codigo}</strong><small>Ingreso {group.periodo_denominacion} · {startDate ? formatDate(startDate) : "Fecha no disponible"}</small><details className="pl-group-details"><summary>Ver trayectoria y estudiantes</summary><ol className="pl-cohort-timeline" aria-label={`Trayectoria del grupo ${group.codigo}`}>{group.proyeccion.map((slot) => <li key={slot.semestre_numero} data-current={slot.periodo_id === periodId ? "" : undefined}><strong>{slot.semestre_numero}</strong><small>{slot.periodo_denominacion ?? "Por programar"}</small></li>)}</ol>{plan && <AssignOpeningControl opening={group} students={students.filter((student) => student.plan_estudio_id === plan.id && !student.apertura_plan_id)} busy={busy} onAssign={(studentId) => void act(() => api.assignStudentOpening(studentId, group.id), "Estudiante agregado al grupo de ingreso.")} />}</details></> : <span className="ui-text-muted">Sin grupo</span>}</td>
                  <td>{group?.semestre_proyectado ?? "—"}</td>
                  <td>{group ? group.estudiantes : "—"}</td>
                  <td><div className="pl-table-actions">
                    <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger ui-btn-sm" disabled={busy || Boolean(plan)} title={plan ? "Quita primero los planes de la carrera en este semestre" : undefined} onClick={() => void act(() => api.removePeriodCareer(periodId, career.id), "Carrera quitada del semestre.")}>Quitar carrera</button>
                    {plan && !careerStartedHere && <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setOpeningPlanId(plan.id)}>Iniciar grupo</button>}
                    {plan && <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger ui-btn-sm" disabled={busy || !canRemovePlan} title={!canRemovePlan ? "El plan tiene grupos o paralelos; conserva su historial" : undefined} onClick={() => void act(() => api.removePeriodPlan(periodId, plan.id), "Plan quitado del semestre.")}>Quitar plan</button>}
                    {group && <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger ui-btn-sm" disabled={busy || !canUndo} title={!canUndo ? group.periodo_inicio_id !== periodId ? "Abre el semestre en que inició este grupo" : "El grupo tiene estudiantes o paralelos; conserva su historial" : undefined} onClick={() => void act(() => api.removePlanOpening(periodId, group.id), "Inicio del grupo deshecho.")}>Deshacer grupo</button>}
                    {plan && <a className="ui-btn ui-btn-secondary ui-btn-sm" href={`/admin/paralelos?periodo_id=${periodId}&plan_id=${plan.id}${group ? `&apertura_plan_id=${group.id}` : ""}`}>Planificar</a>}
                  </div></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </>}
      <details className="pl-template-details">
        <summary><span>Configuración modular del semestre</span><span>{templates.find((template) => template.id === planning?.plantilla_modular_id)?.nombre ?? "Sin plantilla asignada"}</span></summary>
        <div className="pl-template-content">
          <p className="ui-text-muted">La plantilla propone fechas y duración para las carreras modulares. Las carreras semestrales conservan su programación habitual.</p>
          <div className="pl-template-controls">
            <div className="ui-field"><label htmlFor="period-modular-template">Plantilla modular</label><select id="period-modular-template" className="ui-select" value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value)}><option value="">Selecciona una plantilla</option>{templates.filter((template) => template.activa || template.id === planning?.plantilla_modular_id).map((template) => <option key={template.id} value={template.id}>{template.nombre} · {template.clases_por_modulo} clases · {template.minutos_por_clase / 60} h</option>)}</select></div>
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !templateChoice || templateChoice === planning?.plantilla_modular_id} onClick={() => void act(() => api.setPeriodModularTemplate(periodId, templateChoice), "Plantilla modular asignada al semestre.")}>Asignar plantilla</button>
            <a className="ui-btn ui-btn-secondary" href="/admin/planificacion-config">Configurar plantillas y turnos</a>
          </div>
        </div>
      </details>
      {bulkOpen && planning && <BulkCareerModal
        careers={careers}
        faculties={faculties}
        plans={plans}
        incorporatedIds={planning.carrera_ids}
        busy={busy}
        error={error}
        onClose={() => setBulkOpen(false)}
        onSubmit={async (items) => {
          const ok = await act(() => api.addPeriodCareersBatch(periodId, items), `${items.length} carrera(s) incorporada(s) con sus planes.`)
          if (ok) setBulkOpen(false)
          return ok
        }}
      />}
      {openingPlanId && <Modal title="Iniciar grupo de ingreso" description="Revisa los datos antes de crear el grupo. El sistema generará un código y conservará su trayectoria de semestres." onClose={() => setOpeningPlanId("")} locked={busy}>
        <dl className="pl-opening-review">
          <div><dt>Plan</dt><dd>{plans.find((item) => item.id === openingPlanId)?.codigo}</dd></div>
          <div><dt>Carrera</dt><dd>{plans.find((item) => item.id === openingPlanId)?.carrera_nombre}</dd></div>
          <div><dt>Ingreso</dt><dd>{periods.find((item) => item.id === periodId)?.denominacion}</dd></div>
          <div><dt>Trayectoria</dt><dd>{Math.max(0, ...(plans.find((item) => item.id === openingPlanId)?.unidades.map((unit) => unit.numero) ?? []))} semestres del plan</dd></div>
        </dl>
        <p className="ui-text-muted">Solo se crea un grupo por carrera y semestre académico, asociado al plan seleccionado. Los paralelos se organizan dentro de ese grupo. Cada semestre posterior se asigna a un periodo sin cambiar los ya registrados.</p>
        <div className="ui-page-header-actions">
          <button type="button" className="ui-btn ui-btn-secondary" disabled={busy} onClick={() => setOpeningPlanId("")}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => { const chosen = openingPlanId; void act(() => api.createPlanOpening(periodId, chosen), "Grupo de ingreso creado con su trayectoria.").then((ok) => { if (ok) setOpeningPlanId("") }) }}>{busy ? "Creando…" : "Crear grupo"}</button>
        </div>
      </Modal>}
    </section>
  )
}

function AssignOpeningControl({ opening, students, busy, onAssign }: {
  opening: PlanOpening
  students: StudentPlan[]
  busy: boolean
  onAssign: (studentId: string) => void
}) {
  const [studentId, setStudentId] = useState("")
  if (students.length === 0) return null
  return <div className="pl-opening-assign">
    <label htmlFor={`opening-student-${opening.id}`}>Agregar estudiante del plan a este grupo</label>
    <select id={`opening-student-${opening.id}`} className="ui-select" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
      <option value="">Selecciona un estudiante sin grupo</option>
      {students.map((student) => <option key={student.usuario_id} value={student.usuario_id}>{student.apellidos}, {student.nombres} · CI {student.ci}</option>)}
    </select>
    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || !studentId} onClick={() => { onAssign(studentId); setStudentId("") }}>Agregar</button>
  </div>
}
