import { useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, RefObject } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, Course, CourseSchedule, ScheduleException, ScheduleExceptionType, StudyPlan, User, Weekday } from "../../api/client"
import { Icon } from "../shared/icons"
import { Modal } from "../shared/Modal"
import { ButtonLabel, ConfirmDialog, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { codeSchema, dateSchema, messageOf, positiveIntSchema, timeSchema } from "../shared/validation"
import { PeriodBar } from "../planning/PeriodBar"
import { PlanningShell } from "../planning/PlanningShell"
import { WEEKDAYS, formatDate, formatDateWithWeekday, formatTime, plural } from "../planning/dates"
import { usePeriodSelection } from "../planning/usePeriodSelection"

type CoursePatch = Parameters<typeof api.updateCourse>[1]
type ExceptionPayload = Parameters<typeof api.createException>[1]
type ScheduleInput = Omit<CourseSchedule, "id">
type TabId = "schedule" | "exceptions"
type Filter = "all" | "open" | "closed" | "attention" | "inactive"

type Dialog =
  | { kind: "create" }
  | { kind: "edit" }
  | { kind: "add-schedule" }
  | { kind: "add-exception" }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; onConfirm: () => void }

const TABS: { id: TabId; label: string }[] = [{ id: "schedule", label: "Horario semanal" }, { id: "exceptions", label: "Excepciones de calendario" }]
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" }, { id: "open", label: "Inscripción abierta" }, { id: "closed", label: "Inscripción cerrada" },
  { id: "attention", label: "Requieren atención" }, { id: "inactive", label: "Inactivos" },
]

const weekdayIndex = (day: Weekday) => WEEKDAYS.findIndex((item) => item.value === day)
const sortedSchedules = (course: Course) => [...course.horarios].sort((a, b) => weekdayIndex(a.dia_semana) - weekdayIndex(b.dia_semana) || a.hora_inicio.localeCompare(b.hora_inicio))
const needsAttention = (course: Course) => course.activo && (!course.docente_id || course.horarios.length === 0)
const courseSort = (a: Course, b: Course) => a.materia_codigo.localeCompare(b.materia_codigo) || a.paralelo.localeCompare(b.paralelo)
const toScheduleInput = (item: CourseSchedule): ScheduleInput => ({ dia_semana: item.dia_semana, hora_inicio: item.hora_inicio, hora_fin: item.hora_fin, aula: item.aula })

function nextParallelLetter(courses: Course[], materiaPlanId: string, periodId: string) {
  const used = new Set(courses.filter((course) => course.materia_plan_id === materiaPlanId && course.periodo_id === periodId).map((course) => course.paralelo))
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((letter) => !used.has(letter)) ?? ""
}

function scheduleSummary(course: Course) {
  const slots = sortedSchedules(course)
  if (slots.length === 0) return ""
  const shown = slots.slice(0, 2).map((slot) => `${WEEKDAYS[weekdayIndex(slot.dia_semana)]?.short} ${formatTime(slot.hora_inicio)}–${formatTime(slot.hora_fin)}`).join(" · ")
  return slots.length > 2 ? `${shown} · +${slots.length - 2} más` : shown
}

/* ------------------------------------------------------------------ */
/* Página (contenedor)                                                 */
/* ------------------------------------------------------------------ */

