import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, RefObject } from "react"

import { api } from "../../api/client"
import type { Career, PlanDiagnostic, PlanModality, PlanOpening, PlanState, PlanSubject, PlanUnit, StudentPlan, StudyPlan, Subject } from "../../api/client"
import { Icon } from "../shared/icons"
import { Modal } from "../shared/Modal"
import { ButtonLabel, ConfirmDialog, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { codeSchema, labelSchema, messageOf, positiveIntSchema } from "../shared/validation"
import { CurriculumShell } from "./CurriculumShell"
import "./plans.css"

/* ------------------------------------------------------------------ */
/* Constantes y utilidades                                             */
/* ------------------------------------------------------------------ */

const STATE_LABEL: Record<PlanState, string> = { BORRADOR: "Borrador", VIGENTE: "Vigente", INACTIVO: "Inactivo" }
const STATE_TONE: Record<PlanState, "amber" | "green" | "gray"> = { BORRADOR: "amber", VIGENTE: "green", INACTIVO: "gray" }
const MODALITY_LABEL: Record<PlanModality, string> = { MODULAR: "Modular", SEMESTRAL: "Semestral" }
const MODALITY_HELP: Record<PlanModality, string> = {
  SEMESTRAL: "Las materias se cursan en conjunto durante el semestre.",
  MODULAR: "Las materias se cursan en bloques mensuales.",
}
const NEXT_STATES: Record<PlanState, PlanState[]> = { BORRADOR: ["VIGENTE", "INACTIVO"], VIGENTE: ["INACTIVO"], INACTIVO: ["VIGENTE"] }
const STATE_ACTION: Record<PlanState, string> = { BORRADOR: "Publicar plan", VIGENTE: "Desactivar plan", INACTIVO: "Reactivar plan" }
const MAX_BULK_SUBJECTS = 50

type TabId = "map" | "students"
const TABS: { id: TabId; label: string }[] = [
  { id: "map", label: "Malla curricular" },
  { id: "students", label: "Estudiantes" },
]

type Dialog =
  | { kind: "create-plan" }
  | { kind: "edit-plan" }
  | { kind: "plan-state" }
  | { kind: "duplicate-plan" }
  | { kind: "add-unit" }
  | { kind: "generate-units" }
  | { kind: "edit-unit"; unit: PlanUnit }
  | { kind: "add-subject"; unit: PlanUnit }
  | { kind: "manage-subject"; subjectId: string }
  | { kind: "assign-student" }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; onConfirm: () => void }

interface PlanActions {
  open: (dialog: Dialog) => void
  deletePlan: () => void
  deleteUnit: (unit: PlanUnit) => void
  moveSubject: (subjectId: string, unit: PlanUnit) => void
  renumber: () => void
}

