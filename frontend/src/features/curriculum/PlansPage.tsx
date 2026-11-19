import { useEffect, useMemo, useState } from "react"

import { api, type Career, type PlanState, type StudentPlan, type StudyPlan, type Subject } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"

const stateLabels: Record<PlanState, string> = {
  BORRADOR: "Borrador",
  VIGENTE: "Vigente",
  INACTIVO: "Inactivo",
}

export function PlansPage() {
  const [activeSection, setActiveSection] = useState<"semesters" | "subjects" | "prerequisites">("semesters")
  const [careers, setCareers] = useState<Career[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [students, setStudents] = useState<StudentPlan[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [careerId, setCareerId] = useState("")
  const [planCode, setPlanCode] = useState("")
  const [modality, setModality] = useState<"MODULAR" | "SEMESTRAL">("SEMESTRAL")
  const [unitNumber, setUnitNumber] = useState("1")
  const [unitName, setUnitName] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [unitId, setUnitId] = useState("")
  const [prerequisiteFor, setPrerequisiteFor] = useState("")
  const [prerequisiteId, setPrerequisiteId] = useState("")
  const [assignmentSelection, setAssignmentSelection] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedId) ?? null, [plans, selectedId])
  const allPlanSubjects = selectedPlan?.unidades.flatMap((unit) => unit.materias) ?? []

  async function reload() {
    const [careerData, subjectData, planData, studentData] = await Promise.all([
      api.listCareers(), api.listSubjects(), api.listPlans(), api.listStudentPlanAssignments(),
    ])
    setCareers(careerData)
    setSubjects(subjectData)
    setPlans(planData)
    setStudents(studentData)
    if (!careerId && careerData[0]) setCareerId(careerData[0].id)
    if (!planData.some((plan) => plan.id === selectedId)) setSelectedId(planData[0]?.id ?? "")
    setAssignmentSelection(Object.fromEntries(studentData.map((student) => [student.usuario_id, student.plan_estudio_id ?? ""])))
  }

  useEffect(() => {
    void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [])

  async function run(action: () => Promise<unknown>) {
    setError("")
    try {
      await action()
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la operación.")
    }
  }

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    try {
      const plan = await api.createPlan({ carrera_id: careerId, codigo: planCode, modalidad: modality })
      setSelectedId(plan.id)
      setActiveSection("semesters")
      setPlanCode("")
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear el plan.")
    }
  }

  async function addUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPlan) return
    await run(() => api.createPlanUnit(selectedPlan.id, { numero: Number(unitNumber), nombre: unitName }))
    setUnitName("")
  }

  async function addSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPlan) return
    await run(() => api.addPlanSubject(selectedPlan.id, { materia_id: subjectId, unidad_id: unitId }))
  }

  async function addPrerequisite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPlan || !prerequisiteFor) return
    await run(() => api.addPrerequisite(selectedPlan.id, prerequisiteFor, prerequisiteId))
  }

  async function assignPlan(student: StudentPlan) {
    const nextPlan = assignmentSelection[student.usuario_id]
    if (!nextPlan || nextPlan === student.plan_estudio_id) return
    await run(() => api.assignStudentPlan(student.usuario_id, nextPlan))
  }

  async function editPlanCode(plan: StudyPlan) {
    const code = window.prompt("Código del plan", plan.codigo)
    if (code === null) return
    await run(() => api.updatePlan(plan.id, { codigo: code }))
  }

  async function deletePlan(plan: StudyPlan) {
    if (!window.confirm(`¿Eliminar el plan ${plan.codigo}?`)) return
    await run(() => api.deletePlan(plan.id))
    if (selectedId === plan.id) setSelectedId("")
  }

  if (loading) return <main className="simple-page"><p className="loading-copy">Cargando currículo…</p></main>

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap">
        <span className="eyebrow">CURRÍCULO</span>
        <h1>Planes de estudio</h1>
        <p className="section-intro">Organiza planes modulares o semestrales y asigna el plan correspondiente a cada estudiante.</p>
        {error && <p role="alert" className="form-alert">{error}</p>}

        <div className="profile-grid users-grid">
          <section className="profile-card">
            <h2>Crear plan</h2>
            {careers.length === 0 ? <p>Primero registra una carrera.</p> : <form className="stack-form" onSubmit={(event) => void createPlan(event)}>
              <label>Carrera<select className="form-input" value={careerId} onChange={(event) => setCareerId(event.target.value)} required>
                {careers.map((career) => <option key={career.id} value={career.id}>{career.codigo} — {career.nombre}</option>)}
              </select></label>
              <label>Código<input className="form-input" value={planCode} onChange={(event) => setPlanCode(event.target.value)} required maxLength={32} /></label>
              <label>Modalidad<select className="form-input" value={modality} onChange={(event) => setModality(event.target.value as typeof modality)}>
                <option value="MODULAR">Modular</option><option value="SEMESTRAL">Semestral</option>
              </select></label>
              <p className="form-help">Todos los planes se organizan por semestres. En modalidad modular las materias se cursan en bloques mensuales; en semestral, en conjunto.</p>
              <button className="primary-button" type="submit">Crear borrador</button>
            </form>}
          </section>
          <section className="profile-card">
            <h2>Planes registrados</h2>
            {plans.length === 0 ? <p>Aún no hay planes.</p> : <div className="stack-form">
              <label>Selecciona un plan<select className="form-input" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setActiveSection("semesters") }}>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.codigo} — {plan.carrera_nombre} ({stateLabels[plan.estado]})</option>)}
              </select></label>
              {selectedPlan && <>
                <p>{selectedPlan.carrera_codigo} — {selectedPlan.carrera_nombre} · {selectedPlan.modalidad === "MODULAR" ? "Modalidad modular: cursado mensual" : "Modalidad semestral: cursado conjunto"}</p>
                <label>Estado<select className="form-input" value={selectedPlan.estado} onChange={(event) => void run(() => api.updatePlan(selectedPlan.id, { estado: event.target.value as PlanState }))}>
                  {(selectedPlan.estado === "BORRADOR" ? ["BORRADOR", "VIGENTE", "INACTIVO"] : selectedPlan.estado === "VIGENTE" ? ["VIGENTE", "INACTIVO"] : ["INACTIVO", "VIGENTE"]).map((value) => <option key={value} value={value}>{stateLabels[value as PlanState]}</option>)}
                </select></label>
                <div className="table-actions">
                  {selectedPlan.estado === "BORRADOR" && <button className="text-action" onClick={() => void editPlanCode(selectedPlan)}>Editar código</button>}
                  <button className="text-action" onClick={() => void deletePlan(selectedPlan)}>Eliminar plan</button>
                </div>
              </>}
            </div>}
          </section>
        </div>

        {selectedPlan && <>
          <h2 className="subsection-heading">Diseño del plan: {selectedPlan.codigo}</h2>
          {selectedPlan.estado !== "BORRADOR" && <p className="notice-box">La estructura de un plan solo se modifica mientras está en borrador. Para cambiar un plan vigente, crea otro.</p>}
          <p className="section-intro">El semestre organiza las materias del plan. La modalidad cambia el ritmo de cursado, no el semestre al que pertenece cada materia.</p>
          <div className="plan-tabs" role="tablist" aria-label="Diseño del plan de estudios">
            <button className={activeSection === "semesters" ? "plan-tab active" : "plan-tab"} role="tab" aria-selected={activeSection === "semesters"} onClick={() => setActiveSection("semesters")}>Semestres</button>
            <button className={activeSection === "subjects" ? "plan-tab active" : "plan-tab"} role="tab" aria-selected={activeSection === "subjects"} onClick={() => setActiveSection("subjects")}>Materias</button>
            <button className={activeSection === "prerequisites" ? "plan-tab active" : "plan-tab"} role="tab" aria-selected={activeSection === "prerequisites"} onClick={() => setActiveSection("prerequisites")}>Prerrequisitos</button>
          </div>
          {activeSection === "semesters" && selectedPlan.estado === "BORRADOR" && <div className="profile-grid users-grid">
            <section className="profile-card">
              <h3>Agregar semestre</h3>
              <form className="stack-form" onSubmit={(event) => void addUnit(event)}>
                <label>Número de semestre<input className="form-input" type="number" min={1} value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} required /></label>
                <label>Nombre<input className="form-input" value={unitName} onChange={(event) => setUnitName(event.target.value)} required maxLength={120} placeholder="Ej.: Primer semestre" /></label>
                <button className="primary-button" type="submit">Agregar semestre</button>
              </form>
            </section>
          </div>}
          {activeSection === "subjects" && selectedPlan.estado === "BORRADOR" && <div className="profile-grid users-grid">
            <section className="profile-card">
              <h3>Incorporar materia al plan</h3>
              <p>Elige una materia del catálogo y asígnala a un semestre.</p>
              {subjects.length === 0 || selectedPlan.unidades.length === 0 ? <p>Registra materias y al menos un semestre para continuar.</p> : <form className="stack-form" onSubmit={(event) => void addSubject(event)}>
                <label>Materia<select className="form-input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>
                  <option value="">Selecciona una materia</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.codigo} — {subject.nombre}</option>)}
                </select></label>
                <label>Semestre<select className="form-input" value={unitId} onChange={(event) => setUnitId(event.target.value)} required>
                  <option value="">Selecciona un semestre</option>{selectedPlan.unidades.map((unit) => <option key={unit.id} value={unit.id}>Semestre {unit.numero}: {unit.nombre}</option>)}
                </select></label>
                <button className="primary-button" type="submit">Incorporar materia</button>
              </form>}
            </section>
          </div>}

          {activeSection === "semesters" && <section className="unit-list">
            {selectedPlan.unidades.map((unit) => <article className="profile-card unit-card" key={unit.id}>
              <div className="unit-card-heading"><div><h3>Semestre {unit.numero}: {unit.nombre}</h3><p>{unit.materias.length} materias asignadas</p></div>
                {selectedPlan.estado === "BORRADOR" && <div className="table-actions">
                  <button className="text-action" onClick={() => {
                    const name = window.prompt("Nombre del semestre", unit.nombre)
                    if (name !== null) void run(() => api.updatePlanUnit(selectedPlan.id, unit.id, { nombre: name }))
                  }}>Editar semestre</button>
                  <button className="text-action" onClick={() => {
                    if (window.confirm("¿Eliminar este semestre vacío?")) void run(() => api.deletePlanUnit(selectedPlan.id, unit.id))
                  }}>Eliminar semestre</button>
                </div>}
              </div>
            </article>)}
            {selectedPlan.unidades.length === 0 && <section className="profile-card"><p>Aún no hay semestres en este plan.</p></section>}
          </section>}

          {activeSection === "subjects" && <section className="unit-list">
            {selectedPlan.unidades.map((unit) => <article className="profile-card unit-card" key={unit.id}>
              <div className="unit-card-heading"><h3>Semestre {unit.numero}: {unit.nombre}</h3>
                <span className="role-badge">{unit.materias.length} materias</span>
              </div>
              {unit.materias.length === 0 ? <p>Sin materias asignadas.</p> : <div className="plan-subject-list">
                {unit.materias.map((subject) => <div className="plan-subject-row" key={subject.id}>
                  <div><strong>{subject.codigo} — {subject.nombre}</strong>
                    <small>{subject.prerrequisitos.length ? `Debe aprobar: ${subject.prerrequisitos.map((id) => allPlanSubjects.find((candidate) => candidate.id === id)?.codigo ?? "Materia").join(", ")}` : "Sin prerrequisitos"}</small>
                  </div>
                  {selectedPlan.estado === "BORRADOR" && <div className="table-actions">
                    <select className="form-input compact-select" aria-label={`Mover ${subject.nombre} a otro semestre`} value={unit.id} onChange={(event) => void run(() => api.movePlanSubject(selectedPlan.id, subject.id, event.target.value))}>
                      {selectedPlan.unidades.map((target) => <option key={target.id} value={target.id}>Semestre {target.numero}: {target.nombre}</option>)}
                    </select>
                    <button className="text-action" onClick={() => {
                      if (window.confirm(`¿Retirar ${subject.nombre} del plan?`)) void run(() => api.removePlanSubject(selectedPlan.id, subject.id))
                    }}>Retirar</button>
                  </div>}
                </div>)}
              </div>}
            </article>)}
          </section>}

          {activeSection === "prerequisites" && selectedPlan.estado === "BORRADOR" && allPlanSubjects.length > 1 && <section className="profile-card prerequisite-card">
            <h3>Prerrequisitos</h3>
            <p>Para cursar una materia, se deben aprobar todos sus prerrequisitos con nota final de 51 o más.</p>
            <form className="inline-form" onSubmit={(event) => void addPrerequisite(event)}>
              <label>Para cursar<select className="form-input" value={prerequisiteFor} onChange={(event) => setPrerequisiteFor(event.target.value)} required>
                <option value="">Selecciona una materia</option>{allPlanSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.codigo} — {subject.nombre}</option>)}
              </select></label>
              <label>Antes debe aprobar<select className="form-input" value={prerequisiteId} onChange={(event) => setPrerequisiteId(event.target.value)} required>
                <option value="">Selecciona el prerrequisito</option>{allPlanSubjects.filter((subject) => subject.id !== prerequisiteFor).map((subject) => <option key={subject.id} value={subject.id}>{subject.codigo} — {subject.nombre}</option>)}
              </select></label>
              <button className="primary-button" type="submit">Agregar requisito</button>
            </form>
            {allPlanSubjects.some((subject) => subject.prerrequisitos.length > 0) && <ul className="prerequisite-list">
              {allPlanSubjects.flatMap((subject) => subject.prerrequisitos.map((requirement) => <li key={`${subject.id}-${requirement}`}>
                Para cursar {subject.codigo}, debe aprobar {allPlanSubjects.find((candidate) => candidate.id === requirement)?.codigo ?? "materia"}
                <button className="text-action" onClick={() => void run(() => api.removePrerequisite(selectedPlan.id, subject.id, requirement))}>Quitar</button>
              </li>))}
            </ul>}
          </section>}
          {activeSection === "prerequisites" && selectedPlan.estado === "BORRADOR" && allPlanSubjects.length <= 1 && <section className="profile-card prerequisite-card"><h3>Prerrequisitos</h3><p>Agrega al menos dos materias al plan para configurar una dependencia.</p></section>}
          {activeSection === "prerequisites" && selectedPlan.estado !== "BORRADOR" && <section className="profile-card prerequisite-card">
            <h3>Prerrequisitos</h3><p>Para cursar una materia, se deben aprobar todos sus prerrequisitos con nota final de 51 o más.</p>
            {allPlanSubjects.some((subject) => subject.prerrequisitos.length > 0) ? <ul className="prerequisite-list">{allPlanSubjects.flatMap((subject) => subject.prerrequisitos.map((requirement) => <li key={`${subject.id}-${requirement}`}>Para cursar {subject.codigo}, debe aprobar {allPlanSubjects.find((candidate) => candidate.id === requirement)?.codigo ?? "materia"}</li>))}</ul> : <p>Este plan no tiene prerrequisitos configurados.</p>}
          </section>}
        </>}

        <details className="profile-card assignments-card">
          <summary>Asignar planes a estudiantes</summary>
          <p>El plan puede corregirse mientras el estudiante no tenga inscripciones ni notas.</p>
          {students.length === 0 ? <p>No hay cuentas de estudiante registradas.</p> : <div className="table-scroll"><table>
            <thead><tr><th>Estudiante</th><th>Plan asignado</th><th>Nuevo plan</th><th></th></tr></thead>
            <tbody>{students.map((student) => <tr key={student.usuario_id}>
              <td><strong>{student.apellidos}, {student.nombres}</strong><small>CI {student.ci}</small></td>
              <td>{student.plan_codigo ?? "Sin asignar"}</td>
              <td><select className="form-input" value={assignmentSelection[student.usuario_id] ?? ""} onChange={(event) => setAssignmentSelection({ ...assignmentSelection, [student.usuario_id]: event.target.value })}>
                <option value="">Selecciona un plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.codigo} — {plan.carrera_nombre} ({stateLabels[plan.estado]})</option>)}
              </select></td>
              <td><button className="text-action" disabled={!assignmentSelection[student.usuario_id] || assignmentSelection[student.usuario_id] === student.plan_estudio_id} onClick={() => void assignPlan(student)}>Asignar</button></td>
            </tr>)}</tbody>
          </table></div>}
        </details>
      </section>
    </main>
  )
}