export function ParallelsPage() {
  const { periods, periodId, setPeriodId, loading: periodsLoading, error: periodsError } = usePeriodSelection()
  const [courses, setCourses] = useState<Course[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [exceptions, setExceptions] = useState<ScheduleException[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [tab, setTab] = useState<TabId>("schedule")
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [dialogError, setDialogError] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const selectedCourse = courses.find((course) => course.id === selectedId) ?? null

  async function reload() {
    const [courseData, planData, userData] = await Promise.all([api.listCourses(), api.listPlans(), api.listUsers()])
    setCourses(courseData)
    setPlans(planData)
    setTeachers(userData.filter((user) => user.rol === "DOCENTE" && user.activo))
    setSelectedId((current) => (courseData.some((course) => course.id === current) ? current : ""))
  }

  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setDataLoading(false)) }, [])
  useEffect(() => {
    if (!selectedId) { setExceptions([]); return }
    void api.listExceptions(selectedId).then(setExceptions).catch((reason: Error) => setError(reason.message))
  }, [selectedId])
  // Al pasar de la lista al detalle (y viceversa) el foco va al título.
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
  async function submitDialog(action: () => Promise<unknown>, success: string) { if (await dialogAction(action, success)) closeDialog() }
  function openCourse(id: string) { setError(""); setNotice(""); setTab("schedule"); setSelectedId(id) }
  function backToList() { setError(""); setNotice(""); setSelectedId("") }
  async function refreshExceptions(courseId: string) { setExceptions(await api.listExceptions(courseId)) }

  const toggleRegistration = (course: Course) => run(
    () => api.setCourseRegistration(course.id, !course.inscripcion_abierta),
    course.inscripcion_abierta ? "Inscripciones cerradas." : "Inscripciones abiertas.",
  )
  const toggleActive = (course: Course) => run(
    () => api.updateCourse(course.id, { activo: !course.activo }),
    course.activo ? "Paralelo inactivado; las inscripciones quedaron cerradas." : "Paralelo activado; las inscripciones permanecen cerradas.",
  )

  async function createCourse(data: Parameters<typeof api.createCourse>[0]) {
    let createdId = ""
    const ok = await dialogAction(
      async () => { createdId = (await api.createCourse(data)).id },
      `Paralelo ${data.paralelo} creado. Siguiente paso: agrega su horario para poder abrir inscripciones.`,
    )
    if (ok) { closeDialog(); setTab("schedule"); setSelectedId(createdId) }
  }

  function renderDialog() {
    if (!dialog) return null
    const common = { busy, error: dialogError, onClose: closeDialog }
    if (dialog.kind === "create") return <CreateCourseDialog {...common} plans={plans} periods={periods} defaultPeriodId={periodId} courses={courses} teachers={teachers} onSubmit={(data) => void createCourse(data)} />
    if (dialog.kind === "confirm") return <ConfirmDialog {...common} title={dialog.title} message={dialog.message} confirmLabel={dialog.confirmLabel} onConfirm={dialog.onConfirm} />
    if (!selectedCourse) return null
    const course = selectedCourse
    switch (dialog.kind) {
      case "edit":
        return <EditCourseDialog {...common} course={course} teachers={teachers} onSubmit={(patch) => {
          if (Object.keys(patch).length === 0) { closeDialog(); return }
          void submitDialog(() => api.updateCourse(course.id, patch), "Datos del paralelo actualizados.")
        }} />
      case "add-schedule":
        return <AddScheduleDialog {...common} onSubmit={(input) => void submitDialog(
          () => api.replaceCourseSchedules(course.id, [...course.horarios.map(toScheduleInput), { ...input, aula: input.aula || null }]),
          "Horario actualizado.",
        )} />
      case "add-exception":
        return <AddExceptionDialog {...common} course={course} onSubmit={(payload) => void submitDialog(
          async () => { await api.createException(course.id, payload); await refreshExceptions(course.id) },
          "Excepción de calendario registrada.",
        )} />
      default:
        return null
    }
  }

  const actions = selectedCourse && {
    openDialog,
    toggleRegistration: () => void toggleRegistration(selectedCourse),
    toggleActive: () => void toggleActive(selectedCourse),
    remove: () => openDialog({
      kind: "confirm",
      title: `Eliminar el paralelo ${selectedCourse.paralelo} de ${selectedCourse.materia_codigo}`,
      message: "Se eliminará el paralelo con su horario y sus excepciones. Esta acción no se puede deshacer. Si ya tiene inscripciones, el sistema lo impedirá; en ese caso puedes inactivarlo.",
      confirmLabel: "Eliminar paralelo",
      onConfirm: () => { void submitDialog(() => api.deleteCourse(selectedCourse.id), `Paralelo ${selectedCourse.paralelo} de ${selectedCourse.materia_codigo} eliminado.`) },
    }),
    removeSchedule: (slot: CourseSchedule) => void run(
      () => api.replaceCourseSchedules(selectedCourse.id, selectedCourse.horarios.filter((item) => item.id !== slot.id).map(toScheduleInput)),
      "Horario quitado.",
    ),
    removeException: (exception: ScheduleException) => void run(
      async () => { await api.deleteException(selectedCourse.id, exception.id); await refreshExceptions(selectedCourse.id) },
      "Excepción quitada.",
    ),
  }

  if (periodsLoading || dataLoading) return <PlanningShell current="paralelos"><p className="cat-loading" role="status">Cargando paralelos…</p></PlanningShell>

  return (
    <PlanningShell current="paralelos" periodId={periodId}>
      <Notices notice={notice} error={error || periodsError} />
      {selectedCourse && actions ? (
        <CourseDetail course={selectedCourse} exceptions={exceptions} tab={tab} headingRef={headingRef} busy={busy} onTab={setTab} onBack={backToList} actions={actions} />
      ) : (
        <CourseList
          periods={periods}
          periodId={periodId}
          onPeriod={setPeriodId}
          courses={courses.filter((course) => course.periodo_id === periodId).sort(courseSort)}
          headingRef={headingRef}
          busy={busy}
          onCreate={() => openDialog({ kind: "create" })}
          onOpen={openCourse}
          onToggleRegistration={(course) => void toggleRegistration(course)}
          onToggleActive={(course) => void toggleActive(course)}
        />
      )}
      {renderDialog()}
    </PlanningShell>
  )
}

/* ------------------------------------------------------------------ */
/* Vista 1: lista de paralelos del semestre                            */
/* ------------------------------------------------------------------ */

interface CourseListProps {
  periods: AcademicPeriod[]
  periodId: string
  onPeriod: (id: string) => void
  courses: Course[]
  headingRef: RefObject<HTMLHeadingElement | null>
  busy: boolean
  onCreate: () => void
  onOpen: (id: string) => void
  onToggleRegistration: (course: Course) => void
  onToggleActive: (course: Course) => void
}

