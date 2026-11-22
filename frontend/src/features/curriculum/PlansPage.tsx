import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, RefObject } from "react"

import { api } from "../../api/client"
import type { Career, PlanModality, PlanState, PlanSubject, PlanUnit, StudentPlan, StudyPlan, Subject } from "../../api/client"
import { Icon } from "../shared/icons"
import { Modal } from "../shared/Modal"
import { ButtonLabel, ConfirmDialog, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
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
// Transiciones de estado permitidas (idénticas a las de la pantalla original).
const NEXT_STATES: Record<PlanState, PlanState[]> = { BORRADOR: ["VIGENTE", "INACTIVO"], VIGENTE: ["INACTIVO"], INACTIVO: ["VIGENTE"] }
const STATE_ACTION: Record<PlanState, string> = { BORRADOR: "Publicar plan", VIGENTE: "Desactivar plan", INACTIVO: "Reactivar plan" }

type TabId = "map" | "students"
const TABS: { id: TabId; label: string }[] = [
  { id: "map", label: "Malla curricular" },
  { id: "students", label: "Estudiantes" },
]

type Dialog =
  | { kind: "create-plan" }
  | { kind: "edit-plan" }
  | { kind: "plan-state" }
  | { kind: "add-unit" }
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
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const fullName = (student: StudentPlan) => `${student.apellidos}, ${student.nombres}`
const sortedUnits = (plan: StudyPlan) => [...plan.unidades].sort((a, b) => a.numero - b.numero)
const allSubjectsOf = (plan: StudyPlan) => plan.unidades.flatMap((unit) => unit.materias)

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
    semesters: plan.unidades.length,
    subjects: subjects.length,
    prerequisites: subjects.reduce((total, subject) => total + subject.prerrequisitos.length, 0),
  }
}

