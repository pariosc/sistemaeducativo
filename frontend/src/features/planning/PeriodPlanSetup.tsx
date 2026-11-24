import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { Career, Faculty, PeriodPlanning, PlanOpening, StudentPlan, StudyPlan } from "../../api/client"
import { ButtonLabel, EmptyState, Notices, StatusBadge } from "../shared/ui"

export function PeriodPlanSetup({ periodId }: { periodId: string }) {
  const [planning, setPlanning] = useState<PeriodPlanning | null>(null)
  const [careers, setCareers] = useState<Career[]>([])
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [openings, setOpenings] = useState<PlanOpening[]>([])
  const [students, setStudents] = useState<StudentPlan[]>([])
  const [careerId, setCareerId] = useState("")
  const [facultyId, setFacultyId] = useState("")
  const [planId, setPlanId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function reload() {
    const [selection, careerRows, facultyRows, planRows, studentRows] = await Promise.all([
      api.getPeriodPlanning(periodId), api.listCareers(), api.listFaculties(), api.listPlans(), api.listStudentPlanAssignments(),
    ])
    setPlanning(selection)
    setCareers(careerRows)
    setFaculties(facultyRows)
    setPlans(planRows)
    setStudents(studentRows)
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la solicitud.")
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

  return (
    <section className="pl-section" aria-labelledby="period-plans-title">
      <h2 id="period-plans-title">Carreras y planes de este semestre</h2>
      <p className="pl-lead">Selecciona las carreras que participarán. Incorpora sus planes vigentes y registra cada nuevo grupo de ingreso; un mismo plan puede recibir grupos en distintos semestres.</p>
      <Notices notice={notice} error={error} />

      <div className="pl-plan-setup-actions">
        <div className="ui-field">
          <label htmlFor="period-faculty">Facultad</label>
          <select id="period-faculty" className="ui-select" value={facultyId} onChange={(event) => { setFacultyId(event.target.value); setCareerId(""); setPlanId("") }}>
            <option value="">Selecciona una facultad</option>
            {availableFaculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.nombre}</option>)}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="period-add-career">Carrera</label>
          <select id="period-add-career" className="ui-select" value={careerId} disabled={!facultyId} onChange={(event) => { setCareerId(event.target.value); setPlanId("") }}>
            <option value="">Selecciona una carrera</option>
            {availableCareers.map((career) => <option key={career.id} value={career.id}>{career.nombre}{planning?.carrera_ids.includes(career.id) ? " · incorporada" : ""}</option>)}
          </select>
        </div>
        <button type="button" className="ui-btn ui-btn-secondary" disabled={busy || !careerId || planning?.carrera_ids.includes(careerId)} onClick={() => void act(() => api.addPeriodCareer(periodId, careerId), "Carrera incorporada al semestre.")}><ButtonLabel icon="plus">Incorporar carrera</ButtonLabel></button>
        {careerId && planning?.carrera_ids.includes(careerId) && <>
          <div className="ui-field">
            <label htmlFor="period-add-plan">Plan vigente</label>
            <select id="period-add-plan" className="ui-select" value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">Selecciona un plan</option>
              {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.codigo} · {plan.modalidad} · {Math.max(0, ...plan.unidades.map((unit) => unit.numero))} semestres</option>)}
            </select>
          </div>
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !planId} onClick={() => { const chosen = planId; setPlanId(""); void act(() => api.addPeriodPlan(periodId, chosen), "Plan incorporado al semestre.") }}><ButtonLabel icon="plus">Incorporar plan</ButtonLabel></button>
        </>}
      </div>

      {!planning ? <p role="status">Cargando carreras y planes…</p> : selectedCareers.length === 0 ? (
        <EmptyState icon="layers" title="Todavía no hay carreras seleccionadas">Incorpora una carrera para planificar sus materias.</EmptyState>
      ) : (
        <div className="pl-period-careers">
          {selectedCareers.map((career) => {
            const ownPlans = plans.filter((plan) => plan.carrera_id === career.id && planning.plan_ids.includes(plan.id))
            return <article key={career.id} className="ui-card pl-period-career">
              <div className="pl-toolbar">
                <div><h3>{career.nombre}</h3><p>{career.facultad_nombre} · {career.codigo}</p></div>
                {ownPlans.length === 0 && <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger" disabled={busy} onClick={() => void act(() => api.removePeriodCareer(periodId, career.id), "Carrera quitada del semestre.")}>Quitar carrera</button>}
              </div>
              {ownPlans.length === 0 ? <p>Incorpora un plan vigente para ver sus materias.</p> : (
                <ul className="pl-period-plans">
                  {ownPlans.map((plan) => {
                    const groups = openings.filter((opening) => opening.plan_id === plan.id && opening.semestre_proyectado !== null)
                    const startedHere = groups.some((opening) => opening.periodo_inicio_id === periodId)
                    return <li key={plan.id}>
                      <div className="pl-period-plan-head">
                        <div><strong>{plan.codigo}</strong> <StatusBadge tone="gray">{plan.modalidad}</StatusBadge><span> · {Math.max(0, ...plan.unidades.map((unit) => unit.numero))} semestres curriculares</span></div>
                        <div className="pl-period-plan-actions">
                          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || startedHere} onClick={() => void act(() => api.createPlanOpening(periodId, plan.id), `Nuevo grupo de ingreso creado para ${plan.codigo}.`)}><ButtonLabel icon="plus">{startedHere ? "Grupo iniciado aquí" : "Iniciar grupo aquí"}</ButtonLabel></button>
                          {!startedHere && !groups.length && <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger" disabled={busy} onClick={() => void act(() => api.removePeriodPlan(periodId, plan.id), "Plan quitado del semestre.")}>Quitar plan</button>}
                        </div>
                      </div>
                      {groups.length === 0 ? <p>Sin grupos iniciados. Podrás programar materias del plan igualmente.</p> : <ul className="pl-cohort-list">{groups.map((group) => <li key={group.id}>
                        <span>Ingreso {group.periodo_denominacion} · semestre previsto {group.semestre_proyectado} · {group.estudiantes} estudiantes</span>
                        <ol className="pl-cohort-timeline" aria-label={`Secuencia prevista del ingreso ${group.periodo_denominacion}`}>
                          {group.proyeccion.map((slot) => <li key={slot.semestre_numero} data-current={slot.periodo_id === periodId ? "" : undefined}><strong>{slot.semestre_numero}</strong><small>{slot.periodo_denominacion ?? "Por programar"}</small></li>)}
                        </ol>
                        <AssignOpeningControl opening={group} students={students.filter((student) => student.plan_estudio_id === plan.id && !student.apertura_plan_id)} busy={busy} onAssign={(studentId) => void act(() => api.assignStudentOpening(studentId, group.id), "Estudiante agregado al grupo de ingreso.")} />
                      </li>)}</ul>}
                      <a className="ui-link-button" href={`/admin/paralelos?periodo_id=${periodId}&plan_id=${plan.id}`}>Planificar materias y horarios</a>
                    </li>
                  })}
                </ul>
              )}
            </article>
          })}
        </div>
      )}
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