function CourseList({ periods, periodId, onPeriod, courses, headingRef, busy, onCreate, onOpen, onToggleRegistration, onToggleActive }: CourseListProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")

  const counts: Record<Filter, number> = {
    all: courses.length,
    open: courses.filter((course) => course.activo && course.inscripcion_abierta).length,
    closed: courses.filter((course) => course.activo && !course.inscripcion_abierta).length,
    attention: courses.filter(needsAttention).length,
    inactive: courses.filter((course) => !course.activo).length,
  }
  const matches = (course: Course) =>
    filter === "all" ||
    (filter === "open" && course.activo && course.inscripcion_abierta) ||
    (filter === "closed" && course.activo && !course.inscripcion_abierta) ||
    (filter === "attention" && needsAttention(course)) ||
    (filter === "inactive" && !course.activo)
  const needle = query.trim().toLowerCase()
  const visible = courses.filter((course) => matches(course) && (!needle || `${course.materia_codigo} ${course.materia_nombre} ${course.paralelo} ${course.docente_nombre ?? ""}`.toLowerCase().includes(needle)))

  return (
    <>
      <PageHeader
        eyebrow="PLANIFICACIÓN ACADÉMICA"
        title="Oferta y paralelos"
        description="Organiza las materias que se abrirán en el semestre. En planes modulares, define las fechas de cada paralelo para ubicarlo en su bloque mensual."
        headingRef={headingRef}
        actions={periods.length > 0 ? <button type="button" className="ui-btn ui-btn-primary" onClick={onCreate}><ButtonLabel icon="plus">Nuevo paralelo</ButtonLabel></button> : undefined}
      />

      {periods.length === 0 ? (
        <EmptyState icon="layers" title="Primero registra un semestre académico">
          Los paralelos se programan dentro de un semestre. <a className="ui-btn ui-btn-primary" href="/admin/periodos" style={{ marginTop: 8 }}>Ir a Planificar semestre</a>
        </EmptyState>
      ) : (
        <>
          <PeriodBar periods={periods} periodId={periodId} onChange={onPeriod} />

          {courses.length === 0 ? (
            <EmptyState icon="layers" title="No hay paralelos programados para este semestre">
              Usa «Nuevo paralelo» para crear el primero. Después agrega su horario para poder abrir inscripciones.
            </EmptyState>
          ) : (
            <>
              <dl className="pl-tiles" aria-label="Resumen de la oferta">
                <div><dt>Paralelos</dt><dd>{counts.all}</dd></div>
                <div><dt>Inscripción abierta</dt><dd>{counts.open}</dd></div>
                <div data-warn={counts.attention > 0 ? "" : undefined}><dt>Requieren atención</dt><dd>{counts.attention}</dd></div>
              </dl>

              <div className="pl-auth-bar">
                <div className="pl-segment" role="group" aria-label="Filtrar paralelos">
                  {FILTERS.map((item) => (
                    <button key={item.id} type="button" className="pl-segment-btn" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                      {item.label} <span className="ui-count">{counts[item.id]}</span>
                    </button>
                  ))}
                </div>
                {courses.length > 6 && (
                  <div className="ui-field pl-auth-search">
                    <label htmlFor="course-search">Buscar materia, paralelo o docente</label>
                    <input id="course-search" type="search" className="ui-input" value={query} onChange={(event) => setQuery(event.target.value)} />
                  </div>
                )}
              </div>

              {visible.length === 0 ? (
                <EmptyState icon="search" title="Ningún paralelo coincide con el filtro" />
              ) : (
                <ul className="pl-grid pl-grid--courses">
                  {visible.map((course) => (
                    <li key={course.id}>
                      <article className="pl-card" data-tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>
                        <div className="pl-card-top">
                          <StatusBadge tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>
                            {!course.activo ? "Inactivo" : course.inscripcion_abierta ? "Inscripción abierta" : "Inscripción cerrada"}
                          </StatusBadge>
                          <span className="pl-parallel">Paralelo {course.paralelo}</span>
                        </div>
                        <h3>{course.materia_codigo} — {course.materia_nombre}</h3>
                        <p className="pl-card-dates">{course.plan_codigo} · {formatDate(course.fecha_inicio)} – {formatDate(course.fecha_fin)}</p>
                        <dl className="pl-facts">
                          <div><dt>Docente</dt><dd>{course.docente_nombre ?? <span className="pl-warn">Sin asignar</span>}</dd></div>
                          <div><dt>Cupo</dt><dd>{course.cupo}</dd></div>
                          <div><dt>Horario</dt><dd>{course.horarios.length ? scheduleSummary(course) : <span className="pl-warn">Sin horario</span>}</dd></div>
                        </dl>
                        <div className="pl-card-actions">
                          {!course.activo
                            ? <button type="button" className="ui-btn ui-btn-success-outline ui-btn-sm" disabled={busy} aria-label={`Activar paralelo ${course.paralelo} de ${course.materia_codigo}`} onClick={() => onToggleActive(course)}><ButtonLabel icon="play">Activar</ButtonLabel></button>
                            : course.inscripcion_abierta
                              ? <button type="button" className="ui-btn ui-btn-warning ui-btn-sm" disabled={busy} aria-label={`Cerrar inscripción del paralelo ${course.paralelo} de ${course.materia_codigo}`} onClick={() => onToggleRegistration(course)}><ButtonLabel icon="pause">Cerrar inscripción</ButtonLabel></button>
                              : <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} aria-label={`Abrir inscripción del paralelo ${course.paralelo} de ${course.materia_codigo}`} onClick={() => onToggleRegistration(course)}><ButtonLabel icon="check">Abrir inscripción</ButtonLabel></button>}
                          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" aria-label={`Gestionar paralelo ${course.paralelo} de ${course.materia_codigo}`} onClick={() => onOpen(course.id)}><ButtonLabel icon="edit">Gestionar</ButtonLabel></button>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Vista 2: detalle de un paralelo                                     */
/* ------------------------------------------------------------------ */

interface CourseActions {
  openDialog: (dialog: Dialog) => void
  toggleRegistration: () => void
  toggleActive: () => void
  remove: () => void
  removeSchedule: (slot: CourseSchedule) => void
  removeException: (exception: ScheduleException) => void
}

function CourseDetail({ course, exceptions, tab, headingRef, busy, onTab, onBack, actions }: {
  course: Course
  exceptions: ScheduleException[]
  tab: TabId
  headingRef: RefObject<HTMLHeadingElement | null>
  busy: boolean
  onTab: (tab: TabId) => void
  onBack: () => void
  actions: CourseActions
}) {
  const checks = [
    { ok: Boolean(course.docente_id), good: `Docente asignado: ${course.docente_nombre ?? ""}`, bad: "Falta asignar un docente" },
    { ok: course.horarios.length > 0, good: `Horario definido (${plural(course.horarios.length, "franja", "franjas")} por semana)`, bad: "Falta definir el horario semanal" },
    { ok: course.plan_estado === "VIGENTE", good: `Plan ${course.plan_codigo} vigente`, bad: `El plan ${course.plan_codigo} no está vigente` },
  ]
  const counts: Record<TabId, number> = { schedule: course.horarios.length, exceptions: exceptions.length }

  return (
    <>
      <nav className="pl-breadcrumb" aria-label="Ruta de navegación">
        <ol>
          <li><button type="button" className="ui-link-button" onClick={onBack}><Icon name="back" size={14} />Oferta y paralelos</button></li>
          <li aria-current="page">{course.materia_codigo} · {course.paralelo}</li>
        </ol>
      </nav>

      <div className="pl-hero" data-tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>
        <div className="pl-hero-main">
          <div className="pl-badges">
            <StatusBadge tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>
              {!course.activo ? "Inactivo" : course.inscripcion_abierta ? "Inscripción abierta" : "Inscripción cerrada"}
            </StatusBadge>
            <span className="pl-parallel">Paralelo {course.paralelo}</span>
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="ui-heading-focus">{course.materia_codigo} — {course.materia_nombre}</h1>
          <p className="pl-hero-sub">{course.plan_codigo} · Semestre {course.periodo_denominacion} · {formatDate(course.fecha_inicio)} – {formatDate(course.fecha_fin)}</p>
        </div>
        <dl className="pl-stats">
          <div><dt>Cupo</dt><dd>{course.cupo}</dd></div>
          <div><dt>Franjas</dt><dd>{course.horarios.length}</dd></div>
          <div><dt>Excepciones</dt><dd>{exceptions.length}</dd></div>
        </dl>

        <ul className="pl-checks" aria-label="Preparación del paralelo">
          {checks.map((check) => (
            <li key={check.bad} data-ok={check.ok ? "" : undefined}>
              <span className="pl-check-mark" aria-hidden="true">{check.ok ? <Icon name="check" size={14} /> : "!"}</span>
              {check.ok ? check.good : check.bad}
            </li>
          ))}
        </ul>

        <div className="pl-hero-actions" role="group" aria-label="Acciones del paralelo">
          {course.activo && !course.inscripcion_abierta && <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={actions.toggleRegistration}><ButtonLabel icon="check">Abrir inscripción</ButtonLabel></button>}
          {course.activo && course.inscripcion_abierta && <button type="button" className="ui-btn ui-btn-warning" disabled={busy} onClick={actions.toggleRegistration}><ButtonLabel icon="pause">Cerrar inscripción</ButtonLabel></button>}
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => actions.openDialog({ kind: "edit" })}><ButtonLabel icon="edit">Editar datos</ButtonLabel></button>
          {course.activo
            ? <button type="button" className="ui-btn ui-btn-warning" disabled={busy} onClick={actions.toggleActive}><ButtonLabel icon="pause">Inactivar</ButtonLabel></button>
            : <button type="button" className="ui-btn ui-btn-success-outline" disabled={busy} onClick={actions.toggleActive}><ButtonLabel icon="play">Activar</ButtonLabel></button>}
          <button type="button" className="ui-btn ui-btn-danger-outline" onClick={actions.remove}><ButtonLabel icon="trash">Eliminar paralelo</ButtonLabel></button>
        </div>
      </div>

      <CourseTabs tab={tab} onTab={onTab} counts={counts} />

      <div role="tabpanel" id={`course-panel-${tab}`} aria-labelledby={`course-tab-${tab}`} className="ui-tabpanel" tabIndex={0}>
        {tab === "schedule" && <SchedulePanel course={course} busy={busy} actions={actions} />}
        {tab === "exceptions" && <ExceptionsPanel exceptions={exceptions} busy={busy} actions={actions} />}
      </div>
    </>
  )
}

function CourseTabs({ tab, onTab, counts }: { tab: TabId; onTab: (tab: TabId) => void; counts: Record<TabId, number> }) {
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
    document.getElementById(`course-tab-${TABS[next].id}`)?.focus()
  }
  return (
    <div className="ui-tabs" role="tablist" aria-label="Secciones del paralelo" onKeyDown={onKeyDown}>
      {TABS.map((item) => (
        <button key={item.id} type="button" role="tab" id={`course-tab-${item.id}`} className="ui-tab" aria-selected={tab === item.id} aria-controls={`course-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => onTab(item.id)}>
          {item.label} <span className="ui-count">{counts[item.id]}</span>
        </button>
      ))}
    </div>
  )
}

function SchedulePanel({ course, busy, actions }: { course: Course; busy: boolean; actions: CourseActions }) {
  const slots = sortedSchedules(course)
  return (
    <>
      <div className="pl-toolbar">
        <h2>Horario semanal</h2>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => actions.openDialog({ kind: "add-schedule" })}><ButtonLabel icon="plus">Agregar horario</ButtonLabel></button>
      </div>
      <p className="pl-lead">Las clases se repiten cada semana dentro de las fechas del paralelo, salvo feriados y excepciones.</p>
      {slots.length === 0 && <p className="ui-alert ui-alert-warning">Este paralelo aún no tiene horario. Agrégalo para poder abrir inscripciones.</p>}
      <ol className="pl-week">
        {WEEKDAYS.map((day) => {
          const own = slots.filter((slot) => slot.dia_semana === day.value)
          return (
            <li key={day.value} className="pl-day" data-empty={own.length === 0 ? "" : undefined}>
              <h3>{day.label}</h3>
              {own.length === 0 ? <p className="pl-day-empty">Sin clases</p> : (
                <ul>
                  {own.map((slot) => (
                    <li key={slot.id} className="pl-slot">
                      <span className="pl-slot-time">{formatTime(slot.hora_inicio)}–{formatTime(slot.hora_fin)}</span>
                      {slot.aula && <span className="pl-slot-room">{slot.aula}</span>}
                      <button type="button" className="ui-chip-remove" disabled={busy} aria-label={`Quitar horario del ${day.label} ${formatTime(slot.hora_inicio)} a ${formatTime(slot.hora_fin)}`} onClick={() => actions.removeSchedule(slot)}><span aria-hidden="true">×</span></button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

function ExceptionsPanel({ exceptions, busy, actions }: { exceptions: ScheduleException[]; busy: boolean; actions: CourseActions }) {
  const sorted = [...exceptions].sort((a, b) => a.fecha_original.localeCompare(b.fecha_original))
  return (
    <>
      <div className="pl-toolbar">
        <h2>Excepciones de calendario</h2>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => actions.openDialog({ kind: "add-exception" })}><ButtonLabel icon="plus">Agregar excepción</ButtonLabel></button>
      </div>
      <p className="pl-lead">Cancela o reprograma una clase puntual sin cambiar el horario semanal.</p>
      {sorted.length === 0 ? (
        <EmptyState icon="layers" title="No hay excepciones">Todas las clases siguen el horario semanal.</EmptyState>
      ) : (
        <ul className="pl-exceptions">
          {sorted.map((exception) => (
            <li key={exception.id} className="pl-exception">
              <StatusBadge tone={exception.tipo === "CANCELADA" ? "gray" : "amber"}>{exception.tipo === "CANCELADA" ? "Cancelada" : "Reprogramada"}</StatusBadge>
              <div className="pl-exception-text">
                <strong>Clase del {formatDateWithWeekday(exception.fecha_original)}</strong>
                <span>
                  {exception.tipo === "CANCELADA" ? "No se dicta esa clase." : `Pasa al ${formatDateWithWeekday(exception.fecha_reprogramada ?? exception.fecha_original)}, de ${formatTime(exception.hora_inicio)} a ${formatTime(exception.hora_fin)}.`}
                  {exception.motivo ? ` Motivo: ${exception.motivo}` : ""}
                </span>
              </div>
              <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger" disabled={busy} aria-label={`Quitar excepción del ${formatDate(exception.fecha_original)}`} onClick={() => actions.removeException(exception)}><ButtonLabel icon="trash">Quitar</ButtonLabel></button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Diálogos                                                            */
/* ------------------------------------------------------------------ */

interface DialogBase { busy: boolean; error: string; onClose: () => void }

function CreateCourseDialog({ plans, periods, defaultPeriodId, courses, teachers, busy, error, onClose, onSubmit }: DialogBase & {
  plans: StudyPlan[]
  periods: AcademicPeriod[]
  defaultPeriodId: string
  courses: Course[]
  teachers: User[]
  onSubmit: (data: Parameters<typeof api.createCourse>[0]) => void
}) {
  const vigentPlans = plans.filter((plan) => plan.estado === "VIGENTE")
  const firstSubject = vigentPlans.flatMap((plan) => plan.unidades.flatMap((unit) => unit.materias))[0]?.id ?? ""
  const [subjectId, setSubjectId] = useState(firstSubject)
  const [periodId, setPeriodId] = useState(defaultPeriodId)
  const [parallel, setParallel] = useState("")
  const [parallelTouched, setParallelTouched] = useState(false)
  const [capacity, setCapacity] = useState("30")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [datesTouched, setDatesTouched] = useState(false)
  const [teacherId, setTeacherId] = useState("")
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  if (firstSubject === "") {
    return (
      <Modal title="Nuevo paralelo" onClose={onClose}>
        <p className="ui-alert ui-alert-warning ui-alert-flush">Antes de crear paralelos necesitas un plan de estudio vigente con al menos una materia.</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button>
          <a className="ui-btn ui-btn-primary" href="/admin/planes">Ir a Planes de estudio</a>
        </div>
      </Modal>
    )
  }

  const period = periods.find((item) => item.id === periodId)
  // Valores sugeridos: se usan mientras la persona no los haya escrito ella misma.
  const shownParallel = parallelTouched ? parallel : nextParallelLetter(courses, subjectId, periodId)
  const shownStart = datesTouched ? start : period?.fecha_inicio ?? ""
  const shownEnd = datesTouched ? end : period?.fecha_fin ?? ""

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      paralelo: messageOf(codeSchema, shownParallel),
      cupo: messageOf(positiveIntSchema, Number(capacity)),
      fecha_inicio: messageOf(dateSchema, shownStart),
      fecha_fin: messageOf(dateSchema, shownEnd) ?? (shownStart && shownEnd <= shownStart ? "La fecha de fin debe ser posterior a la de inicio." : null),
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    onSubmit({
      materia_plan_id: subjectId, periodo_id: periodId, paralelo: shownParallel.trim().toUpperCase(), cupo: Number(capacity),
      fecha_inicio: shownStart, fecha_fin: shownEnd, ...(teacherId ? { docente_id: teacherId } : {}),
    })
  }

  return (
    <Modal title="Nuevo paralelo" description="Se crea con inscripción cerrada. Después podrás agregar su horario y abrirla. Los campos se sugieren automáticamente." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <Field id="course-subject" label="Materia del plan">
          <select id="course-subject" className="ui-select" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required data-autofocus="">
            {vigentPlans.map((plan) => (
              <optgroup key={plan.id} label={`Plan ${plan.codigo} · ${plan.carrera_nombre}`}>
                {plan.unidades.flatMap((unit) => unit.materias).map((subject) => <option key={subject.id} value={subject.id}>{subject.codigo} — {subject.nombre}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field id="course-period" label="Semestre académico">
          <select id="course-period" className="ui-select" value={periodId} onChange={(event) => setPeriodId(event.target.value)} required>
            {periods.map((item) => <option key={item.id} value={item.id}>{item.denominacion}</option>)}
          </select>
        </Field>
        <div className="pl-form-row">
          <Field id="course-parallel" label="Paralelo" hint="Se sugiere la siguiente letra libre." error={errors.paralelo}>
            <input id="course-parallel" className="ui-input" value={shownParallel} onChange={(event) => { setParallelTouched(true); setParallel(event.target.value.toUpperCase()); setErrors((current) => ({ ...current, paralelo: null })) }} maxLength={32} required autoComplete="off" aria-invalid={Boolean(errors.paralelo)} aria-describedby={errors.paralelo ? "course-parallel-error course-parallel-hint" : "course-parallel-hint"} />
          </Field>
          <Field id="course-capacity" label="Cupo" error={errors.cupo}>
            <input id="course-capacity" className="ui-input" type="number" inputMode="numeric" min={1} value={capacity} onChange={(event) => { setCapacity(event.target.value); setErrors((current) => ({ ...current, cupo: null })) }} required aria-invalid={Boolean(errors.cupo)} aria-describedby={errors.cupo ? "course-capacity-error" : undefined} />
          </Field>
        </div>
        <div className="pl-form-row">
          <Field id="course-start" label="Inicio" error={errors.fecha_inicio}>
            <input id="course-start" className="ui-input" type="date" value={shownStart} onChange={(event) => { setDatesTouched(true); setStart(event.target.value); if (!datesTouched) setEnd(shownEnd); setErrors((current) => ({ ...current, fecha_inicio: null })) }} required aria-invalid={Boolean(errors.fecha_inicio)} aria-describedby={errors.fecha_inicio ? "course-start-error" : undefined} />
          </Field>
          <Field id="course-end" label="Fin" error={errors.fecha_fin}>
            <input id="course-end" className="ui-input" type="date" value={shownEnd} min={shownStart || undefined} onChange={(event) => { setDatesTouched(true); setEnd(event.target.value); if (!datesTouched) setStart(shownStart); setErrors((current) => ({ ...current, fecha_fin: null })) }} required aria-invalid={Boolean(errors.fecha_fin)} aria-describedby={errors.fecha_fin ? "course-end-error" : undefined} />
          </Field>
        </div>
        <p className="ui-field-hint" style={{ marginTop: -8 }}>Por defecto usa las fechas del semestre. En planes modulares, ajústalas al bloque mensual del paralelo.</p>
        <Field id="course-teacher" label="Docente (opcional)" hint="Puedes asignarlo después con «Editar datos».">
          <select id="course-teacher" className="ui-select" value={teacherId} onChange={(event) => setTeacherId(event.target.value)} aria-describedby="course-teacher-hint">
            <option value="">Sin asignar</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.nombres} {teacher.apellidos}</option>)}
          </select>
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Crear paralelo" icon="check" />
      </form>
    </Modal>
  )
}

function EditCourseDialog({ course, teachers, busy, error, onClose, onSubmit }: DialogBase & { course: Course; teachers: User[]; onSubmit: (patch: CoursePatch) => void }) {
  const [parallel, setParallel] = useState(course.paralelo)
  const [capacity, setCapacity] = useState(String(course.cupo))
  const [start, setStart] = useState(course.fecha_inicio)
  const [end, setEnd] = useState(course.fecha_fin)
  const [teacherId, setTeacherId] = useState(course.docente_id ?? "")
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      paralelo: messageOf(codeSchema, parallel),
      cupo: messageOf(positiveIntSchema, Number(capacity)),
      fecha_inicio: messageOf(dateSchema, start),
      fecha_fin: messageOf(dateSchema, end) ?? (start && end <= start ? "La fecha de fin debe ser posterior a la de inicio." : null),
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    const patch: CoursePatch = {}
    if (parallel.trim().toUpperCase() !== course.paralelo) patch.paralelo = parallel.trim().toUpperCase()
    if (Number(capacity) !== course.cupo) patch.cupo = Number(capacity)
    if (start !== course.fecha_inicio) patch.fecha_inicio = start
    if (end !== course.fecha_fin) patch.fecha_fin = end
    if (teacherId !== (course.docente_id ?? "")) patch.docente_id = teacherId || null
    onSubmit(patch)
  }

  return (
    <Modal title={`Editar paralelo ${course.paralelo} · ${course.materia_codigo}`} description="Solo se enviarán los datos que cambies." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <div className="pl-form-row">
          <Field id="edit-parallel" label="Paralelo" error={errors.paralelo}>
            <input id="edit-parallel" className="ui-input" value={parallel} onChange={(event) => { setParallel(event.target.value.toUpperCase()); setErrors((current) => ({ ...current, paralelo: null })) }} maxLength={32} required autoComplete="off" aria-invalid={Boolean(errors.paralelo)} aria-describedby={errors.paralelo ? "edit-parallel-error" : undefined} data-autofocus="" />
          </Field>
          <Field id="edit-capacity" label="Cupo" error={errors.cupo}>
            <input id="edit-capacity" className="ui-input" type="number" inputMode="numeric" min={1} value={capacity} onChange={(event) => { setCapacity(event.target.value); setErrors((current) => ({ ...current, cupo: null })) }} required aria-invalid={Boolean(errors.cupo)} aria-describedby={errors.cupo ? "edit-capacity-error" : undefined} />
          </Field>
        </div>
        <div className="pl-form-row">
          <Field id="edit-start" label="Inicio" error={errors.fecha_inicio}><input id="edit-start" className="ui-input" type="date" value={start} onChange={(event) => { setStart(event.target.value); setErrors((current) => ({ ...current, fecha_inicio: null })) }} required aria-invalid={Boolean(errors.fecha_inicio)} aria-describedby={errors.fecha_inicio ? "edit-start-error" : undefined} /></Field>
          <Field id="edit-end" label="Fin" error={errors.fecha_fin}><input id="edit-end" className="ui-input" type="date" value={end} min={start || undefined} onChange={(event) => { setEnd(event.target.value); setErrors((current) => ({ ...current, fecha_fin: null })) }} required aria-invalid={Boolean(errors.fecha_fin)} aria-describedby={errors.fecha_fin ? "edit-end-error" : undefined} /></Field>
        </div>
        <Field id="edit-teacher" label="Docente">
          <select id="edit-teacher" className="ui-select" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            <option value="">Sin asignar</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.nombres} {teacher.apellidos}</option>)}
            {course.docente_id && !teachers.some((teacher) => teacher.id === course.docente_id) && <option value={course.docente_id}>{course.docente_nombre} (no disponible)</option>}
          </select>
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Guardar cambios" icon="check" />
      </form>
    </Modal>
  )
}

function AddScheduleDialog({ busy, error, onClose, onSubmit }: DialogBase & { onSubmit: (input: ScheduleInput) => void }) {
  const [day, setDay] = useState<Weekday>("LUNES")
  const [from, setFrom] = useState("08:00")
  const [to, setTo] = useState("10:00")
  const [room, setRoom] = useState("")
  const [localError, setLocalError] = useState("")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = messageOf(timeSchema, from) ?? messageOf(timeSchema, to) ?? (to <= from ? "La hora de fin debe ser posterior a la hora de inicio." : null)
    if (invalid) { setLocalError(invalid); return }
    setLocalError("")
    onSubmit({ dia_semana: day, hora_inicio: from, hora_fin: to, aula: room.trim() })
  }

  return (
    <Modal title="Agregar horario" description="Se repetirá cada semana dentro de las fechas del paralelo." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={localError || error} />
        <Field id="slot-day" label="Día">
          <select id="slot-day" className="ui-select" value={day} onChange={(event) => setDay(event.target.value as Weekday)} data-autofocus="">
            {WEEKDAYS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <div className="pl-form-row">
          <Field id="slot-from" label="Desde"><input id="slot-from" className="ui-input" type="time" value={from} onChange={(event) => setFrom(event.target.value)} required /></Field>
          <Field id="slot-to" label="Hasta"><input id="slot-to" className="ui-input" type="time" value={to} onChange={(event) => setTo(event.target.value)} required /></Field>
        </div>
        <Field id="slot-room" label="Aula (opcional)">
          <input id="slot-room" className="ui-input" value={room} onChange={(event) => setRoom(event.target.value)} maxLength={120} autoComplete="off" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Agregar horario" icon="plus" />
      </form>
    </Modal>
  )
}

function AddExceptionDialog({ course, busy, error, onClose, onSubmit }: DialogBase & { course: Course; onSubmit: (payload: ExceptionPayload) => void }) {
  const [original, setOriginal] = useState("")
  const [type, setType] = useState<ScheduleExceptionType>("CANCELADA")
  const [newDate, setNewDate] = useState("")
  const [from, setFrom] = useState("08:00")
  const [to, setTo] = useState("10:00")
  const [reason, setReason] = useState("")
  const [localError, setLocalError] = useState("")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = messageOf(dateSchema, original) ?? (type === "REPROGRAMADA"
      ? messageOf(dateSchema, newDate) ?? messageOf(timeSchema, from) ?? messageOf(timeSchema, to) ?? (to <= from ? "La hora de fin debe ser posterior a la hora de inicio." : null)
      : null)
    if (invalid) { setLocalError(invalid); return }
    setLocalError("")
    onSubmit(type === "CANCELADA"
      ? { fecha_original: original, tipo: type, motivo: reason.trim() || undefined }
      : { fecha_original: original, tipo: type, fecha_reprogramada: newDate, hora_inicio: from, hora_fin: to, motivo: reason.trim() || undefined })
  }

  return (
    <Modal title="Agregar excepción de calendario" description="Afecta solo a la clase de la fecha elegida; el horario semanal no cambia." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={localError || error} />
        <Field id="exc-original" label="Fecha de la clase original" hint={`Entre ${formatDate(course.fecha_inicio)} y ${formatDate(course.fecha_fin)}.`}>
          <input id="exc-original" className="ui-input" type="date" min={course.fecha_inicio} max={course.fecha_fin} value={original} onChange={(event) => setOriginal(event.target.value)} required aria-describedby="exc-original-hint" data-autofocus="" />
        </Field>
        <fieldset className="ui-fieldset">
          <legend>¿Qué pasa con esa clase?</legend>
          <label className="ui-choice"><input type="radio" name="exc-type" value="CANCELADA" checked={type === "CANCELADA"} onChange={() => setType("CANCELADA")} /><strong>Cancelar</strong><span>La clase no se dicta ese día.</span></label>
          <label className="ui-choice"><input type="radio" name="exc-type" value="REPROGRAMADA" checked={type === "REPROGRAMADA"} onChange={() => setType("REPROGRAMADA")} /><strong>Reprogramar</strong><span>La clase se dicta en otra fecha y horario.</span></label>
        </fieldset>
        {type === "REPROGRAMADA" && (
          <>
            <Field id="exc-new" label="Nueva fecha"><input id="exc-new" className="ui-input" type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} required /></Field>
            <div className="pl-form-row">
              <Field id="exc-from" label="Desde"><input id="exc-from" className="ui-input" type="time" value={from} onChange={(event) => setFrom(event.target.value)} required /></Field>
              <Field id="exc-to" label="Hasta"><input id="exc-to" className="ui-input" type="time" value={to} onChange={(event) => setTo(event.target.value)} required /></Field>
            </div>
          </>
        )}
        <Field id="exc-reason" label="Motivo (opcional)">
          <input id="exc-reason" className="ui-input" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} autoComplete="off" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Guardar excepción" icon="check" />
      </form>
    </Modal>
  )
}