function prerequisiteCandidates(plan: StudyPlan, subject: PlanSubject) {
  return sortedUnits(plan).flatMap((unit) =>
    unit.materias
      .filter((candidate) => candidate.id !== subject.id && !subject.prerrequisitos.includes(candidate.id))
      .map((candidate) => ({ id: candidate.id, label: `${candidate.codigo} — ${candidate.nombre} (Semestre ${unit.numero})` })),
  )
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
  const headingRef = useRef<HTMLHeadingElement>(null)

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedId) ?? null, [plans, selectedId])

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
  }

  function renderDialog() {
    if (!dialog) return null
    const common = { busy, error: dialogError, onClose: closeDialog }
    if (dialog.kind === "create-plan") return <CreatePlanDialog {...common} careers={careers} onSubmit={(data) => void createPlan(data)} />
    if (dialog.kind === "confirm") return <ConfirmDialog {...common} title={dialog.title} message={dialog.message} confirmLabel={dialog.confirmLabel} onConfirm={dialog.onConfirm} />
    if (!selectedPlan) return null
    const plan = selectedPlan

    switch (dialog.kind) {
      case "edit-plan":
        return <EditPlanDialog {...common} plan={plan} onSubmit={(codigo) => void submitDialog(() => api.updatePlan(plan.id, { codigo }), "Código del plan actualizado.")} />
      case "plan-state":
        return <PlanStateDialog {...common} plan={plan} onSubmit={(estado) => void submitDialog(() => api.updatePlan(plan.id, { estado }), `El plan ahora está ${STATE_LABEL[estado].toLowerCase()}.`)} />
      case "add-unit": {
        const next = plan.unidades.reduce((max, unit) => Math.max(max, unit.numero), 0) + 1
        return <UnitDialog {...common} mode="add" initialNumber={next} initialName="" onSubmit={({ numero, nombre }) => void submitDialog(() => api.createPlanUnit(plan.id, { numero, nombre }), `Semestre ${numero} agregado.`)} />
      }
      case "edit-unit": {
        const unit = dialog.unit
        return <UnitDialog {...common} mode="edit" initialNumber={unit.numero} initialName={unit.nombre} onSubmit={({ nombre }) => void submitDialog(() => api.updatePlanUnit(plan.id, unit.id, { nombre }), `Semestre ${unit.numero} actualizado.`)} />
      }
      case "add-subject": {
        const unit = dialog.unit
        const used = new Set(allSubjectsOf(plan).map((subject) => subject.materia_id))
        const available = subjects.filter((subject) => !used.has(subject.id))
        return <AddSubjectDialog {...common} unit={unit} available={available} onSubmit={(materiaId) => void submitDialog(
          () => api.addPlanSubject(plan.id, { materia_id: materiaId, unidad_id: unit.id }),
          `${subjects.find((subject) => subject.id === materiaId)?.codigo ?? "Materia"} agregada al semestre ${unit.numero}.`,
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
        return <AssignStudentDialog {...common} plan={plan} students={students} onSubmit={(student) => void submitDialog(
          () => api.assignStudentPlan(student.usuario_id, plan.id),
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
          studentsWithoutPlan={students.filter((student) => !student.plan_estudio_id).length}
          filterText={filterText}
          filterState={filterState}
          headingRef={headingRef}
          onFilterText={setFilterText}
          onFilterState={setFilterState}
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
  studentsWithoutPlan: number
  filterText: string
  filterState: "" | PlanState
  headingRef: RefObject<HTMLHeadingElement | null>
  onFilterText: (value: string) => void
  onFilterState: (value: "" | PlanState) => void
  onCreate: () => void
  onOpen: (id: string) => void
}

function PlanList({ plans, studentsWithoutPlan, filterText, filterState, headingRef, onFilterText, onFilterState, onCreate, onOpen }: PlanListProps) {
  const query = filterText.trim().toLowerCase()
  const visible = plans.filter((plan) =>
    (!filterState || plan.estado === filterState) &&
    (!query || `${plan.codigo} ${plan.carrera_codigo} ${plan.carrera_nombre}`.toLowerCase().includes(query)))
  const filtering = Boolean(query || filterState)

  return (
    <>
      <PageHeader
        eyebrow="CURRÍCULO"
        title="Planes de estudio"
        description="Un plan define los semestres, las materias y los prerrequisitos de una carrera. Solo un plan vigente permite inscribir estudiantes."
        headingRef={headingRef}
        actions={<button type="button" className="ui-btn ui-btn-primary" onClick={onCreate}><ButtonLabel icon="plus">Nuevo plan</ButtonLabel></button>}
      />

      {plans.length > 0 && studentsWithoutPlan > 0 && (
        <p className="ui-alert ui-alert-info">
          {plural(studentsWithoutPlan, "estudiante aún no tiene plan asignado", "estudiantes aún no tienen plan asignado")}.
          Asígnalos desde la pestaña «Estudiantes» de cada plan.
        </p>
      )}

      {plans.length > 6 && (
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
        </div>
      )}
      {filtering && <p className="plan-count" role="status">Mostrando {visible.length} de {plans.length} planes.</p>}

      {plans.length === 0 ? (
        <EmptyState icon="layers" title="Aún no hay planes de estudio">
          Usa «Nuevo plan» para crear el primero. Se crea como borrador y puedes armarlo con calma antes de publicarlo.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="Ningún plan coincide con el filtro" />
      ) : (
        <ul className="plan-grid">
          {visible.map((plan) => {
            const stats = planStats(plan)
            return (
              <li key={plan.id}>
                <article className="plan-card" data-state={plan.estado}>
                  <div className="plan-card-top">
                    <StatusBadge tone={STATE_TONE[plan.estado]}>{STATE_LABEL[plan.estado]}</StatusBadge>
                    <span className="plan-card-mod">{MODALITY_LABEL[plan.modalidad]}</span>
                  </div>
                  <h3>{plan.codigo}</h3>
                  <p className="plan-card-career">{plan.carrera_nombre} · {plan.carrera_codigo}</p>
                  <dl className="plan-card-stats">
                    <div><dt>Semestres</dt><dd>{stats.semesters}</dd></div>
                    <div><dt>Materias</dt><dd>{stats.subjects}</dd></div>
                    <div><dt>Requisitos</dt><dd>{stats.prerequisites}</dd></div>
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
          {editable && <button type="button" className="ui-btn ui-btn-secondary" onClick={() => actions.open({ kind: "edit-plan" })}><ButtonLabel icon="edit">Editar código</ButtonLabel></button>}
          <button type="button" className="ui-btn ui-btn-danger-outline" onClick={actions.deletePlan}><ButtonLabel icon="trash">Eliminar plan</ButtonLabel></button>
        </div>
      </div>

      {!editable && (
        <p className="ui-alert ui-alert-warning" style={{ marginTop: 20, marginBottom: 0 }}>
          La estructura de un plan solo se modifica mientras está en borrador. Para hacer cambios, crea un plan nuevo.
        </p>
      )}

      <PlanTabs tab={tab} onTab={onTab} counts={counts} />

      <div role="tabpanel" id={`plan-panel-${tab}`} aria-labelledby={`plan-tab-${tab}`} className="ui-tabpanel" tabIndex={0}>
        {tab === "map" && <KanbanBoard plan={plan} editable={editable} actions={actions} />}
        {tab === "students" && <StudentsPanel plan={plan} assigned={assigned} actions={actions} />}
      </div>
    </>
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
  const [focusId, setFocusId] = useState("")
  const [dragging, setDragging] = useState<{ subjectId: string; fromUnitId: string } | null>(null)
  const [overId, setOverId] = useState("")

  const focusSubject = everySubject.find((subject) => subject.id === focusId)
  const requirements = new Set(focusSubject?.prerrequisitos ?? [])
  const dependents = new Set(focusId ? everySubject.filter((subject) => subject.prerrequisitos.includes(focusId)).map((subject) => subject.id) : [])
  const codeById = new Map(everySubject.map((subject) => [subject.id, subject.codigo]))

  return (
    <>
      <div className="plan-toolbar">
        <h2>Malla curricular</h2>
        {editable && <button type="button" className="ui-btn ui-btn-primary" onClick={() => actions.open({ kind: "add-unit" })}><ButtonLabel icon="plus">Agregar semestre</ButtonLabel></button>}
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
        <EmptyState icon="layers" title="Este plan aún no tiene semestres">
          {editable ? "Empieza con «Agregar semestre»; luego suma materias a cada columna." : "Este plan no tiene semestres registrados."}
        </EmptyState>
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
                      const classes = ["kb-card", relation && `kb-card--${relation}`, focusId === subject.id && "kb-card--focus"].filter(Boolean).join(" ")
                      const open = () => actions.open({ kind: "manage-subject", subjectId: subject.id })
                      return (
                        <li key={subject.id}>
                          <div
                            className={classes}
                            role="button"
                            tabIndex={0}
                            draggable={editable}
                            data-dragging={dragging?.subjectId === subject.id ? "" : undefined}
                            aria-label={`${editable ? "Gestionar" : "Ver detalle de"} ${subject.codigo} ${subject.nombre}`}
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
                            <span className="kb-req">
                              {subject.prerrequisitos.length ? `Requiere: ${subject.prerrequisitos.map((id) => codeById.get(id) ?? "otra materia").join(", ")}` : "Sin prerrequisitos"}
                            </span>
                            {relation === "req" && focusSubject && <span className="kb-tag kb-tag--req">Requisito de {focusSubject.codigo}</span>}
                            {relation === "dep" && focusSubject && <span className="kb-tag kb-tag--dep">Requiere {focusSubject.codigo}</span>}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {editable && <button type="button" className="kb-add" aria-label={`Agregar materia al semestre ${unit.numero}`} onClick={() => actions.open({ kind: "add-subject", unit })}><ButtonLabel icon="plus">Agregar materia</ButtonLabel></button>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

function StudentsPanel({ plan, assigned, actions }: { plan: StudyPlan; assigned: StudentPlan[]; actions: PlanActions }) {
  return (
    <>
      <div className="plan-toolbar">
        <h2>Estudiantes con este plan</h2>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => actions.open({ kind: "assign-student" })}><ButtonLabel icon="plus">Asignar estudiante</ButtonLabel></button>
      </div>
      <p className="plan-lead">El plan de un estudiante puede corregirse mientras no tenga inscripciones ni notas.</p>
      {plan.estado !== "VIGENTE" && <p className="ui-alert ui-alert-warning">Este plan no está vigente: los estudiantes asignados no podrán inscribirse con él hasta que lo esté.</p>}

      {assigned.length === 0 ? (
        <EmptyState icon="users" title="Ningún estudiante tiene asignado este plan">Usa «Asignar estudiante» para agregar al primero.</EmptyState>
      ) : (
        <div className="ui-card" style={{ overflow: "hidden" }}>
          <div className="ui-table-wrap">
            <table className="ui-table">
              <caption className="ui-visually-hidden">Estudiantes asignados al plan {plan.codigo}</caption>
              <thead><tr><th scope="col">Estudiante</th><th scope="col">CI</th></tr></thead>
              <tbody>{assigned.map((student) => <tr key={student.usuario_id}><td className="ui-cell-strong">{fullName(student)}</td><td>{student.ci}</td></tr>)}</tbody>
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

  if (careers.length === 0) {
    return (
      <Modal title="Nuevo plan de estudio" onClose={onClose}>
        <p className="ui-alert ui-alert-warning ui-alert-flush">Primero registra una carrera: cada plan pertenece a una.</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button>
          <a className="ui-btn ui-btn-primary" href="/admin/carreras">Ir a Carreras</a>
        </div>
      </Modal>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ carrera_id: careerId, codigo: code.trim().toUpperCase(), modalidad: modality })
  }

  return (
    <Modal title="Nuevo plan de estudio" description="Se crea como borrador: podrás armar su malla antes de publicarlo. Todos los campos son obligatorios." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <Field id="plan-career" label="Carrera">
          <select id="plan-career" className="ui-select" value={careerId} onChange={(event) => setCareerId(event.target.value)} required data-autofocus="">
            {careers.map((career) => <option key={career.id} value={career.id}>{career.codigo} — {career.nombre}{career.activo ? "" : " (inactiva)"}</option>)}
          </select>
        </Field>
        <Field id="plan-code" label="Código del plan" hint="Ejemplo: SIS-2026. Se guarda en mayúsculas.">
          <input id="plan-code" className="ui-input" value={code} onChange={(event) => setCode(event.target.value)} maxLength={32} required autoComplete="off" aria-describedby="plan-code-hint" />
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
  return (
    <Modal title="Editar código del plan" description="El código solo se puede cambiar mientras el plan está en borrador." onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(code.trim().toUpperCase()) }}>
        <DialogError error={error} />
        <Field id="plan-edit-code" label="Código del plan">
          <input id="plan-edit-code" className="ui-input" value={code} onChange={(event) => setCode(event.target.value)} maxLength={32} required autoComplete="off" data-autofocus="" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Guardar cambios" icon="check" />
      </form>
    </Modal>
  )
}

function PlanStateDialog({ plan, busy, error, onClose, onSubmit }: DialogBase & { plan: StudyPlan; onSubmit: (state: PlanState) => void }) {
  const options = NEXT_STATES[plan.estado]
  // El botón que abre este diálogo ya dice qué se quiere hacer ("Publicar", "Desactivar", "Reactivar"): se preselecciona.
  const [state, setState] = useState<PlanState>(options[0])
  const help: Record<PlanState, string> = {
    BORRADOR: "",
    VIGENTE: plan.estado === "BORRADOR"
      ? "Publica el plan para inscribir estudiantes. Después ya no podrás modificar su estructura ni volver a borrador."
      : "Vuelve a habilitar el plan para inscribir estudiantes.",
    INACTIVO: "Deja de usarse para nuevas inscripciones. La estructura se conserva y sigue sin poder modificarse.",
  }
  return (
    <Modal title={STATE_ACTION[plan.estado]} description={`El plan ${plan.codigo} está ahora en estado «${STATE_LABEL[plan.estado]}».`} onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(state) }}>
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
        <FormActions busy={busy} onClose={onClose} submitLabel="Confirmar cambio" icon="check" />
      </form>
    </Modal>
  )
}

function UnitDialog({ mode, initialNumber, initialName, busy, error, onClose, onSubmit }: DialogBase & { mode: "add" | "edit"; initialNumber: number; initialName: string; onSubmit: (data: { numero: number; nombre: string }) => void }) {
  const [number, setNumber] = useState(String(initialNumber))
  const [name, setName] = useState(initialName)
  return (
    <Modal title={mode === "add" ? "Agregar semestre" : `Editar semestre ${initialNumber}`} description={mode === "add" ? "Todos los campos son obligatorios." : "Solo se puede cambiar el nombre; el número identifica al semestre."} onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit({ numero: Number(number), nombre: name.trim() }) }}>
        <DialogError error={error} />
        {mode === "add" && (
          <Field id="unit-number" label="Número de semestre" hint="Ya se sugiere el siguiente disponible.">
            <input id="unit-number" className="ui-input" type="number" inputMode="numeric" min={1} value={number} onChange={(event) => setNumber(event.target.value)} required aria-describedby="unit-number-hint" />
          </Field>
        )}
        <Field id="unit-name" label="Nombre" hint="Ejemplo: Primer semestre.">
          <input id="unit-name" className="ui-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoComplete="off" aria-describedby="unit-name-hint" data-autofocus="" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel={mode === "add" ? "Agregar semestre" : "Guardar cambios"} icon="check" />
      </form>
    </Modal>
  )
}

function AddSubjectDialog({ unit, available, busy, error, onClose, onSubmit }: DialogBase & { unit: PlanUnit; available: Subject[]; onSubmit: (subjectId: string) => void }) {
  const [subjectId, setSubjectId] = useState("")
  const title = `Agregar materia al semestre ${unit.numero}`
  if (available.length === 0) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="ui-alert ui-alert-warning ui-alert-flush">No quedan materias del catálogo por agregar a este plan.</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button>
          <a className="ui-btn ui-btn-primary" href="/admin/materias">Ir a Materias</a>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title={title} description={`La materia se agregará a «${unit.nombre}». Podrás moverla después arrastrando su tarjeta.`} onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(subjectId) }}>
        <DialogError error={error} />
        <Field id="subject-pick" label="Materia del catálogo">
          <select id="subject-pick" className="ui-select" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required data-autofocus="">
            <option value="">Selecciona una materia</option>
            {available.map((subject) => <option key={subject.id} value={subject.id}>{subject.codigo} — {subject.nombre}{subject.activo ? "" : " (inactiva)"}</option>)}
          </select>
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Agregar materia" icon="plus" />
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
  const candidates = prerequisiteCandidates(plan, subject)
  const dependents = allSubjectsOf(plan).filter((candidate) => candidate.prerrequisitos.includes(subject.id))

  return (
    <Modal title={`${subject.codigo} — ${subject.nombre}`} description={`Semestre ${unit.numero} · ${unit.nombre}`} onClose={onClose} locked={busy}>
      <DialogError error={error} />

      <section className="mg-section" aria-labelledby="mg-req-title">
        <h3 id="mg-req-title">Prerrequisitos</h3>
        {subject.prerrequisitos.length === 0 ? <p>Esta materia no tiene prerrequisitos.</p> : (
          <ul className="mg-chips" aria-label={`Prerrequisitos de ${subject.codigo}`}>
            {subject.prerrequisitos.map((id) => {
              const required = subjectById.get(id)
              const label = required ? `${required.codigo} — ${required.nombre}` : "Otra materia"
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
          <form className="mg-inline" onSubmit={(event) => { event.preventDefault(); void onAddPrerequisite(requirementId).then((ok) => { if (ok) setRequirementId("") }) }}>
            <Field id="mg-req-pick" label="Agregar prerrequisito (debe aprobarla antes, con 51 o más)">
              <select id="mg-req-pick" className="ui-select" value={requirementId} onChange={(event) => setRequirementId(event.target.value)} required data-autofocus="">
                <option value="">Selecciona una materia</option>
                {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
              </select>
            </Field>
            <button type="submit" className="ui-btn ui-btn-primary" disabled={busy}><ButtonLabel icon="plus">Agregar</ButtonLabel></button>
          </form>
        )}
        {editable && candidates.length === 0 && <p>No hay más materias en el plan que puedan ser prerrequisito.</p>}
      </section>

      <section className="mg-section" aria-labelledby="mg-dep-title">
        <h3 id="mg-dep-title">Es prerrequisito de</h3>
        {dependents.length === 0 ? <p>Ninguna materia del plan la requiere.</p> : (
          <ul className="mg-chips">{dependents.map((dependent) => <li key={dependent.id} className="ui-chip ui-chip-static">{dependent.codigo} — {dependent.nombre}</li>)}</ul>
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
            <button type="submit" className="ui-btn ui-btn-secondary" disabled={busy}>Mover</button>
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

function AssignStudentDialog({ plan, students, busy, error, onClose, onSubmit }: DialogBase & { plan: StudyPlan; students: StudentPlan[]; onSubmit: (student: StudentPlan) => void }) {
  const [studentId, setStudentId] = useState("")
  const candidates = students
    .filter((student) => student.plan_estudio_id !== plan.id)
    .sort((a, b) => Number(Boolean(a.plan_estudio_id)) - Number(Boolean(b.plan_estudio_id)) || a.apellidos.localeCompare(b.apellidos, "es"))
  const title = `Asignar estudiante al plan ${plan.codigo}`

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
        if (student) onSubmit(student)
      }}>
        <DialogError error={error} />
        <Field id="student-pick" label="Estudiante">
          <select id="student-pick" className="ui-select" value={studentId} onChange={(event) => setStudentId(event.target.value)} required data-autofocus="">
            <option value="">Selecciona un estudiante</option>
            {candidates.map((student) => <option key={student.usuario_id} value={student.usuario_id}>{fullName(student)} — CI {student.ci} · {student.plan_codigo ? `Plan actual: ${student.plan_codigo}` : "Sin plan"}</option>)}
          </select>
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Asignar plan" icon="check" />
      </form>
    </Modal>
  )
}