interface PrerequisiteCandidate {
  id: string
  label: string
  later: boolean
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const fullName = (student: StudentPlan) => `${student.apellidos}, ${student.nombres}`
const sortedUnits = (plan: StudyPlan) => [...plan.unidades].sort((a, b) => a.numero - b.numero)
const allSubjectsOf = (plan: StudyPlan) => plan.unidades.flatMap((unit) => unit.materias)
const errorsOf = (plan: StudyPlan) => plan.diagnosticos.filter((item) => item.tipo === "error")
const warningsOf = (plan: StudyPlan) => plan.diagnosticos.filter((item) => item.tipo === "warning")
const issueSubjectIds = (plan: StudyPlan) => new Set(plan.diagnosticos.flatMap((item) => (item.materia_plan_id ? [item.materia_plan_id] : [])))
const nextUnitNumber = (plan: StudyPlan) => plan.unidades.reduce((max, unit) => Math.max(max, unit.numero), 0) + 1
const numbersAreContiguous = (plan: StudyPlan) => sortedUnits(plan).every((unit, index) => unit.numero === index + 1)
const copyCode = (code: string) => `${code.slice(0, 32 - "-COPIA".length)}-COPIA`

function findSubject(plan: StudyPlan, subjectId: string) {
  for (const unit of plan.unidades) {
    const subject = unit.materias.find((candidate) => candidate.id === subjectId)
    if (subject) return { subject, unit }
  }
  return null
}

function planStats(plan: StudyPlan) {
  const subjects = allSubjectsOf(plan)
  return {
    semesters: plan.total_semestres,
    subjects: plan.total_materias,
    prerequisites: subjects.reduce((total, subject) => total + subject.prerrequisitos.length, 0),
  }
}

function planReadiness(plan: StudyPlan) {
  const errors = errorsOf(plan).length
  const warnings = warningsOf(plan).length
  if (errors) return { tone: "error", label: `${plural(errors, "error", "errores")} para publicar` }
  if (warnings) return { tone: "warning", label: `${plural(warnings, "advertencia", "advertencias")} por revisar` }
  if (plan.estado === "BORRADOR") return { tone: "ok", label: "Listo para publicar" }
  if (plan.estado === "VIGENTE") return { tone: "ok", label: "En uso" }
  return { tone: "muted", label: "Fuera de uso" }
}

/**
 * Materias que pueden agregarse como prerrequisito sin crear un ciclo.
 * Se excluyen la propia materia, las que ya son requisito y todas las que
 * dependen directa o indirectamente de ella (agregarlas cerraría el ciclo).
 */
function prerequisiteCandidates(plan: StudyPlan, subject: PlanSubject): PrerequisiteCandidate[] {
  const subjects = allSubjectsOf(plan)
  const semesterById = new Map<string, number>()
  for (const unit of plan.unidades) for (const candidate of unit.materias) semesterById.set(candidate.id, unit.numero)
  const reverse = new Map<string, string[]>()
  for (const candidate of subjects) {
    for (const requirementId of candidate.prerrequisitos) {
      const dependents = reverse.get(requirementId) ?? []
      dependents.push(candidate.id)
      reverse.set(requirementId, dependents)
    }
  }
  const blocked = new Set<string>([subject.id])
  const pending = [subject.id]
  while (pending.length > 0) {
    const current = pending.pop() as string
    for (const dependentId of reverse.get(current) ?? []) {
      if (!blocked.has(dependentId)) {
        blocked.add(dependentId)
        pending.push(dependentId)
      }
    }
  }
  const subjectSemester = semesterById.get(subject.id) ?? 0
  return subjects
    .filter((candidate) => !blocked.has(candidate.id) && !subject.prerrequisitos.includes(candidate.id))
    .map((candidate) => {
      const semester = semesterById.get(candidate.id) ?? 0
      return {
        id: candidate.id,
        label: `${candidate.codigo} — ${candidate.nombre} (Semestre ${semester})`,
        later: semester > subjectSemester,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es"))
}

/* ------------------------------------------------------------------ */
/* Página (contenedor): datos, acciones y diálogos                     */
/* ------------------------------------------------------------------ */

export function PlansPage() {
  const [careers, setCareers] = useState<Career[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [students, setStudents] = useState<StudentPlan[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [tab, setTab] = useState<TabId>("map")
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [dialogError, setDialogError] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filterText, setFilterText] = useState("")
  const [filterState, setFilterState] = useState<"" | PlanState>("")
  const [filterCareer, setFilterCareer] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedId) ?? null, [plans, selectedId])
  const eligibleCareers = useMemo(() => careers.filter((career) => career.activo && career.facultad_activa), [careers])

  async function reload() {
    const [careerData, subjectData, planData, studentData] = await Promise.all([
      api.listCareers(), api.listSubjects(), api.listPlans(), api.listStudentPlanAssignments(),
    ])
    setCareers(careerData)
    setSubjects(subjectData)
    setPlans(planData)
    setStudents(studentData)
    // Si el plan abierto ya no existe (p. ej. se eliminó), se vuelve a la lista.
    setSelectedId((current) => (planData.some((plan) => plan.id === current) ? current : ""))
  }

  useEffect(() => {
    void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [])

  // Al pasar de la lista al detalle (y viceversa) el foco va al título: orienta a quien usa teclado o lector de pantalla.
  useEffect(() => { headingRef.current?.focus() }, [selectedId])

  async function run(action: () => Promise<unknown>, success: string, scope: "page" | "dialog" = "page"): Promise<boolean> {
    setBusy(true)
    setError("")
    setDialogError("")
    setNotice("")
    try {
      await action()
      await reload()
      setNotice(success)
      return true
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "No se pudo completar la operación."
      if (scope === "dialog") setDialogError(message)
      else setError(message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const dialogAction = (action: () => Promise<unknown>, success: string) => run(action, success, "dialog")
  function openDialog(next: Dialog) { setDialogError(""); setDialog(next) }
  function closeDialog() { setDialog(null); setDialogError("") }

  async function submitDialog(action: () => Promise<unknown>, success: string) {
    if (await dialogAction(action, success)) closeDialog()
  }

  function confirmAction(title: string, message: string, confirmLabel: string, action: () => Promise<unknown>, success: string) {
    openDialog({ kind: "confirm", title, message, confirmLabel, onConfirm: () => { void submitDialog(action, success) } })
  }

  function openPlan(id: string) { setError(""); setNotice(""); setTab("map"); setSelectedId(id) }
  function backToList() { setError(""); setNotice(""); setSelectedId("") }

  async function createPlan(data: { carrera_id: string; codigo: string; modalidad: PlanModality }) {
    let createdId = ""
    const ok = await dialogAction(
      async () => { createdId = (await api.createPlan(data)).id },
      `Plan ${data.codigo} creado como borrador. Ahora agrega sus semestres y materias.`,
    )
    if (ok) { closeDialog(); setTab("map"); setSelectedId(createdId) }
  }

  async function duplicatePlan(code: string) {
    if (!selectedPlan) return
    let createdId = ""
    const ok = await dialogAction(
      async () => { createdId = (await api.duplicatePlan(selectedPlan.id, code)).id },
      `Plan copiado como ${code}. Se creó en borrador con la misma estructura.`,
    )
    if (ok) { closeDialog(); setTab("map"); setSelectedId(createdId) }
  }

  const actions: PlanActions | null = selectedPlan && {
    open: openDialog,
    deletePlan: () => confirmAction(
      `Eliminar el plan ${selectedPlan.codigo}`,
      "Se eliminará el plan junto con sus semestres, materias y prerrequisitos. Esta acción no se puede deshacer.",
      "Eliminar plan",
      () => api.deletePlan(selectedPlan.id),
      `Plan ${selectedPlan.codigo} eliminado.`,
    ),
    deleteUnit: (unit) => confirmAction(
      `Eliminar el semestre ${unit.numero}`,
      `Se eliminará «${unit.nombre}». Solo se pueden eliminar semestres sin materias.`,
      "Eliminar semestre",
      () => api.deletePlanUnit(selectedPlan.id, unit.id),
      `Semestre ${unit.numero} eliminado.`,
    ),
    moveSubject: (subjectId, unit) => {
      const found = findSubject(selectedPlan, subjectId)
      if (!found) return
      void run(() => api.movePlanSubject(selectedPlan.id, subjectId, unit.id), `${found.subject.codigo} se movió al semestre ${unit.numero}.`)
    },
    renumber: () => confirmAction(
      "Renumerar semestres",
      "Los semestres se numerarán 1, 2, 3… en el orden actual. Las materias y los prerrequisitos se conservan.",
      "Renumerar",
      () => api.renumberPlanUnits(selectedPlan.id),
      "Semestres renumerados.",
    ),
  }

  function renderDialog() {
    if (!dialog) return null
    const common = { busy, error: dialogError, onClose: closeDialog }
    if (dialog.kind === "create-plan") return <CreatePlanDialog {...common} careers={eligibleCareers} onSubmit={(data) => void createPlan(data)} />
    if (dialog.kind === "confirm") return <ConfirmDialog {...common} title={dialog.title} message={dialog.message} confirmLabel={dialog.confirmLabel} onConfirm={dialog.onConfirm} />
    if (!selectedPlan) return null
    const plan = selectedPlan

    switch (dialog.kind) {
      case "edit-plan":
        return <EditPlanDialog {...common} plan={plan} onSubmit={(codigo) => void submitDialog(() => api.updatePlan(plan.id, { codigo }), "Código del plan actualizado.")} />
      case "plan-state":
        return <PlanStateDialog {...common} plan={plan} onSubmit={(estado) => void submitDialog(
          () => api.updatePlan(plan.id, { estado }),
          estado === "VIGENTE"
            ? (plan.estado === "INACTIVO" ? "El plan volvió a estar vigente." : "El plan quedó vigente y ya permite inscribir estudiantes.")
            : "El plan quedó inactivo para nuevas inscripciones.",
        )} />
      case "duplicate-plan":
        return <DuplicatePlanDialog {...common} plan={plan} onSubmit={(codigo) => void duplicatePlan(codigo)} />
      case "add-unit": {
        const next = nextUnitNumber(plan)
        return <UnitDialog {...common} mode="add" initialNumber={next} initialName={`Semestre ${next}`} existingNumbers={plan.unidades.map((unit) => unit.numero)} onSubmit={({ numero, nombre }) => void submitDialog(() => api.createPlanUnit(plan.id, { numero, nombre }), `Semestre ${numero} agregado.`)} />
      }
      case "generate-units":
        return <GenerateUnitsDialog {...common} plan={plan} onSubmit={(data) => void submitDialog(() => api.generatePlanUnits(plan.id, data), `Se agregaron ${plural(data.cantidad, "semestre", "semestres")}.`)} />
      case "edit-unit": {
        const unit = dialog.unit
        return <UnitDialog {...common} mode="edit" initialNumber={unit.numero} initialName={unit.nombre} existingNumbers={plan.unidades.map((candidate) => candidate.numero)} onSubmit={({ nombre }) => void submitDialog(() => api.updatePlanUnit(plan.id, unit.id, { nombre }), `Semestre ${unit.numero} actualizado.`)} />
      }
      case "add-subject": {
        const unit = dialog.unit
        const used = new Set(allSubjectsOf(plan).map((subject) => subject.materia_id))
        const available = subjects.filter((subject) => subject.activo && !used.has(subject.id))
        return <AddSubjectsDialog {...common} unit={unit} available={available} onSubmit={(materiaIds) => void submitDialog(
          () => api.addPlanSubjectsBulk(plan.id, { materia_ids: materiaIds, unidad_id: unit.id }),
          `${plural(materiaIds.length, "materia agregada", "materias agregadas")} al semestre ${unit.numero}.`,
        )} />
      }
      case "manage-subject": {
        const found = findSubject(plan, dialog.subjectId)
        if (!found) return null
        const { subject, unit } = found
        return (
          <ManageSubjectDialog
            {...common}
            plan={plan}
            subject={subject}
            unit={unit}
            editable={plan.estado === "BORRADOR"}
            onAddPrerequisite={(requirementId) => dialogAction(() => api.addPrerequisite(plan.id, subject.id, requirementId), `Prerrequisito agregado a ${subject.codigo}.`)}
            onRemovePrerequisite={(requirementId) => dialogAction(() => api.removePrerequisite(plan.id, subject.id, requirementId), `Prerrequisito quitado de ${subject.codigo}.`)}
            onMove={async (targetId) => {
              const target = plan.unidades.find((candidate) => candidate.id === targetId)
              if (await dialogAction(() => api.movePlanSubject(plan.id, subject.id, targetId), `${subject.codigo} se movió al semestre ${target?.numero ?? ""}.`)) closeDialog()
            }}
            onRetire={() => confirmAction(
              `Retirar ${subject.codigo} del plan`,
              `«${subject.nombre}» dejará de formar parte de este plan. También se quitarán los prerrequisitos que la involucran.`,
              "Retirar materia",
              () => api.removePlanSubject(plan.id, subject.id),
              `${subject.codigo} retirada del plan.`,
            )}
          />
        )
      }
      case "assign-student":
        return <AssignStudentDialog {...common} plan={plan} students={students} onSubmit={(student, openingId) => void submitDialog(
          () => api.assignStudentPlan(student.usuario_id, plan.id, openingId),
          `${fullName(student)} fue asignado al plan ${plan.codigo}.`,
        )} />
      default:
        return null
    }
  }

  if (loading) {
    return <CurriculumShell current="planes"><p className="cat-loading" role="status">Cargando currículo…</p></CurriculumShell>
  }

  return (
    <CurriculumShell current="planes">
      <Notices notice={notice} error={error} />
      {selectedPlan && actions ? (
        <PlanDetail plan={selectedPlan} students={students} tab={tab} headingRef={headingRef} onTab={setTab} onBack={backToList} actions={actions} />
      ) : (
        <PlanList
          plans={plans}
          students={students}
          filterText={filterText}
          filterState={filterState}
          filterCareer={filterCareer}
          headingRef={headingRef}
          onFilterText={setFilterText}
          onFilterState={setFilterState}
          onFilterCareer={setFilterCareer}
          onCreate={() => openDialog({ kind: "create-plan" })}
          onOpen={openPlan}
        />
      )}
      {renderDialog()}
    </CurriculumShell>
  )
}

/* ------------------------------------------------------------------ */
/* Vista 1: lista de planes (tarjetas)                                 */
/* ------------------------------------------------------------------ */

interface PlanListProps {
  plans: StudyPlan[]
  students: StudentPlan[]
  filterText: string
  filterState: "" | PlanState
  filterCareer: string
  headingRef: RefObject<HTMLHeadingElement | null>
  onFilterText: (value: string) => void
  onFilterState: (value: "" | PlanState) => void
  onFilterCareer: (value: string) => void
  onCreate: () => void
  onOpen: (id: string) => void
}

function PlanList({ plans, students, filterText, filterState, filterCareer, headingRef, onFilterText, onFilterState, onFilterCareer, onCreate, onOpen }: PlanListProps) {
  const query = filterText.trim().toLowerCase()
  const visible = plans.filter((plan) =>
    (!filterState || plan.estado === filterState) &&
    (!filterCareer || plan.carrera_id === filterCareer) &&
    (!query || `${plan.codigo} ${plan.carrera_codigo} ${plan.carrera_nombre}`.toLowerCase().includes(query)))
  const filtering = Boolean(query || filterState || filterCareer)
  const stateCounts = {
    BORRADOR: plans.filter((plan) => plan.estado === "BORRADOR").length,
    VIGENTE: plans.filter((plan) => plan.estado === "VIGENTE").length,
    INACTIVO: plans.filter((plan) => plan.estado === "INACTIVO").length,
  }
  const studentsWithoutPlan = students.filter((student) => !student.plan_estudio_id).length
  const assignedByPlan = new Map<string, number>()
  for (const student of students) {
    if (student.plan_estudio_id) assignedByPlan.set(student.plan_estudio_id, (assignedByPlan.get(student.plan_estudio_id) ?? 0) + 1)
  }
  const careerOptions = [...new Map(plans.map((plan) => [plan.carrera_id, { id: plan.carrera_id, codigo: plan.carrera_codigo, nombre: plan.carrera_nombre }])).values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es"))

  return (
    <>
      <PageHeader
        eyebrow="CURRÍCULO"
        title="Planes de estudio"
        description="Un plan define los semestres, las materias y los prerrequisitos de una carrera. El sistema valida la estructura antes de publicarlo."
        headingRef={headingRef}
        actions={<button type="button" className="ui-btn ui-btn-primary" onClick={onCreate}><ButtonLabel icon="plus">Nuevo plan</ButtonLabel></button>}
      />

      {plans.length > 0 && (
        <div className="plan-summary" aria-label="Resumen de planes">
          <span className="plan-summary-total"><strong>{plans.length}</strong> {plans.length === 1 ? "plan" : "planes"}</span>
          <span className="plan-summary-chip" data-tone="amber">{stateCounts.BORRADOR} en borrador</span>
          <span className="plan-summary-chip" data-tone="green">{stateCounts.VIGENTE} vigente(s)</span>
          <span className="plan-summary-chip" data-tone="gray">{stateCounts.INACTIVO} inactivo(s)</span>
          {studentsWithoutPlan > 0 && <span className="plan-summary-chip" data-tone="blue">{plural(studentsWithoutPlan, "estudiante sin plan", "estudiantes sin plan")}</span>}
        </div>
      )}

      {plans.length > 0 && studentsWithoutPlan > 0 && (
        <p className="ui-alert ui-alert-info">
          {plural(studentsWithoutPlan, "estudiante aún no tiene plan asignado", "estudiantes aún no tienen plan asignado")}.
          Asígnalos desde la pestaña «Estudiantes» de cada plan.
        </p>
      )}

      {plans.length > 0 && (
        <div className="plan-filters">
          <div className="ui-field">
            <label htmlFor="plan-search">Buscar por código o carrera</label>
            <input id="plan-search" type="search" className="ui-input" value={filterText} onChange={(event) => onFilterText(event.target.value)} />
          </div>
          <div className="ui-field">
            <label htmlFor="plan-filter-state">Estado</label>
            <select id="plan-filter-state" className="ui-select" value={filterState} onChange={(event) => onFilterState(event.target.value as "" | PlanState)}>
              <option value="">Todos</option>
              {(Object.keys(STATE_LABEL) as PlanState[]).map((state) => <option key={state} value={state}>{STATE_LABEL[state]}</option>)}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="plan-filter-career">Carrera</label>
            <select id="plan-filter-career" className="ui-select" value={filterCareer} onChange={(event) => onFilterCareer(event.target.value)}>
              <option value="">Todas</option>
              {careerOptions.map((career) => <option key={career.id} value={career.id}>{career.codigo} — {career.nombre}</option>)}
            </select>
          </div>
        </div>
      )}
      {filtering && <p className="plan-count" role="status">Mostrando {visible.length} de {plans.length} planes.</p>}

      {plans.length === 0 ? (
        <div>
          <EmptyState icon="layers" title="Aún no hay planes de estudio">
            Usa «Nuevo plan» para crear el primero. Se crea como borrador y puedes armarlo con calma antes de publicarlo.
          </EmptyState>
          <div className="plan-empty-actions"><button type="button" className="ui-btn ui-btn-primary" onClick={onCreate}><ButtonLabel icon="plus">Nuevo plan</ButtonLabel></button></div>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="Ningún plan coincide con el filtro" />
      ) : (
        <ul className="plan-grid">
          {visible.map((plan) => {
            const stats = planStats(plan)
            const readiness = planReadiness(plan)
            return (
              <li key={plan.id}>
                <article className="plan-card" data-state={plan.estado}>
                  <div className="plan-card-top">
                    <StatusBadge tone={STATE_TONE[plan.estado]}>{STATE_LABEL[plan.estado]}</StatusBadge>
                    <span className="plan-card-mod">{MODALITY_LABEL[plan.modalidad]}</span>
                  </div>
                  <h3>{plan.codigo}</h3>
                  <p className="plan-card-career">{plan.carrera_nombre} · {plan.carrera_codigo}</p>
                  <p className={`plan-card-status plan-card-status--${readiness.tone}`}>{readiness.label}</p>
                  <dl className="plan-card-stats">
                    <div><dt>Semestres</dt><dd>{stats.semesters}</dd></div>
                    <div><dt>Materias</dt><dd>{stats.subjects}</dd></div>
                    <div><dt>Requisitos</dt><dd>{stats.prerequisites}</dd></div>
                    <div><dt>Estudiantes</dt><dd>{assignedByPlan.get(plan.id) ?? 0}</dd></div>
                  </dl>
                  <button type="button" className="ui-btn ui-btn-secondary" aria-label={`Ver plan ${plan.codigo}`} onClick={() => onOpen(plan.id)}><ButtonLabel icon="arrow">Ver plan</ButtonLabel></button>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Vista 2: detalle de un plan (cabecera + pestañas)                   */
/* ------------------------------------------------------------------ */

interface PlanDetailProps {
  plan: StudyPlan
  students: StudentPlan[]
  tab: TabId
  headingRef: RefObject<HTMLHeadingElement | null>
  onTab: (tab: TabId) => void
  onBack: () => void
  actions: PlanActions
}

function PlanDetail({ plan, students, tab, headingRef, onTab, onBack, actions }: PlanDetailProps) {
  const editable = plan.estado === "BORRADOR"
  const stats = planStats(plan)
  const assigned = students.filter((student) => student.plan_estudio_id === plan.id)
  const counts: Record<TabId, number> = { map: stats.subjects, students: assigned.length }
  const readiness = planReadiness(plan)

  return (
    <>
      <nav className="plan-breadcrumb" aria-label="Ruta de navegación">
        <ol>
          <li><button type="button" className="ui-link-button" onClick={onBack}><Icon name="back" size={14} />Planes de estudio</button></li>
          <li aria-current="page">{plan.codigo}</li>
        </ol>
      </nav>

      <div className="plan-hero" data-state={plan.estado}>
        <div className="plan-hero-main">
          <StatusBadge tone={STATE_TONE[plan.estado]}>{STATE_LABEL[plan.estado]}</StatusBadge>
          <h1 ref={headingRef} tabIndex={-1} className="ui-heading-focus">Plan {plan.codigo}</h1>
          <p className="plan-hero-sub">{plan.carrera_nombre} · {plan.carrera_codigo} · Modalidad {MODALITY_LABEL[plan.modalidad].toLowerCase()}</p>
          <p className={`plan-readiness plan-readiness--${readiness.tone}`}>{readiness.label}</p>
        </div>
        <dl className="plan-stats">
          <div><dt>Semestres</dt><dd>{stats.semesters}</dd></div>
          <div><dt>Materias</dt><dd>{stats.subjects}</dd></div>
          <div><dt>Requisitos</dt><dd>{stats.prerequisites}</dd></div>
        </dl>
        <div className="plan-hero-actions" role="group" aria-label="Acciones del plan">
          {plan.estado === "BORRADOR" && <button type="button" className="ui-btn ui-btn-primary" onClick={() => actions.open({ kind: "plan-state" })}><ButtonLabel icon="check">{STATE_ACTION.BORRADOR}</ButtonLabel></button>}
          {plan.estado === "VIGENTE" && <button type="button" className="ui-btn ui-btn-warning" onClick={() => actions.open({ kind: "plan-state" })}><ButtonLabel icon="pause">{STATE_ACTION.VIGENTE}</ButtonLabel></button>}
          {plan.estado === "INACTIVO" && <button type="button" className="ui-btn ui-btn-success-outline" onClick={() => actions.open({ kind: "plan-state" })}><ButtonLabel icon="play">{STATE_ACTION.INACTIVO}</ButtonLabel></button>}
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => actions.open({ kind: "duplicate-plan" })}><ButtonLabel icon="copy">Duplicar plan</ButtonLabel></button>
          {editable && <button type="button" className="ui-btn ui-btn-secondary" onClick={() => actions.open({ kind: "edit-plan" })}><ButtonLabel icon="edit">Editar código</ButtonLabel></button>}
          <button type="button" className="ui-btn ui-btn-danger-outline" onClick={actions.deletePlan}><ButtonLabel icon="trash">Eliminar plan</ButtonLabel></button>
        </div>
      </div>

      {!editable && (
        <p className="ui-alert ui-alert-warning" style={{ marginTop: 20, marginBottom: 0 }}>
          La estructura de un plan solo se modifica mientras está en borrador. Para hacer cambios, duplica el plan y publica una nueva versión.
        </p>
      )}

      <PlanDiagnosticsPanel plan={plan} />

      <PlanTabs tab={tab} onTab={onTab} counts={counts} />

      <div role="tabpanel" id={`plan-panel-${tab}`} aria-labelledby={`plan-tab-${tab}`} className="ui-tabpanel" tabIndex={0}>
        {tab === "map" && <KanbanBoard plan={plan} editable={editable} actions={actions} />}
        {tab === "students" && <StudentsPanel plan={plan} assigned={assigned} actions={actions} />}
      </div>
    </>
  )
}

function PlanDiagnosticsPanel({ plan }: { plan: StudyPlan }) {
  const errors = errorsOf(plan)
  const warnings = warningsOf(plan)
  if (plan.diagnosticos.length === 0) {
    return <p className="ui-alert ui-alert-success" style={{ marginTop: 20 }}>Sin observaciones: la estructura del plan cumple las validaciones.</p>
  }
  return (
    <section className="plan-diagnostics" aria-label="Validaciones del plan">
      <div className="plan-diagnostics-head">
        <h2>Validaciones del plan</h2>
        <p>Los errores impiden publicar o reactivar el plan. Las advertencias no bloquean la publicación, pero conviene revisarlas.</p>
      </div>
      {errors.length > 0 && <DiagnosticGroup title={`${plural(errors.length, "error", "errores")} que impiden publicar`} tone="error" items={errors} />}
      {warnings.length > 0 && <DiagnosticGroup title={`${plural(warnings.length, "advertencia", "advertencias")} por revisar`} tone="warning" items={warnings} />}
    </section>
  )
}

function DiagnosticGroup({ title, tone, items }: { title: string; tone: "error" | "warning"; items: PlanDiagnostic[] }) {
  return (
    <div className={`plan-diag plan-diag--${tone}`}>
      <h3>{title}</h3>
      <ul>{items.map((item, index) => <li key={`${item.codigo}-${item.materia_plan_id ?? item.unidad_id ?? index}`}>{item.mensaje}</li>)}</ul>
    </div>
  )
}

function PlanTabs({ tab, onTab, counts }: { tab: TabId; onTab: (tab: TabId) => void; counts: Record<TabId, number> }) {
  // Patrón WAI-ARIA de pestañas: flechas, Inicio y Fin; solo la pestaña activa está en el orden de tabulación.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((item) => item.id === tab)
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = TABS.length - 1
    else return
    event.preventDefault()
    onTab(TABS[next].id)
    document.getElementById(`plan-tab-${TABS[next].id}`)?.focus()
  }

  return (
    <div className="ui-tabs" role="tablist" aria-label="Secciones del plan" onKeyDown={onKeyDown}>
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`plan-tab-${item.id}`}
          className="ui-tab"
          aria-selected={tab === item.id}
          aria-controls={`plan-panel-${item.id}`}
          tabIndex={tab === item.id ? 0 : -1}
          onClick={() => onTab(item.id)}
        >
          {item.label} <span className="ui-count">{counts[item.id]}</span>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Malla curricular tipo Kanban                                        */
/* ------------------------------------------------------------------ */

function KanbanBoard({ plan, editable, actions }: { plan: StudyPlan; editable: boolean; actions: PlanActions }) {
  const units = sortedUnits(plan)
  const everySubject = allSubjectsOf(plan)
  const issueIds = issueSubjectIds(plan)
  const [focusId, setFocusId] = useState("")
  const [dragging, setDragging] = useState<{ subjectId: string; fromUnitId: string } | null>(null)
  const [overId, setOverId] = useState("")

  const focusSubject = everySubject.find((subject) => subject.id === focusId)
  const requirements = new Set(focusSubject?.prerrequisitos ?? [])
  const dependents = new Set(focusId ? everySubject.filter((subject) => subject.prerrequisitos.includes(focusId)).map((subject) => subject.id) : [])
  const codeById = new Map(everySubject.map((subject) => [subject.id, subject.codigo]))
  const semesterById = new Map<string, number>()
  for (const unit of units) for (const subject of unit.materias) semesterById.set(subject.id, unit.numero)
  const contiguous = numbersAreContiguous(plan)

  return (
    <>
      <div className="plan-toolbar">
        <div>
          <h2>Malla curricular</h2>
          <p className="plan-toolbar-sub">Organiza la secuencia de materias por semestre y revisa los prerrequisitos.</p>
        </div>
        {editable && (
          <div className="plan-toolbar-actions">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => actions.open({ kind: "generate-units" })}><ButtonLabel icon="layers">Generar semestres</ButtonLabel></button>
            {!contiguous && units.length > 0 && <button type="button" className="ui-btn ui-btn-secondary" onClick={actions.renumber}><ButtonLabel icon="columns">Renumerar</ButtonLabel></button>}
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => actions.open({ kind: "add-unit" })}><ButtonLabel icon="plus">Agregar semestre</ButtonLabel></button>
          </div>
        )}
      </div>
      <p className="plan-lead">
        {editable
          ? "Cada columna es un semestre y cada tarjeta una materia. Arrastra una tarjeta a otro semestre para moverla, o ábrela para gestionar sus prerrequisitos."
          : "Cada columna es un semestre y cada tarjeta una materia. Abre una tarjeta para ver sus prerrequisitos."}
      </p>
      <ul className="kb-legend" aria-label="Cómo leer la malla">
        <li>Pasa el cursor o enfoca una materia para resaltar sus relaciones:</li>
        <li><span className="kb-tag kb-tag--req">Requisito</span> materias que debe aprobar antes</li>
        <li><span className="kb-tag kb-tag--dep">Requiere</span> materias que dependen de ella</li>
      </ul>

      {units.length === 0 ? (
        <div>
          <EmptyState icon="layers" title="Este plan aún no tiene semestres">
            {editable ? "Empieza generando la secuencia de semestres o agrega uno por uno; luego suma materias a cada columna." : "Este plan no tiene semestres registrados."}
          </EmptyState>
          {editable && (
            <div className="plan-empty-actions">
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => actions.open({ kind: "generate-units" })}><ButtonLabel icon="layers">Generar semestres</ButtonLabel></button>
              <button type="button" className="ui-btn ui-btn-secondary" onClick={() => actions.open({ kind: "add-unit" })}><ButtonLabel icon="plus">Agregar uno</ButtonLabel></button>
            </div>
          )}
        </div>
      ) : (
        <div className="kb-scroll" role="region" aria-label="Malla curricular por semestres. Desplázate horizontalmente para ver todos." tabIndex={0}>
          <ol className="kb-board">
            {units.map((unit, index) => (
              <li
                key={unit.id}
                className="kb-col"
                data-tone={index % 6}
                data-over={overId === unit.id ? "" : undefined}
                onDragOver={(event) => {
                  if (dragging && dragging.fromUnitId !== unit.id) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                    if (overId !== unit.id) setOverId(unit.id)
                  }
                }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverId("") }}
                onDrop={(event) => {
                  event.preventDefault()
                  const dropped = dragging
                  setDragging(null)
                  setOverId("")
                  if (dropped && dropped.fromUnitId !== unit.id) actions.moveSubject(dropped.subjectId, unit)
                }}
              >
                <div className="kb-col-head">
                  <div>
                    <h3 className="kb-col-title">Semestre {unit.numero}</h3>
                    <p className="kb-col-name">{unit.nombre}</p>
                  </div>
                  <span className="ui-count" aria-label={plural(unit.materias.length, "materia", "materias")}>{unit.materias.length}</span>
                </div>

                {editable && (
                  <div className="kb-col-tools">
                    <button type="button" className="ui-btn ui-btn-quiet" aria-label={`Editar nombre del semestre ${unit.numero}`} onClick={() => actions.open({ kind: "edit-unit", unit })}><ButtonLabel icon="edit">Editar nombre</ButtonLabel></button>
                    {unit.materias.length === 0 && <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger" aria-label={`Eliminar semestre ${unit.numero}`} onClick={() => actions.deleteUnit(unit)}><ButtonLabel icon="trash">Eliminar</ButtonLabel></button>}
                  </div>
                )}

                {unit.materias.length === 0 ? (
                  <p className="kb-empty">{editable ? "Sin materias. Arrastra una aquí o agrégala abajo." : "Sin materias asignadas."}</p>
                ) : (
                  <ul className="kb-cards">
                    {unit.materias.map((subject) => {
                      const relation = requirements.has(subject.id) ? "req" : dependents.has(subject.id) ? "dep" : ""
                      const classes = [
                        "kb-card",
                        relation && `kb-card--${relation}`,
                        focusId === subject.id && "kb-card--focus",
                        issueIds.has(subject.id) && "kb-card--issue",
                        !subject.activo && "kb-card--inactive",
                      ].filter(Boolean).join(" ")
                      const open = () => actions.open({ kind: "manage-subject", subjectId: subject.id })
                      const requirementLabel = subject.prerrequisitos.length
                        ? `Requiere: ${subject.prerrequisitos.map((id) => `${codeById.get(id) ?? "otra materia"} (S${semesterById.get(id) ?? "?"})`).join(", ")}`
                        : "Sin prerrequisitos"
                      return (
                        <li key={subject.id}>
                          <div
                            className={classes}
                            role="button"
                            tabIndex={0}
                            draggable={editable}
                            data-dragging={dragging?.subjectId === subject.id ? "" : undefined}
                            aria-label={`${editable ? "Gestionar" : "Ver detalle de"} ${subject.codigo} ${subject.nombre}${subject.activo ? "" : ", materia inactiva"}`}
                            onClick={open}
                            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open() } }}
                            onMouseEnter={() => setFocusId(subject.id)}
                            onMouseLeave={() => setFocusId("")}
                            onFocus={() => setFocusId(subject.id)}
                            onBlur={() => setFocusId("")}
                            onDragStart={(event) => {
                              if (!editable) return
                              event.dataTransfer.setData("text/plain", subject.id)
                              event.dataTransfer.effectAllowed = "move"
                              setDragging({ subjectId: subject.id, fromUnitId: unit.id })
                            }}
                            onDragEnd={() => { setDragging(null); setOverId("") }}
                          >
                            <span className="kb-card-top">
                              <span className="kb-code">{subject.codigo}</span>
                              {editable && <span className="kb-grip"><Icon name="grip" size={16} /></span>}
                            </span>
                            <span className="kb-name">{subject.nombre}</span>
                            <span className="kb-flags">
                              {!subject.activo && <span className="kb-flag kb-flag--error">Materia inactiva</span>}
                              {issueIds.has(subject.id) && <span className="kb-flag kb-flag--warning">Revisar validación</span>}
                            </span>
                            <span className="kb-req">{requirementLabel}</span>
                            {relation === "req" && focusSubject && <span className="kb-tag kb-tag--req">Requisito de {focusSubject.codigo}</span>}
                            {relation === "dep" && focusSubject && <span className="kb-tag kb-tag--dep">Requiere {focusSubject.codigo}</span>}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {editable && <button type="button" className="kb-add" aria-label={`Agregar materias al semestre ${unit.numero}`} onClick={() => actions.open({ kind: "add-subject", unit })}><ButtonLabel icon="plus">Agregar materias</ButtonLabel></button>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

function StudentsPanel({ plan, assigned, actions }: { plan: StudyPlan; assigned: StudentPlan[]; actions: PlanActions }) {
  const assignable = plan.estado !== "INACTIVO" && plan.carrera_activa && plan.facultad_activa
  const blockedReason = plan.estado === "INACTIVO"
    ? "El plan está inactivo: no admite nuevas asignaciones."
    : !plan.carrera_activa
      ? "La carrera está inactiva: no admite nuevas asignaciones."
      : !plan.facultad_activa
        ? "La facultad está inactiva: no admite nuevas asignaciones."
        : null

  return (
    <>
      <div className="plan-toolbar">
        <div>
          <h2>Estudiantes con este plan</h2>
          <p className="plan-toolbar-sub">El plan de un estudiante puede corregirse mientras no tenga inscripciones ni notas.</p>
        </div>
        <button type="button" className="ui-btn ui-btn-primary" disabled={!assignable} title={blockedReason ?? undefined} onClick={() => actions.open({ kind: "assign-student" })}><ButtonLabel icon="plus">Asignar estudiante</ButtonLabel></button>
      </div>
      {blockedReason && <p className="ui-alert ui-alert-warning">{blockedReason}</p>}
      {plan.estado === "BORRADOR" && <p className="ui-alert ui-alert-info">El plan está en borrador: puedes asignar estudiantes, pero la inscripción se habilitará cuando lo publiques.</p>}

      {assigned.length === 0 ? (
        <EmptyState icon="users" title="Ningún estudiante tiene asignado este plan">Usa «Asignar estudiante» para agregar al primero.</EmptyState>
      ) : (
        <div className="ui-card" style={{ overflow: "hidden" }}>
          <div className="ui-table-wrap">
            <table className="ui-table">
              <caption className="ui-visually-hidden">Estudiantes asignados al plan {plan.codigo}</caption>
              <thead><tr><th scope="col">Estudiante</th><th scope="col">CI</th><th scope="col">Grupo de ingreso</th></tr></thead>
              <tbody>{assigned.map((student) => <tr key={student.usuario_id}><td className="ui-cell-strong">{fullName(student)}</td><td>{student.ci}</td><td>{student.apertura_periodo_denominacion ?? "Sin asignar"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Diálogos (cada uno guarda su propio borrador y se limpia al cerrar) */
/* ------------------------------------------------------------------ */

interface DialogBase { busy: boolean; error: string; onClose: () => void }

function CreatePlanDialog({ careers, busy, error, onClose, onSubmit }: DialogBase & { careers: Career[]; onSubmit: (data: { carrera_id: string; codigo: string; modalidad: PlanModality }) => void }) {
  const [careerId, setCareerId] = useState(careers[0]?.id ?? "")
  const [code, setCode] = useState("")
  const [modality, setModality] = useState<PlanModality>("SEMESTRAL")
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  if (careers.length === 0) {
    return (
      <Modal title="Nuevo plan de estudio" onClose={onClose}>
        <p className="ui-alert ui-alert-warning ui-alert-flush">No hay carreras activas con facultad activa. Primero registra o reactiva una carrera.</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button>
          <a className="ui-btn ui-btn-primary" href="/admin/carreras">Ir a Carreras</a>
        </div>
      </Modal>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      carrera_id: careerId ? null : "Selecciona una carrera activa.",
      codigo: messageOf(codeSchema, code),
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    onSubmit({ carrera_id: careerId, codigo: code.trim().toUpperCase(), modalidad: modality })
  }

  return (
    <Modal title="Nuevo plan de estudio" description="Se crea como borrador: podrás armar su malla antes de publicarlo. Todos los campos son obligatorios." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <Field id="plan-career" label="Carrera" hint="Solo se listan carreras activas cuya facultad también está activa." error={errors.carrera_id}>
          <select id="plan-career" className="ui-select" value={careerId} onChange={(event) => { setCareerId(event.target.value); setErrors((current) => ({ ...current, carrera_id: null })) }} required aria-invalid={Boolean(errors.carrera_id)} aria-describedby={errors.carrera_id ? "plan-career-error" : undefined} data-autofocus="">
            {careers.map((career) => <option key={career.id} value={career.id}>{career.codigo} — {career.nombre} · {career.facultad_codigo}</option>)}
          </select>
        </Field>
        <Field id="plan-code" label="Código del plan" hint="Ejemplo: SIS-2026. Se guarda en mayúsculas y es único en todo el sistema." error={errors.codigo}>
          <input id="plan-code" className="ui-input" value={code} onChange={(event) => { setCode(event.target.value); setErrors((current) => ({ ...current, codigo: null })) }} maxLength={32} required autoComplete="off" aria-invalid={Boolean(errors.codigo)} aria-describedby={errors.codigo ? "plan-code-error plan-code-hint" : "plan-code-hint"} />
        </Field>
        <fieldset className="ui-fieldset">
          <legend>Modalidad</legend>
          {(["SEMESTRAL", "MODULAR"] as PlanModality[]).map((value) => (
            <label className="ui-choice" key={value}>
              <input type="radio" name="plan-modality" value={value} checked={modality === value} onChange={() => setModality(value)} />
              <strong>{MODALITY_LABEL[value]}</strong>
              <span>{MODALITY_HELP[value]}</span>
            </label>
          ))}
        </fieldset>
        <FormActions busy={busy} onClose={onClose} submitLabel="Crear borrador" icon="check" />
      </form>
    </Modal>
  )
}

function EditPlanDialog({ plan, busy, error, onClose, onSubmit }: DialogBase & { plan: StudyPlan; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState(plan.codigo)
  const [codeError, setCodeError] = useState<string | null>(null)
  return (
    <Modal title="Editar código del plan" description="El código solo se puede cambiar mientras el plan está en borrador." onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); const invalid = messageOf(codeSchema, code); setCodeError(invalid); if (invalid) return; onSubmit(code.trim().toUpperCase()) }}>
        <DialogError error={error} />
        <Field id="plan-edit-code" label="Código del plan" error={codeError}>
          <input id="plan-edit-code" className="ui-input" value={code} onChange={(event) => { setCode(event.target.value); setCodeError(null) }} maxLength={32} required autoComplete="off" aria-invalid={Boolean(codeError)} aria-describedby={codeError ? "plan-edit-code-error" : undefined} data-autofocus="" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Guardar cambios" icon="check" />
      </form>
    </Modal>
  )
}

function DuplicatePlanDialog({ plan, busy, error, onClose, onSubmit }: DialogBase & { plan: StudyPlan; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState(copyCode(plan.codigo))
  const [codeError, setCodeError] = useState<string | null>(null)
  return (
    <Modal title={`Duplicar el plan ${plan.codigo}`} description="Se copiarán los semestres, las materias y los prerrequisitos. El nuevo plan quedará en borrador para que puedas ajustarlo antes de publicarlo." onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); const invalid = messageOf(codeSchema, code); setCodeError(invalid); if (invalid) return; onSubmit(code.trim().toUpperCase()) }}>
        <DialogError error={error} />
        <p className="ui-alert ui-alert-info ui-alert-flush">El plan original no se modifica. Usa esta opción para crear una nueva versión de un plan ya publicado.</p>
        <Field id="plan-copy-code" label="Código del nuevo plan" hint="Debe ser único en todo el sistema." error={codeError}>
          <input id="plan-copy-code" className="ui-input" value={code} onChange={(event) => { setCode(event.target.value); setCodeError(null) }} maxLength={32} required autoComplete="off" aria-invalid={Boolean(codeError)} aria-describedby={codeError ? "plan-copy-code-error plan-copy-code-hint" : "plan-copy-code-hint"} data-autofocus="" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Duplicar plan" icon="copy" />
      </form>
    </Modal>
  )
}

function PlanStateDialog({ plan, busy, error, onClose, onSubmit }: DialogBase & { plan: StudyPlan; onSubmit: (state: PlanState) => void }) {
  const options = NEXT_STATES[plan.estado]
  // El botón que abre este diálogo ya dice qué se quiere hacer ("Publicar", "Desactivar", "Reactivar"): se preselecciona.
  const [state, setState] = useState<PlanState>(options[0])
  const errors = errorsOf(plan)
  const warnings = warningsOf(plan)
  const blocked = state === "VIGENTE" && errors.length > 0
  const help: Record<PlanState, string> = {
    BORRADOR: "",
    VIGENTE: plan.estado === "BORRADOR"
      ? "Publica el plan para inscribir estudiantes. Después ya no podrás modificar su estructura ni volver a borrador."
      : "Vuelve a habilitar el plan para inscribir estudiantes. Se validará que su estructura siga siendo publicable.",
    INACTIVO: "Deja de usarse para nuevas inscripciones. La estructura se conserva y sigue sin poder modificarse.",
  }
  return (
    <Modal title={STATE_ACTION[plan.estado]} description={`El plan ${plan.codigo} está ahora en estado «${STATE_LABEL[plan.estado]}».`} onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); if (blocked) return; onSubmit(state) }}>
        <DialogError error={error} />
        <fieldset className="ui-fieldset">
          <legend>Nuevo estado</legend>
          {options.map((value, index) => (
            <label className="ui-choice" key={value}>
              <input type="radio" name="plan-state" value={value} checked={state === value} onChange={() => setState(value)} required data-autofocus={index === 0 ? "" : undefined} />
              <strong>{STATE_LABEL[value]}</strong>
              <span>{help[value]}</span>
            </label>
          ))}
        </fieldset>
        {state === "VIGENTE" && errors.length > 0 && (
          <div className="plan-diag plan-diag--error" role="alert">
            <h3>No se puede publicar todavía</h3>
            <ul>{errors.map((item, index) => <li key={`${item.codigo}-${index}`}>{item.mensaje}</li>)}</ul>
          </div>
        )}
        {state === "VIGENTE" && errors.length === 0 && warnings.length > 0 && (
          <div className="plan-diag plan-diag--warning">
            <h3>Advertencias que no bloquean la publicación</h3>
            <ul>{warnings.map((item, index) => <li key={`${item.codigo}-${index}`}>{item.mensaje}</li>)}</ul>
          </div>
        )}
        {blocked ? (
          <div className="ui-modal-actions">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={busy} data-autofocus="">Cerrar</button>
            <button type="button" className="ui-btn ui-btn-primary" disabled>Corrige los errores para continuar</button>
          </div>
        ) : (
          <FormActions busy={busy} onClose={onClose} submitLabel="Confirmar cambio" icon="check" />
        )}
      </form>
    </Modal>
  )
}

function UnitDialog({ mode, initialNumber, initialName, existingNumbers, busy, error, onClose, onSubmit }: DialogBase & { mode: "add" | "edit"; initialNumber: number; initialName: string; existingNumbers: number[]; onSubmit: (data: { numero: number; nombre: string }) => void }) {
  const [number, setNumber] = useState(String(initialNumber))
  const [name, setName] = useState(initialName)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const maxNumber = existingNumbers.reduce((max, value) => Math.max(max, value), 0)
  const parsed = Number(number)
  const duplicate = mode === "add" && existingNumbers.includes(parsed)
  const createsGap = mode === "add" && Number.isInteger(parsed) && parsed > maxNumber + 1

  return (
    <Modal title={mode === "add" ? "Agregar semestre" : `Editar semestre ${initialNumber}`} description={mode === "add" ? "Los semestres deben numerarse 1, 2, 3… sin huecos para poder publicar el plan." : "Solo se puede cambiar el nombre; el número identifica al semestre."} onClose={onClose} locked={busy}>
      <form onSubmit={(event) => {
        event.preventDefault()
        const nextErrors = {
          numero: mode === "add" ? (duplicate ? "Ya existe un semestre con ese número." : messageOf(positiveIntSchema, Number(number))) : null,
          nombre: messageOf(labelSchema, name),
        }
        setErrors(nextErrors)
        if (Object.values(nextErrors).some(Boolean)) return
        onSubmit({ numero: Number(number), nombre: name.trim() })
      }}>
        <DialogError error={error} />
        {mode === "add" && (
          <Field id="unit-number" label="Número de semestre" hint={createsGap ? "Quedará un hueco en la numeración. Podrás corregirlo con «Renumerar»." : "Ya se sugiere el siguiente número disponible."} error={errors.numero}>
            <input id="unit-number" className="ui-input" type="number" inputMode="numeric" min={1} value={number} onChange={(event) => { setNumber(event.target.value); setErrors((current) => ({ ...current, numero: null })) }} required aria-invalid={Boolean(errors.numero)} aria-describedby={errors.numero ? "unit-number-error unit-number-hint" : "unit-number-hint"} />
          </Field>
        )}
        <Field id="unit-name" label="Nombre" hint="Ejemplo: Primer semestre." error={errors.nombre}>
          <input id="unit-name" className="ui-input" value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, nombre: null })) }} maxLength={120} required autoComplete="off" aria-invalid={Boolean(errors.nombre)} aria-describedby={errors.nombre ? "unit-name-error unit-name-hint" : "unit-name-hint"} data-autofocus="" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel={mode === "add" ? "Agregar semestre" : "Guardar cambios"} icon="check" />
      </form>
    </Modal>
  )
}

function GenerateUnitsDialog({ plan, busy, error, onClose, onSubmit }: DialogBase & { plan: StudyPlan; onSubmit: (data: { cantidad: number; nombre_base?: string }) => void }) {
  const start = nextUnitNumber(plan)
  const [count, setCount] = useState("2")
  const [base, setBase] = useState("Semestre")
  const [countError, setCountError] = useState<string | null>(null)
  const parsed = Number(count)
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= 30
  const end = start + (valid ? parsed : 1) - 1

  return (
    <Modal title="Generar semestres" description="Crea varios semestres consecutivos al final del plan. Después podrás cambiar sus nombres." onClose={onClose} locked={busy}>
      <form onSubmit={(event) => {
        event.preventDefault()
        const invalid = messageOf(positiveIntSchema, Number(count)) ?? (Number(count) > 30 ? "Puedes generar hasta 30 semestres a la vez." : null)
        setCountError(invalid)
        if (invalid) return
        onSubmit({ cantidad: Number(count), nombre_base: base.trim() || undefined })
      }}>
        <DialogError error={error} />
        <Field id="generate-count" label="Cantidad de semestres" hint={valid ? `Se crearán los semestres ${start} a ${end}.` : "Entre 1 y 30."} error={countError}>
          <input id="generate-count" className="ui-input" type="number" inputMode="numeric" min={1} max={30} value={count} onChange={(event) => { setCount(event.target.value); setCountError(null) }} required aria-invalid={Boolean(countError)} aria-describedby={countError ? "generate-count-error generate-count-hint" : "generate-count-hint"} data-autofocus="" />
        </Field>
        <Field id="generate-base" label="Nombre base" hint="Se usará como «Nombre 1», «Nombre 2», etc. Si lo dejas vacío, se usará «Semestre».">
          <input id="generate-base" className="ui-input" value={base} onChange={(event) => setBase(event.target.value)} maxLength={120} autoComplete="off" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Generar semestres" icon="layers" />
      </form>
    </Modal>
  )
}

function AddSubjectsDialog({ unit, available, busy, error, onClose, onSubmit }: DialogBase & { unit: PlanUnit; available: Subject[]; onSubmit: (subjectIds: string[]) => void }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [localError, setLocalError] = useState("")
  const title = `Agregar materias al semestre ${unit.numero}`
  const needle = query.trim().toLowerCase()
  const visible = available.filter((subject) => !needle || `${subject.codigo} ${subject.nombre}`.toLowerCase().includes(needle))
  const allVisibleSelected = visible.length > 0 && visible.every((subject) => selected.has(subject.id))
  const selectedCount = selected.size

  function toggle(subjectId: string) {
    setLocalError("")
    if (!selected.has(subjectId) && selected.size >= MAX_BULK_SUBJECTS) {
      setLocalError(`Puedes agregar hasta ${MAX_BULK_SUBJECTS} materias a la vez.`)
      return
    }
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(subjectId)) next.delete(subjectId)
      else next.add(subjectId)
      return next
    })
  }

  function toggleVisible() {
    setLocalError("")
    setSelected((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        for (const subject of visible) next.delete(subject.id)
      } else {
        for (const subject of visible) {
          if (next.size >= MAX_BULK_SUBJECTS) break
          next.add(subject.id)
        }
      }
      return next
    })
  }

  if (available.length === 0) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="ui-alert ui-alert-warning ui-alert-flush">No quedan materias activas del catálogo por agregar a este plan. Crea una materia nueva o reactiva una existente.</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button>
          <a className="ui-btn ui-btn-primary" href="/admin/materias">Ir a Materias</a>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} description={`Se agregarán a «${unit.nombre}». Puedes seleccionar varias materias y moverlas después arrastrando su tarjeta.`} onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); if (selected.size === 0) { setLocalError("Selecciona al menos una materia."); return } setLocalError(""); onSubmit([...selected]) }}>
        <DialogError error={error || localError} />
        <div className="subject-picker">
          <div className="ui-field">
            <label htmlFor="subject-search">Buscar materia</label>
            <input id="subject-search" type="search" className="ui-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código o nombre" autoComplete="off" data-autofocus="" />
          </div>
          <div className="subject-picker-actions">
            <p className="subject-picker-count" role="status">{selectedCount} seleccionada(s) · {visible.length} disponible(s)</p>
            <button type="button" className="ui-btn ui-btn-quiet" onClick={toggleVisible}>{allVisibleSelected ? "Quitar selección visible" : "Seleccionar visibles"}</button>
          </div>
          <ul className="subject-list" aria-label="Materias disponibles">
            {visible.length === 0 ? <li className="subject-empty">Ninguna materia coincide con la búsqueda.</li> : visible.map((subject) => (
              <li key={subject.id}>
                <label className="subject-option">
                  <input type="checkbox" checked={selected.has(subject.id)} onChange={() => toggle(subject.id)} />
                  <span>
                    <span className="subject-option-code">{subject.codigo}</span> {subject.nombre}
                    <span className="subject-option-meta">
                      {subject.planes_count === 0 ? "Aún no está en ningún plan" : `En ${plural(subject.planes_count, "plan", "planes")}`}
                      {subject.carreras_count > 1 ? ` · compartida con ${subject.carreras_count} carreras` : ""}
                    </span>
                  </span>
                  {subject.carreras_count > 1 && <span className="kb-flag kb-flag--muted">Compartida</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="ui-btn ui-btn-primary" disabled={busy || selectedCount === 0}>
            {busy ? "Agregando…" : <ButtonLabel icon="plus">{selectedCount === 0 ? "Agregar materias" : `Agregar ${plural(selectedCount, "materia", "materias")}`}</ButtonLabel>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface ManageSubjectProps extends DialogBase {
  plan: StudyPlan
  subject: PlanSubject
  unit: PlanUnit
  editable: boolean
  onAddPrerequisite: (requirementId: string) => Promise<boolean>
  onRemovePrerequisite: (requirementId: string) => Promise<boolean>
  onMove: (unitId: string) => Promise<void>
  onRetire: () => void
}

/** Un solo lugar para todo lo que se puede hacer con una materia de la malla. */
function ManageSubjectDialog({ plan, subject, unit, editable, busy, error, onClose, onAddPrerequisite, onRemovePrerequisite, onMove, onRetire }: ManageSubjectProps) {
  const [requirementId, setRequirementId] = useState("")
  const [targetId, setTargetId] = useState("")
  const targets = sortedUnits(plan).filter((candidate) => candidate.id !== unit.id)
  const subjectById = new Map(allSubjectsOf(plan).map((candidate) => [candidate.id, candidate]))
  const unitBySubjectId = new Map<string, PlanUnit>()
  for (const candidateUnit of plan.unidades) for (const candidate of candidateUnit.materias) unitBySubjectId.set(candidate.id, candidateUnit)
  const candidates = prerequisiteCandidates(plan, subject)
  const selectedCandidate = candidates.find((candidate) => candidate.id === requirementId)
  const dependents = allSubjectsOf(plan).filter((candidate) => candidate.prerrequisitos.includes(subject.id))

  return (
    <Modal title={`${subject.codigo} — ${subject.nombre}`} description={`Semestre ${unit.numero} · ${unit.nombre}${subject.activo ? "" : " · Materia inactiva en el catálogo"}`} onClose={onClose} locked={busy}>
      <DialogError error={error} />

      <section className="mg-section" aria-labelledby="mg-req-title">
        <h3 id="mg-req-title">Prerrequisitos</h3>
        {subject.prerrequisitos.length === 0 ? <p>Esta materia no tiene prerrequisitos.</p> : (
          <ul className="mg-chips" aria-label={`Prerrequisitos de ${subject.codigo}`}>
            {subject.prerrequisitos.map((id) => {
              const required = subjectById.get(id)
              const requiredUnit = unitBySubjectId.get(id)
              const label = required ? `${required.codigo} — ${required.nombre}${requiredUnit ? ` · Semestre ${requiredUnit.numero}` : ""}` : "Otra materia"
              return (
                <li key={id} className={editable ? "ui-chip" : "ui-chip ui-chip-static"}>
                  {label}
                  {editable && <button type="button" className="ui-chip-remove" disabled={busy} aria-label={`Quitar prerrequisito ${required?.codigo ?? ""} de ${subject.codigo}`} onClick={() => void onRemovePrerequisite(id)}><span aria-hidden="true">×</span></button>}
                </li>
              )
            })}
          </ul>
        )}
        {editable && candidates.length > 0 && (
          <form className="mg-inline" onSubmit={(event) => { event.preventDefault(); if (!requirementId) return; void onAddPrerequisite(requirementId).then((ok) => { if (ok) setRequirementId("") }) }}>
            <Field id="mg-req-pick" label="Agregar prerrequisito (debe aprobarla antes, con 51 o más)" hint={selectedCandidate?.later ? "Esta materia está en un semestre posterior: quedará como advertencia, no bloquea la publicación." : undefined}>
              <select id="mg-req-pick" className="ui-select" value={requirementId} onChange={(event) => setRequirementId(event.target.value)} required data-autofocus="">
                <option value="">Selecciona una materia</option>
                {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}{candidate.later ? " · semestre posterior" : ""}</option>)}
              </select>
            </Field>
            <button type="submit" className="ui-btn ui-btn-primary" disabled={busy || !requirementId}><ButtonLabel icon="plus">Agregar</ButtonLabel></button>
          </form>
        )}
        {editable && candidates.length === 0 && <p>No hay materias disponibles que puedan ser prerrequisito sin crear un ciclo.</p>}
      </section>

      <section className="mg-section" aria-labelledby="mg-dep-title">
        <h3 id="mg-dep-title">Es prerrequisito de</h3>
        {dependents.length === 0 ? <p>Ninguna materia del plan la requiere.</p> : (
          <ul className="mg-chips">{dependents.map((dependent) => {
            const dependentUnit = unitBySubjectId.get(dependent.id)
            return <li key={dependent.id} className="ui-chip ui-chip-static">{dependent.codigo} — {dependent.nombre}{dependentUnit ? ` · Semestre ${dependentUnit.numero}` : ""}</li>
          })}</ul>
        )}
      </section>

      {editable && targets.length > 0 && (
        <section className="mg-section" aria-labelledby="mg-move-title">
          <h3 id="mg-move-title">Mover a otro semestre</h3>
          <form className="mg-inline" onSubmit={(event) => { event.preventDefault(); void onMove(targetId) }}>
            <Field id="mg-move-pick" label="Semestre de destino">
              <select id="mg-move-pick" className="ui-select" value={targetId} onChange={(event) => setTargetId(event.target.value)} required>
                <option value="">Selecciona un semestre</option>
                {targets.map((target) => <option key={target.id} value={target.id}>Semestre {target.numero}: {target.nombre}</option>)}
              </select>
            </Field>
            <button type="submit" className="ui-btn ui-btn-secondary" disabled={busy || !targetId}>Mover</button>
          </form>
        </section>
      )}

      {editable && (
        <section className="mg-section mg-section--danger" aria-labelledby="mg-retire-title">
          <h3 id="mg-retire-title">Retirar del plan</h3>
          <p>La materia dejará de formar parte del plan junto con sus prerrequisitos.</p>
          <div><button type="button" className="ui-btn ui-btn-danger-outline" disabled={busy} onClick={onRetire}><ButtonLabel icon="trash">Retirar materia</ButtonLabel></button></div>
        </section>
      )}

      <div className="ui-modal-actions">
        <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={busy} data-autofocus={editable && candidates.length > 0 ? undefined : ""}>Cerrar</button>
      </div>
    </Modal>
  )
}

function AssignStudentDialog({ plan, students, busy, error, onClose, onSubmit }: DialogBase & { plan: StudyPlan; students: StudentPlan[]; onSubmit: (student: StudentPlan, openingId?: string) => void }) {
  const [studentId, setStudentId] = useState("")
  const [openingId, setOpeningId] = useState("")
  const [openings, setOpenings] = useState<PlanOpening[]>([])
  const [localError, setLocalError] = useState("")
  const [loadingOpenings, setLoadingOpenings] = useState(true)
  const [openingsError, setOpeningsError] = useState("")
  useEffect(() => {
    let cancelled = false
    setLoadingOpenings(true)
    setOpeningsError("")
    void api.listPlanOpenings(plan.id).then((rows) => {
      if (!cancelled) setOpenings(rows)
    }).catch((reason: Error) => {
      if (!cancelled) setOpeningsError(reason.message)
    }).finally(() => {
      if (!cancelled) setLoadingOpenings(false)
    })
    return () => { cancelled = true }
  }, [plan.id])
  const candidates = students
    .filter((student) => student.plan_estudio_id !== plan.id)
    .sort((a, b) => Number(Boolean(a.plan_estudio_id)) - Number(Boolean(b.plan_estudio_id)) || a.apellidos.localeCompare(b.apellidos, "es"))
  const title = `Asignar estudiante al plan ${plan.codigo}`
  const blockedReason = plan.estado === "INACTIVO"
    ? "El plan está inactivo: no admite nuevas asignaciones."
    : !plan.carrera_activa
      ? "La carrera está inactiva: no admite nuevas asignaciones."
      : !plan.facultad_activa
        ? "La facultad está inactiva: no admite nuevas asignaciones."
        : null

  if (blockedReason) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="ui-alert ui-alert-warning ui-alert-flush">{blockedReason}</p>
        <div className="ui-modal-actions"><button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button></div>
      </Modal>
    )
  }

  if (candidates.length === 0) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="ui-alert ui-alert-info ui-alert-flush">Todos los estudiantes registrados ya tienen este plan.</p>
        <div className="ui-modal-actions"><button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button></div>
      </Modal>
    )
  }
  return (
    <Modal title={title} description="Los estudiantes sin plan aparecen primero. Si el estudiante ya tiene otro plan, se reemplazará mientras no tenga inscripciones ni notas." onClose={onClose} locked={busy}>
      <form onSubmit={(event) => {
        event.preventDefault()
        const student = candidates.find((candidate) => candidate.usuario_id === studentId)
        if (!student) { setLocalError("Selecciona un estudiante."); return }
        if (openings.length > 0 && !openingId) { setLocalError("Selecciona el grupo de ingreso del estudiante."); return }
        setLocalError("")
        onSubmit(student, openingId || undefined)
      }}>
        <DialogError error={error || openingsError || localError} />
        {plan.estado === "BORRADOR" && <p className="ui-alert ui-alert-info ui-alert-flush">El plan está en borrador. Podrás asignarlo, pero la inscripción se habilitará al publicarlo.</p>}
        <Field id="student-pick" label="Estudiante">
          <select id="student-pick" className="ui-select" value={studentId} onChange={(event) => { setStudentId(event.target.value); setLocalError("") }} required aria-invalid={Boolean(localError)} data-autofocus="">
            <option value="">Selecciona un estudiante</option>
            {candidates.map((student) => <option key={student.usuario_id} value={student.usuario_id}>{fullName(student)} — CI {student.ci} · {student.plan_codigo ? `Plan actual: ${student.plan_codigo}` : "Sin plan"}</option>)}
          </select>
        </Field>
        {loadingOpenings ? <p className="ui-field-hint">Cargando grupos de ingreso…</p> : openings.length > 0 ? <Field id="student-opening" label="Grupo de ingreso" hint="Ubica al estudiante en la proyección de semestres de este plan.">
          <select id="student-opening" className="ui-select" value={openingId} onChange={(event) => { setOpeningId(event.target.value); setLocalError("") }} required>
            <option value="">Selecciona un grupo</option>
            {openings.map((opening) => <option key={opening.id} value={opening.id}>Ingreso {opening.periodo_denominacion}</option>)}
          </select>
        </Field> : <p className="ui-field-hint">Este plan aún no tiene grupos de ingreso. Podrás asignar el grupo desde «Planificar semestre» cuando lo inicies.</p>}
        <FormActions busy={busy || loadingOpenings || Boolean(openingsError)} onClose={onClose} submitLabel="Asignar plan" icon="check" />
      </form>
    </Modal>
  )
}
