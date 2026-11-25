import { Fragment, useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, Career, Course, CourseSchedule, Faculty, PeriodPlanning, PeriodSubjectOverview, PlanOpening, PlanningRoom, ScheduleBlock, ScheduleException, ScheduleExceptionType, StudyPlan, SubjectSuggestion, User, Weekday } from "../../api/client"
import { Drawer } from "../shared/Drawer"
import { Icon } from "../shared/icons"
import { Modal } from "../shared/Modal"
import { ButtonLabel, ConfirmDialog, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { codeSchema, dateSchema, messageOf, positiveIntSchema, timeSchema } from "../shared/validation"
import { PeriodBar } from "../planning/PeriodBar"
import { AvailabilityPanel } from "../planning/AvailabilityPanel"
import { ModularPlanner } from "../planning/ModularPlanner"
import { MultiModularPlanner } from "../planning/MultiModularPlanner"
import { PlanningShell } from "../planning/PlanningShell"
import { PeriodOfferOverview } from "../planning/PeriodOfferOverview"
import { PeriodWeekCalendar } from "../planning/PeriodWeekCalendar"
import { WEEKDAYS, formatDate, formatDateWithWeekday, formatTime, plural } from "../planning/dates"
import { usePeriodSelection } from "../planning/usePeriodSelection"
import { countActiveParallels } from "./parallelGrouping"

type CoursePatch = Parameters<typeof api.updateCourse>[1]
type ExceptionPayload = Parameters<typeof api.createException>[1]
type ScheduleInput = Omit<CourseSchedule, "id">
type TabId = "schedule" | "exceptions"
type Filter = "all" | "open" | "closed" | "attention" | "inactive"
type Section = "summary" | "offer" | "parallels" | "calendar" | "modular"

type Dialog =
  | { kind: "create"; subjectId?: string; sourceCourseId?: string }
  | { kind: "edit" }
  | { kind: "add-schedule"; suggested?: ScheduleInput }
  | { kind: "add-exception" }
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; onConfirm: () => void }

const TABS: { id: TabId; label: string }[] = [{ id: "schedule", label: "Horario semanal" }, { id: "exceptions", label: "Excepciones de calendario" }]
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" }, { id: "open", label: "Inscripción abierta" }, { id: "closed", label: "Inscripción cerrada" },
  { id: "attention", label: "Requieren atención" }, { id: "inactive", label: "Inactivos" },
]

const weekdayIndex = (day: Weekday) => WEEKDAYS.findIndex((item) => item.value === day)
const sortedSchedules = (course: Course) => [...course.horarios].sort((a, b) => weekdayIndex(a.dia_semana) - weekdayIndex(b.dia_semana) || a.hora_inicio.localeCompare(b.hora_inicio))
const roomCapacityIssue = (cupo: number, code: string | null, rooms: PlanningRoom[]) => {
  if (!code) return "Falta asignar aula"
  const room = rooms.find((item) => item.codigo === code)
  if (!room || room.capacidad === null) return `Falta definir la capacidad del aula ${code}`
  if (cupo > room.capacidad) return `El cupo ${cupo} supera los ${room.capacidad} asientos del aula ${code}`
  return ""
}
const courseRoomIssue = (course: Course, rooms: PlanningRoom[]) => course.horarios
  .map((slot) => roomCapacityIssue(course.cupo, slot.aula, rooms)).find(Boolean) ?? ""
const needsAttention = (course: Course, rooms: PlanningRoom[]) => course.activo && (
  !course.docente_id || course.horarios.length === 0 ||
  Boolean(courseRoomIssue(course, rooms)) ||
  (course.clases_objetivo !== null && course.clases_programadas !== course.clases_objetivo)
)
const attentionReason = (course: Course, rooms: PlanningRoom[]) => {
  if (!course.activo) return "Paralelo inactivo"
  if (!course.docente_id) return "Falta asignar docente"
  if (course.horarios.length === 0) return "Falta definir el horario semanal"
  const roomIssue = courseRoomIssue(course, rooms)
  if (roomIssue) return roomIssue
  if (course.clases_objetivo !== null && course.clases_programadas !== course.clases_objetivo) {
    return `Clases programadas ${course.clases_programadas} de ${course.clases_objetivo}`
  }
  return "Revisar configuración"
}
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
  const [careers, setCareers] = useState<Career[]>([])
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [planning, setPlanning] = useState<PeriodPlanning | null>(null)
  const [planId, setPlanId] = useState(() => new URLSearchParams(window.location.search).get("plan_id") ?? "")
  const [openings, setOpenings] = useState<PlanOpening[]>([])
  const [suggestions, setSuggestions] = useState<SubjectSuggestion[]>([])
  const [overview, setOverview] = useState<PeriodSubjectOverview[]>([])
  const [overviewPeriodId, setOverviewPeriodId] = useState("")
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [calendarRevision, setCalendarRevision] = useState(0)
  const [teachers, setTeachers] = useState<User[]>([])
  const [rooms, setRooms] = useState<PlanningRoom[]>([])
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([])
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
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)

  const selectedCourse = courses.find((course) => course.id === selectedId) ?? null

  async function reload() {
    const [courseData, planData, userData, roomData, blockData, careerData, facultyData] = await Promise.all([api.listCourses(), api.listPlans(), api.listUsers(), api.listPlanningRooms(), api.listScheduleBlocks(), api.listCareers(), api.listFaculties()])
    setCourses(courseData)
    setPlans(planData)
    setCareers(careerData)
    setFaculties(facultyData)
    setTeachers(userData.filter((user) => user.rol === "DOCENTE" && user.activo))
    setRooms(roomData)
    setScheduleBlocks(blockData)
    setSelectedId((current) => (courseData.some((course) => course.id === current) ? current : ""))
    setCalendarRevision((current) => current + 1)
    if (planId && periodId && planning?.periodo_id === periodId && planning.plan_ids.includes(planId)) {
      setSuggestions(await api.listSubjectSuggestions(periodId, planId))
    }
  }

  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setDataLoading(false)) }, [])
  useEffect(() => { setSelectedId("") }, [periodId])
  useEffect(() => {
    if (!periodId) { setPlanning(null); setSuggestions([]); setOpenings([]); return }
    let cancelled = false
    void api.getPeriodPlanning(periodId).then((selection) => {
      if (cancelled) return
      setPlanning(selection)
      setPlanId((current) => selection.plan_ids.includes(current) ? current : selection.plan_ids[0] ?? "")
    }).catch((reason: Error) => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [periodId])
  useEffect(() => {
    if (!periodId || !planId) { setSuggestions([]); setOpenings([]); return }
    setSuggestions([])
    setOpenings([])
    let cancelled = false
    void Promise.all([api.listSubjectSuggestions(periodId, planId), api.listPeriodOpenings(periodId, planId)]).then(([rows, groups]) => {
      if (cancelled) return
      setSuggestions(rows)
      setOpenings(groups)
    }).catch((reason: Error) => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [periodId, planId])
  useEffect(() => {
    if (!periodId) { setOverview([]); setOverviewPeriodId(""); setOverviewLoading(false); return }
    let cancelled = false
    setOverviewLoading(true)
    void api.getPeriodSubjectOverview(periodId).then((rows) => {
      if (!cancelled) { setOverview(rows); setOverviewPeriodId(periodId) }
    }).catch((reason: Error) => { if (!cancelled) { setOverview([]); setOverviewPeriodId(periodId); setError(reason.message) } })
      .finally(() => { if (!cancelled) setOverviewLoading(false) })
    return () => { cancelled = true }
  }, [periodId, calendarRevision])
  useEffect(() => {
    if (!selectedId) { setExceptions([]); return }
    void api.listExceptions(selectedId).then(setExceptions).catch((reason: Error) => setError(reason.message))
  }, [selectedId])
  useEffect(() => { if (selectedId) detailHeadingRef.current?.focus() }, [selectedId])

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
    if (dialog.kind === "create") return <CreateCourseDialog {...common} plans={plans.filter((plan) => planning?.plan_ids.includes(plan.id) && plan.modalidad === "SEMESTRAL")} periods={periods} defaultPeriodId={periodId} initialSubjectId={dialog.subjectId} sourceCourse={courses.find((course) => course.id === dialog.sourceCourseId)} courses={courses} teachers={teachers} onSubmit={(data) => void createCourse(data)} />
    if (dialog.kind === "confirm") return <ConfirmDialog {...common} title={dialog.title} message={dialog.message} confirmLabel={dialog.confirmLabel} onConfirm={dialog.onConfirm} />
    if (!selectedCourse) return null
    const course = selectedCourse
    switch (dialog.kind) {
      case "edit":
        return <EditCourseDialog {...common} course={course} rooms={rooms} teachers={teachers} onSubmit={(patch) => {
          if (Object.keys(patch).length === 0) { closeDialog(); return }
          void submitDialog(() => api.updateCourse(course.id, patch), "Datos del paralelo actualizados.")
        }} />
      case "add-schedule":
        return <AddScheduleDialog {...common} course={course} initial={dialog.suggested} rooms={rooms.filter((room) => room.activa)} blocks={scheduleBlocks.filter((block) => block.activo)} onSubmit={(input) => void submitDialog(
          () => api.replaceCourseSchedules(course.id, [...course.horarios.map(toScheduleInput), { ...input, aula: input.aula || null }]),
          "Horario actualizado.",
        )} />
      case "add-exception":
        return <AddExceptionDialog {...common} course={course} rooms={rooms.filter((room) => room.activa)} onSubmit={(payload) => void submitDialog(
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
        <CourseList
          periods={periods}
          periodId={periodId}
          onPeriod={setPeriodId}
          courses={courses.filter((course) => course.periodo_id === periodId).sort(courseSort)}
          allCourses={courses}
          selectedCourse={selectedCourse?.periodo_id === periodId ? selectedCourse : null}
          plans={plans}
          careers={careers}
          faculties={faculties}
          teachers={teachers}
          rooms={rooms}
          blocks={scheduleBlocks}
          planning={planning}
          planId={planId}
          onPlan={setPlanId}
          openings={openings}
          suggestions={suggestions}
          overview={overviewPeriodId === periodId ? overview : []}
          overviewLoading={overviewLoading || overviewPeriodId !== periodId}
          calendarRevision={calendarRevision}
          headingRef={headingRef}
          onCreate={() => openDialog({ kind: "create" })}
          onCreateSubject={(subjectId) => openDialog({ kind: "create", subjectId })}
          onCreateParallel={(course) => openDialog({ kind: "create", sourceCourseId: course.id })}
          onRegistration={(course) => void toggleRegistration(course)}
          onBatchRegistration={(ids, opened) => run(
            () => api.setPeriodCourseRegistration(periodId, ids, opened),
            `${ids.length} paralelo(s) con inscripción ${opened ? "abierta" : "cerrada"}.`,
          )}
          busy={busy}
          onModularCreated={reload}
          onChanged={reload}
          onAddSuggestedSchedule={(input) => openDialog({ kind: "add-schedule", suggested: input })}
          onOpen={openCourse}
          onCloseDetail={backToList}
      detail={selectedCourse && actions ? <CourseDetail embedded course={selectedCourse} rooms={rooms} exceptions={exceptions} tab={tab} headingRef={detailHeadingRef} busy={busy} onTab={setTab} onBack={backToList} actions={actions} /> : null}
        />
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
  allCourses: Course[]
  selectedCourse: Course | null
  plans: StudyPlan[]
  careers: Career[]
  faculties: Faculty[]
  teachers: User[]
  rooms: PlanningRoom[]
  blocks: ScheduleBlock[]
  planning: PeriodPlanning | null
  planId: string
  onPlan: (id: string) => void
  openings: PlanOpening[]
  suggestions: SubjectSuggestion[]
  overview: PeriodSubjectOverview[]
  overviewLoading: boolean
  calendarRevision: number
  headingRef: RefObject<HTMLHeadingElement | null>
  onCreate: () => void
  onCreateSubject: (id: string) => void
  onCreateParallel: (course: Course) => void
  onRegistration: (course: Course) => void
  onBatchRegistration: (ids: string[], opened: boolean) => Promise<boolean>
  busy: boolean
  onModularCreated: () => Promise<void>
  onChanged: () => Promise<void>
  onAddSuggestedSchedule: (input: ScheduleInput) => void
  onOpen: (id: string) => void
  onCloseDetail: () => void
  detail: ReactNode
}

function CourseList({ periods, periodId, onPeriod, courses, allCourses, selectedCourse, plans, careers, faculties, teachers, rooms, blocks, planning, planId, onPlan, openings, suggestions, overview, overviewLoading, calendarRevision, headingRef, onCreate, onCreateSubject, onCreateParallel, onRegistration, onBatchRegistration, busy, onModularCreated, onChanged, onAddSuggestedSchedule, onOpen, onCloseDetail, detail }: CourseListProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [facultyFilter, setFacultyFilter] = useState("")
  const [careerFilter, setCareerFilter] = useState("")
  const [planFilter, setPlanFilter] = useState(() => new URLSearchParams(window.location.search).get("plan_id") ?? "")
  const [teacherFilter, setTeacherFilter] = useState("")
  const [roomFilter, setRoomFilter] = useState("")
  const [parallelFilter, setParallelFilter] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [calendarFocusDate, setCalendarFocusDate] = useState("")
  const [plannerMode, setPlannerMode] = useState<"none" | "single" | "multi">("none")
  const [multiFocusPlanId, setMultiFocusPlanId] = useState("")
  const [multiFocusSubjectId, setMultiFocusSubjectId] = useState("")
  const [multiFocusCourse, setMultiFocusCourse] = useState<Course | null>(null)
  const [multiFocusToken, setMultiFocusToken] = useState(0)
  const [section, setSection] = useState<Section>(() => new URLSearchParams(window.location.search).get("plan_id") ? "offer" : "summary")
  const initialFocusPlanId = new URLSearchParams(window.location.search).get("plan_id") ?? ""
  const focusedPlanId = planning?.periodo_id === periodId && planning.plan_ids.includes(initialFocusPlanId) ? initialFocusPlanId : ""
  useEffect(() => { if (planning?.periodo_id === periodId && planFilter && !planning.plan_ids.includes(planFilter)) setPlanFilter("") }, [periodId, planning, planFilter])
  useEffect(() => { setAvailabilityOpen(false); setCalendarFocusDate(""); setPlannerMode("none"); setMultiFocusPlanId(""); setMultiFocusSubjectId(""); setMultiFocusCourse(null); setSelectedIds([]); setParallelFilter("") }, [periodId])
  useEffect(() => { setSelectedIds((current) => current.filter((id) => courses.some((course) => course.id === id && course.activo))) }, [courses])
  useEffect(() => { if (selectedCourse) setAvailabilityOpen(false) }, [selectedCourse?.id])
  function openSelectedCourse(id: string) { setAvailabilityOpen(false); onOpen(id) }
  function createAnotherParallel(course: Course) {
    if (plans.find((plan) => plan.id === course.plan_id)?.modalidad !== "MODULAR") {
      onCreateParallel(course)
      return
    }
    setSection("modular")
    onPlan(course.plan_id)
    setMultiFocusPlanId(course.plan_id)
    setMultiFocusSubjectId(course.materia_plan_id)
    setMultiFocusCourse(course)
    setMultiFocusToken((current) => current + 1)
    setPlannerMode("multi")
  }

  const counts: Record<Filter, number> = {
    all: courses.length,
    open: courses.filter((course) => course.activo && course.inscripcion_abierta).length,
    closed: courses.filter((course) => course.activo && !course.inscripcion_abierta).length,
    attention: courses.filter((course) => needsAttention(course, rooms)).length,
    inactive: courses.filter((course) => !course.activo).length,
  }
  const parallelCount = countActiveParallels(courses)
  const parallelOptions = [...new Set(courses.map((course) => course.paralelo))].sort((a, b) => a.localeCompare(b))
  const matches = (course: Course) =>
    filter === "all" ||
    (filter === "open" && course.activo && course.inscripcion_abierta) ||
    (filter === "closed" && course.activo && !course.inscripcion_abierta) ||
    (filter === "attention" && needsAttention(course, rooms)) ||
    (filter === "inactive" && !course.activo)
  const needle = query.trim().toLowerCase()
  const matchesDimensions = (course: Course) =>
    (!facultyFilter || course.facultad_id === facultyFilter) &&
    (!careerFilter || course.carrera_id === careerFilter) &&
    (!planFilter || course.plan_id === planFilter) &&
    (!teacherFilter || course.docente_id === teacherFilter) &&
    (!roomFilter || course.horarios.some((slot) => slot.aula === roomFilter)) &&
    (!parallelFilter || course.paralelo === parallelFilter)
  const visible = courses.filter((course) =>
    matches(course) && matchesDimensions(course) &&
    (!needle || `${course.materia_codigo} ${course.materia_nombre} ${course.paralelo} ${course.docente_nombre ?? ""}`.toLowerCase().includes(needle)),
  )
  const calendarCourses = courses.filter(matchesDimensions)
  const selectableVisibleIds = visible.filter((course) => course.activo).map((course) => course.id)
  const selectedCourses = courses.filter((course) => selectedIds.includes(course.id) && course.activo)
  const toOpen = selectedCourses.filter((course) => !course.inscripcion_abierta).map((course) => course.id)
  const toClose = selectedCourses.filter((course) => course.inscripcion_abierta).map((course) => course.id)
  async function applyBulk(opened: boolean) {
    const ids = opened ? toOpen : toClose
    if (ids.length && await onBatchRegistration(ids, opened)) setSelectedIds([])
  }
  const currentPeriod = periods.find((item) => item.id === periodId)
  const hasModularPlans = plans.some((item) => planning?.periodo_id === periodId && planning.plan_ids.includes(item.id) && item.modalidad === "MODULAR" && item.estado === "VIGENTE")
  const programadas = new Set(courses.filter((course) => course.activo).map((course) => course.materia_plan_id))
  const pendingSuggestions = overview.filter((row) => row.recomendada && !programadas.has(row.materia_plan_id))
  const attentionCourses = courses.filter((course) => needsAttention(course, rooms))
  const sections: { id: Section; label: string }[] = [
    { id: "summary", label: "Resumen" },
    { id: "offer", label: "Oferta" },
    { id: "parallels", label: "Oferta programada" },
    { id: "calendar", label: "Calendario" },
    ...(hasModularPlans ? [{ id: "modular" as const, label: "Modular" }] : []),
  ]
  useEffect(() => { if (section === "modular" && !hasModularPlans) setSection("summary") }, [section, hasModularPlans])

  const resourceFilters = (
    <div className="pl-calendar-filters" aria-label="Filtrar por recurso o carrera">
      <label>Facultad<select className="ui-select" value={facultyFilter} onChange={(event) => { setFacultyFilter(event.target.value); setCareerFilter(""); setPlanFilter("") }}><option value="">Todas</option>{faculties.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <label>Carrera<select className="ui-select" value={careerFilter} onChange={(event) => { setCareerFilter(event.target.value); setPlanFilter("") }}><option value="">Todas</option>{careers.filter((item) => !facultyFilter || item.facultad_id === facultyFilter).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <label>Plan<select className="ui-select" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}><option value="">Todos</option>{plans.filter((item) => planning?.plan_ids.includes(item.id) && (!careerFilter || item.carrera_id === careerFilter) && (!facultyFilter || careers.some((career) => career.id === item.carrera_id && career.facultad_id === facultyFilter))).map((item) => <option key={item.id} value={item.id}>{item.codigo}</option>)}</select></label>
      <label>Docente<select className="ui-select" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}><option value="">Todos</option>{teachers.map((item) => <option key={item.id} value={item.id}>{item.nombres} {item.apellidos}</option>)}</select></label>
      <label>Aula<select className="ui-select" value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}><option value="">Todas</option>{rooms.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo}</option>)}</select></label>
      <label>Paralelo<select className="ui-select" value={parallelFilter} onChange={(event) => setParallelFilter(event.target.value)}><option value="">Todos</option>{parallelOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
  )

  return (
    <>
      <PageHeader
        eyebrow="PLANIFICACIÓN ACADÉMICA"
        title="Oferta y paralelos"
        description="Organiza las materias que se abrirán en el semestre. En planes modulares, programa los paralelos en secuencia y revisa sus fechas de clase."
        headingRef={headingRef}
        actions={periods.length > 0 && plans.some((item) => planning?.plan_ids.includes(item.id) && item.modalidad === "SEMESTRAL") ? <button type="button" className="ui-btn ui-btn-primary" onClick={onCreate}><ButtonLabel icon="plus">Nuevo paralelo semestral</ButtonLabel></button> : undefined}
      />

      {periods.length === 0 ? (
        <EmptyState icon="layers" title="Primero registra un semestre académico">
          Los paralelos se programan dentro de un semestre. <a className="ui-btn ui-btn-primary" href="/admin/periodos" style={{ marginTop: 8 }}>Ir a Planificar semestre</a>
        </EmptyState>
      ) : (
        <>
          <PeriodBar periods={periods} periodId={periodId} onChange={onPeriod} />
          <SectionTabs sections={sections} section={section} onSection={setSection} />

          {section === "summary" && (
            <div role="tabpanel" id="pl-panel-summary" aria-labelledby="pl-section-summary" className="pl-tabpanel" tabIndex={0}>
              <dl className="pl-tiles pl-tiles--4" aria-label="Resumen de la oferta">
                <div><dt>Paralelos activos</dt><dd>{parallelCount}</dd><small>{counts.all} materias programadas</small></div>
                <div><dt>Materias con inscripción abierta</dt><dd>{counts.open}</dd></div>
                <div data-warn={counts.attention > 0 ? "" : undefined}><dt>Materias que requieren atención</dt><dd>{counts.attention}</dd></div>
                <div data-warn={pendingSuggestions.length > 0 ? "" : undefined}><dt>Materias sugeridas sin paralelo</dt><dd>{pendingSuggestions.length}</dd></div>
              </dl>

              {courses.length === 0 ? (
                <p className="ui-alert ui-alert-info">Aún no hay paralelos. Selecciona una materia del plan y programa el primero; el calendario se llenará aquí.</p>
              ) : (
                <section aria-labelledby="summary-attention-title">
                  <div className="pl-toolbar"><h2 id="summary-attention-title">Requieren atención</h2><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setSection("parallels")}>Ver paralelos</button></div>
                  {attentionCourses.length === 0 ? <p className="ui-text-muted">Todos los paralelos activos tienen docente, horario y aulas compatibles.</p> : (
                    <ul className="pl-exceptions">
                      {attentionCourses.slice(0, 6).map((course) => (
                        <li key={course.id} className="pl-exception">
                          <StatusBadge tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>{!course.activo ? "Inactivo" : course.inscripcion_abierta ? "Abierto" : "Cerrado"}</StatusBadge>
                          <div className="pl-exception-text">
                            <strong>{course.materia_codigo} · {course.paralelo}</strong>
                            <span>{course.materia_nombre} · {course.carrera_nombre} · {course.plan_codigo}</span>
                            <span className="pl-warn">{attentionReason(course, rooms)}</span>
                          </div>
                          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => openSelectedCourse(course.id)}>Gestionar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section aria-labelledby="summary-suggestions-title">
                <div className="pl-toolbar"><h2 id="summary-suggestions-title">Sugeridas sin paralelo</h2><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setSection("offer")}>Ver oferta</button></div>
                {overviewLoading ? <p role="status">Cargando materias del semestre…</p> : pendingSuggestions.length === 0 ? <p className="ui-text-muted">No hay materias sugeridas pendientes de programar.</p> : (
                  <ul className="pl-exceptions">
                    {pendingSuggestions.slice(0, 6).map((row) => (
                      <li key={row.materia_plan_id} className="pl-exception">
                        <div className="pl-exception-text">
                          <strong>Semestre {row.semestre_numero} · {row.codigo} {row.nombre}</strong>
                          <span>{row.carrera_nombre} · {row.plan_codigo} · {row.aptos} aptos · {row.repetidores} repiten</span>
                        </div>
                        {row.plan_modalidad === "MODULAR"
                          ? <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => { setSection("modular"); onPlan(row.plan_id); setMultiFocusPlanId(row.plan_id); setMultiFocusSubjectId(row.materia_plan_id); setMultiFocusCourse(null); setMultiFocusToken((current) => current + 1); setPlannerMode("multi") }}>Programar secuencia</button>
                          : <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => onCreateSubject(row.materia_plan_id)}>Crear paralelo</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="pl-plan-setup-actions">
                <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setSection("offer")}>Programar oferta</button>
                <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setSection("calendar")}>Ver calendario</button>
                <button type="button" className="ui-btn ui-btn-secondary" onClick={() => { setFilter("attention"); setSection("parallels") }}>Revisar atención</button>
              </div>
            </div>
          )}

          {section === "offer" && (
            <div role="tabpanel" id="pl-panel-offer" aria-labelledby="pl-section-offer" className="pl-tabpanel" tabIndex={0}>
              <PeriodOfferOverview key={`${periodId}-${focusedPlanId}`} rows={overview} courses={courses} loading={overviewLoading} openings={openings} initialPlanId={focusedPlanId} initialGroupId={new URLSearchParams(window.location.search).get("apertura_plan_id") ?? ""} onPlan={onPlan} onCreateSubject={onCreateSubject} onModularPlan={(id, subjectId) => { onPlan(id); setMultiFocusPlanId(id); setMultiFocusSubjectId(subjectId); setMultiFocusCourse(null); setMultiFocusToken((current) => current + 1); setPlannerMode("multi"); setSection("modular") }} />
            </div>
          )}

          {section === "parallels" && (
            <div role="tabpanel" id="pl-panel-parallels" aria-labelledby="pl-section-parallels" className="pl-tabpanel" tabIndex={0}>
              {courses.length === 0 ? (
                <p className="ui-alert ui-alert-info">Aún no hay paralelos. Selecciona una materia del plan y programa el primero; el calendario se llenará aquí.</p>
              ) : (
                <>
                  <div className="pl-auth-bar">
                    <div className="pl-segment" role="group" aria-label="Filtrar materias programadas">
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
                  {resourceFilters}
                  <p className="ui-text-muted">Cada fila es una materia dentro de un paralelo. Hay {parallelCount} paralelo(s) activo(s) y {courses.length} materia(s) programada(s) en el semestre. «Abrir inscripción» permite recibir estudiantes; la habilitación individual se gestiona por separado.</p>
                  <div className="pl-bulk-registration" role="group" aria-label="Inscripciones de paralelos seleccionados">
                    <span>{selectedIds.length} seleccionado(s)</span>
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || toOpen.length === 0} onClick={() => void applyBulk(true)}>Abrir {toOpen.length} inscripción(es)</button>
                    <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || toClose.length === 0} onClick={() => void applyBulk(false)}>Cerrar {toClose.length} inscripción(es)</button>
                    {selectedIds.length > 0 && <button type="button" className="ui-link-button" onClick={() => setSelectedIds([])}>Limpiar selección</button>}
                  </div>
                  {visible.length === 0 ? (
                    <EmptyState icon="search" title="Ningún paralelo coincide con el filtro" />
                  ) : (
                    <div className="pl-table-scroll"><table className="pl-data-table pl-course-table"><caption>Oferta programada del semestre ({visible.length} materias en paralelos)</caption><thead><tr><th scope="col"><input type="checkbox" aria-label="Seleccionar paralelos visibles" checked={selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.includes(id))} disabled={busy || selectableVisibleIds.length === 0} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...selectableVisibleIds])] : current.filter((id) => !selectableVisibleIds.includes(id)))} /></th><th scope="col">Materia y paralelo</th><th scope="col">Carrera · plan</th><th scope="col">Fechas</th><th scope="col">Docente</th><th scope="col">Aula y horario</th><th scope="col">Cupo</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>{visible.map((course) => <Fragment key={course.id}><tr>
                      <td><input type="checkbox" aria-label={`Seleccionar paralelo ${course.paralelo} de ${course.materia_codigo}`} checked={selectedIds.includes(course.id)} disabled={busy || !course.activo} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, course.id] : current.filter((id) => id !== course.id))} /></td>
                      <td><strong>{course.materia_codigo} · {course.paralelo}</strong><small className="pl-table-secondary">{course.materia_nombre}</small></td>
                      <td>{course.carrera_nombre}<small className="pl-table-secondary">{course.plan_codigo}{course.turno_modular ? ` · ${course.turno_modular.toLowerCase()}` : ""}</small></td>
                      <td>{formatDate(course.fecha_inicio)}<small className="pl-table-secondary">hasta {formatDate(course.fecha_fin)}</small></td>
                      <td>{course.docente_nombre ?? <span className="pl-warn">Sin docente</span>}</td>
                      <td>{course.horarios.length ? scheduleSummary(course) : <span className="pl-warn">Sin horario</span>}<small className="pl-table-secondary">{[...new Set(course.horarios.map((slot) => slot.aula).filter(Boolean))].join(", ") || "Sin aula"}</small></td>
                      <td>{course.cupo}</td>
                      <td><StatusBadge tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>{!course.activo ? "Inactivo" : course.inscripcion_abierta ? "Abierto" : "Cerrado"}</StatusBadge>{needsAttention(course, rooms) && <small className="pl-table-secondary pl-warn">Requiere atención{courseRoomIssue(course, rooms) ? `: ${courseRoomIssue(course, rooms)}` : ""}</small>}</td>
                      <td><div className="pl-table-actions">
                        {course.activo && <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => onRegistration(course)}>{course.inscripcion_abierta ? "Cerrar inscripción" : "Abrir inscripción"}</button>}
                        <button type="button" className="ui-btn ui-btn-quiet ui-btn-sm" aria-label={`${selectedCourse?.id === course.id ? "Ocultar" : "Ver"} detalles del paralelo ${course.paralelo} de ${course.materia_codigo}`} aria-expanded={selectedCourse?.id === course.id} onClick={() => selectedCourse?.id === course.id ? onCloseDetail() : openSelectedCourse(course.id)}><Icon name="eye" size={15} /> {selectedCourse?.id === course.id ? "Ocultar" : "Ver"}</button>
                        <button type="button" className="ui-btn ui-btn-quiet ui-btn-sm" onClick={() => createAnotherParallel(course)}><Icon name="plus" size={15} /> Otro paralelo</button>
                      </div></td>
                    </tr>{selectedCourse?.id === course.id && <tr className="pl-inline-course-detail"><td colSpan={9}><div className="pl-inline-course-detail-head"><strong>Detalles de {course.materia_codigo} · {course.paralelo}</strong><button type="button" className="ui-link-button" onClick={onCloseDetail}>Cerrar detalles</button></div>{detail}</td></tr>}</Fragment>)}</tbody></table></div>
                  )}
                </>
              )}
            </div>
          )}

          {section === "calendar" && (
            <div role="tabpanel" id="pl-panel-calendar" aria-labelledby="pl-section-calendar" className="pl-tabpanel" tabIndex={0}>
              {courses.length === 0 ? (
                <p className="ui-alert ui-alert-info">Aún no hay paralelos. Selecciona una materia del plan y programa el primero; el calendario se llenará aquí.</p>
              ) : (
                <>
                  {resourceFilters}
                  {currentPeriod && <PeriodWeekCalendar key={periodId} period={currentPeriod} courses={calendarCourses} revision={calendarRevision} focusDate={calendarFocusDate} onOpen={openSelectedCourse} onAvailability={() => setAvailabilityOpen(true)} />}
                </>
              )}
            </div>
          )}

          {section === "modular" && hasModularPlans && (
            <div role="tabpanel" id="pl-panel-modular" aria-labelledby="pl-section-modular" className="pl-tabpanel" tabIndex={0}>
              <div className="pl-planner-mode" role="group" aria-label="Programación modular"><strong>Programación modular</strong><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" aria-pressed={plannerMode === "multi"} onClick={() => { setMultiFocusPlanId(""); setMultiFocusSubjectId(""); setMultiFocusCourse(null); setPlannerMode("multi") }}>Varias carreras</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" aria-pressed={plannerMode === "single"} onClick={() => { const first = plans.find((item) => planning?.plan_ids.includes(item.id) && item.modalidad === "MODULAR"); if (first && plans.find((item) => item.id === planId)?.modalidad !== "MODULAR") onPlan(first.id); setPlannerMode("single") }}>Un plan</button>{plannerMode !== "none" && <button type="button" className="ui-btn ui-btn-quiet ui-btn-sm" onClick={() => setPlannerMode("none")}>Ocultar editor</button>}</div>
              {plannerMode === "none" && <p className="ui-text-muted">Elige «Varias carreras» o «Un plan» para programar secuencias modulares.</p>}
              {plannerMode === "multi" && planning?.periodo_id === periodId && currentPeriod && <MultiModularPlanner key={periodId} period={currentPeriod} planning={planning} plans={plans} overview={overview} courses={courses} teachers={teachers} rooms={rooms} blocks={blocks} focusPlanId={multiFocusPlanId} focusSubjectId={multiFocusSubjectId} focusCourse={multiFocusCourse} focusToken={multiFocusToken} onCreated={onModularCreated} />}
              {plannerMode === "single" && planning?.periodo_id === periodId && plans.find((item) => item.id === planId)?.modalidad === "MODULAR" && currentPeriod && <ModularPlanner period={currentPeriod} plans={plans} planning={planning} planId={planId} onPlan={onPlan} openings={openings} suggestions={suggestions} teachers={teachers} rooms={rooms} blocks={blocks} courses={courses} onCreated={onModularCreated} />}
            </div>
          )}

          {selectedCourse && section !== "parallels" && !availabilityOpen && detail && (
            <Drawer
              title={`${selectedCourse.materia_codigo} · Paralelo ${selectedCourse.paralelo}`}
              description={`${selectedCourse.materia_nombre} · ${selectedCourse.plan_codigo} · ${selectedCourse.periodo_denominacion}`}
              onClose={onCloseDetail}
            >
              <div className="pl-drawer-detail">{detail}</div>
            </Drawer>
          )}

          {availabilityOpen && currentPeriod && (
            <Drawer
              title="Disponibilidad de docentes y aulas"
              description="Consulta orientativa para una fecha y franja; el servidor vuelve a validar cada cambio al guardar."
              onClose={() => setAvailabilityOpen(false)}
            >
              <AvailabilityPanel embedded key={periodId} period={currentPeriod} courses={allCourses} teachers={teachers} rooms={rooms} blocks={blocks} selectedCourse={selectedCourse} revision={calendarRevision} onChanged={onChanged} onOpenCourse={openSelectedCourse} onClose={() => setAvailabilityOpen(false)} onReturnToCourse={() => setAvailabilityOpen(false)} onAddSchedule={onAddSuggestedSchedule} onDateChange={setCalendarFocusDate} />
            </Drawer>
          )}
        </>
      )}
    </>
  )
}

function SectionTabs({ sections, section, onSection }: { sections: { id: Section; label: string }[]; section: Section; onSection: (section: Section) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = sections.findIndex((item) => item.id === section)
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % sections.length
    else if (event.key === "ArrowLeft") next = (index - 1 + sections.length) % sections.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = sections.length - 1
    else return
    event.preventDefault()
    onSection(sections[next].id)
    document.getElementById(`pl-section-${sections[next].id}`)?.focus()
  }
  return (
    <div className="pl-tabs" role="tablist" aria-label="Secciones de la planificación" onKeyDown={onKeyDown}>
      {sections.map((item) => (
        <button key={item.id} type="button" role="tab" id={`pl-section-${item.id}`} className="pl-tab" aria-selected={section === item.id} aria-controls={`pl-panel-${item.id}`} tabIndex={section === item.id ? 0 : -1} onClick={() => onSection(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
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

function CourseDetail({ course, rooms, exceptions, tab, headingRef, busy, onTab, onBack, actions, embedded = false }: {
  course: Course
  rooms: PlanningRoom[]
  exceptions: ScheduleException[]
  tab: TabId
  headingRef: RefObject<HTMLHeadingElement | null>
  busy: boolean
  onTab: (tab: TabId) => void
  onBack: () => void
  actions: CourseActions
  /** Oculta migas y encabezado visible cuando se muestra dentro de un Drawer. */
  embedded?: boolean
}) {
  const checks = [
    { ok: Boolean(course.docente_id), good: `Docente asignado: ${course.docente_nombre ?? ""}`, bad: "Falta asignar un docente" },
    { ok: course.horarios.length > 0, good: `Horario definido (${plural(course.horarios.length, "franja", "franjas")} por semana)`, bad: "Falta definir el horario semanal" },
    { ok: course.horarios.length > 0 && !courseRoomIssue(course, rooms), good: "Aulas asignadas con cupo compatible", bad: courseRoomIssue(course, rooms) || "Falta asignar aula al horario" },
    { ok: course.plan_estado === "VIGENTE", good: `Plan ${course.plan_codigo} vigente`, bad: `El plan ${course.plan_codigo} no está vigente` },
  ]
  const counts: Record<TabId, number> = { schedule: course.horarios.length, exceptions: exceptions.length }

  return (
    <>
      {!embedded && <nav className="pl-breadcrumb" aria-label="Ruta de navegación">
        <ol>
          <li><button type="button" className="ui-link-button" onClick={onBack}><Icon name="back" size={14} />Oferta y paralelos</button></li>
          <li aria-current="page">{course.materia_codigo} · {course.paralelo}</li>
        </ol>
      </nav>}

      <div className="pl-hero" data-tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>
        <div className="pl-hero-main">
          <div className="pl-badges">
            <StatusBadge tone={!course.activo ? "gray" : course.inscripcion_abierta ? "green" : "amber"}>
              {!course.activo ? "Inactivo" : course.inscripcion_abierta ? "Inscripción abierta" : "Inscripción cerrada"}
            </StatusBadge>
            <span className="pl-parallel">Paralelo {course.paralelo}</span>
          </div>
          <h1 ref={headingRef} tabIndex={-1} className={embedded ? "ui-visually-hidden" : "ui-heading-focus"}>{course.materia_codigo} — {course.materia_nombre}</h1>
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

function CreateCourseDialog({ plans, periods, defaultPeriodId, initialSubjectId, sourceCourse, courses, teachers, busy, error, onClose, onSubmit }: DialogBase & {
  plans: StudyPlan[]
  periods: AcademicPeriod[]
  defaultPeriodId: string
  initialSubjectId?: string
  sourceCourse?: Course
  courses: Course[]
  teachers: User[]
  onSubmit: (data: Parameters<typeof api.createCourse>[0]) => void
}) {
  const vigentPlans = plans.filter((plan) => plan.estado === "VIGENTE")
  const allowedSubjects = vigentPlans.flatMap((plan) => plan.unidades.flatMap((unit) => unit.materias))
  const preferredSubjectId = sourceCourse?.materia_plan_id ?? initialSubjectId
  const firstSubject = allowedSubjects.some((subject) => subject.id === preferredSubjectId) ? preferredSubjectId! : allowedSubjects[0]?.id ?? ""
  const [subjectId, setSubjectId] = useState(firstSubject)
  const periodId = defaultPeriodId
  const [parallel, setParallel] = useState("")
  const [parallelTouched, setParallelTouched] = useState(false)
  const [capacity, setCapacity] = useState(String(sourceCourse?.cupo ?? 30))
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
  const selectedPlan = vigentPlans.find((plan) => plan.unidades.some((unit) => unit.materias.some((subject) => subject.id === subjectId)))
  // Valores sugeridos: se usan mientras la persona no los haya escrito ella misma.
  const shownParallel = parallelTouched ? parallel : nextParallelLetter(courses, subjectId, periodId)
  const shownStart = datesTouched ? start : sourceCourse?.fecha_inicio ?? (selectedPlan?.modalidad === "MODULAR" ? "" : period?.fecha_inicio ?? "")
  const shownEnd = datesTouched ? end : sourceCourse?.fecha_fin ?? (selectedPlan?.modalidad === "MODULAR" ? "" : period?.fecha_fin ?? "")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      paralelo: messageOf(codeSchema, shownParallel),
      cupo: messageOf(positiveIntSchema, Number(capacity)),
      fecha_inicio: messageOf(dateSchema, shownStart),
      fecha_fin: messageOf(dateSchema, shownEnd) ?? (shownStart && shownEnd < shownStart ? "La fecha de fin no puede ser anterior al inicio." : null),
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    onSubmit({
      materia_plan_id: subjectId, periodo_id: periodId, paralelo: shownParallel.trim().toUpperCase(), cupo: Number(capacity),
      fecha_inicio: shownStart, fecha_fin: shownEnd, ...(teacherId ? { docente_id: teacherId } : {}),
    })
  }

  return (
    <Modal title={sourceCourse ? `Otro paralelo de ${sourceCourse.materia_codigo}` : "Nuevo paralelo"} description="Se crea con inscripción cerrada. Después podrás agregar su horario y abrirla. Los campos se sugieren automáticamente." onClose={onClose} locked={busy}>
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
        <p className="pl-lead">Semestre académico: <strong>{period?.denominacion}</strong></p>
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
        <p className="ui-field-hint" style={{ marginTop: -8 }}>{selectedPlan?.modalidad === "MODULAR" ? "Indica las fechas del módulo dentro del semestre académico." : "Se sugieren las fechas completas del semestre académico."}</p>
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

function EditCourseDialog({ course, rooms, teachers, busy, error, onClose, onSubmit }: DialogBase & { course: Course; rooms: PlanningRoom[]; teachers: User[]; onSubmit: (patch: CoursePatch) => void }) {
  const [parallel, setParallel] = useState(course.paralelo)
  const [capacity, setCapacity] = useState(String(course.cupo))
  const [start, setStart] = useState(course.fecha_inicio)
  const [end, setEnd] = useState(course.fecha_fin)
  const [teacherId, setTeacherId] = useState(course.docente_id ?? "")
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [conflictCheck, setConflictCheck] = useState("")
  const checkSequence = useRef(0)
  const capacityIssue = course.horarios.map((slot) => roomCapacityIssue(Number(capacity), slot.aula, rooms)).find(Boolean) ?? ""

  useEffect(() => {
    if (!start || !end || end < start || !Number(capacity)) { setConflictCheck(""); return }
    const sequence = ++checkSequence.current
    setConflictCheck("Comprobando fechas, docente, aula y estudiantes inscritos…")
    const timer = window.setTimeout(() => {
      void api.previewCourseUpdate(course.id, {
        paralelo: parallel.trim().toUpperCase(), cupo: Number(capacity),
        fecha_inicio: start, fecha_fin: end, docente_id: teacherId || null,
      }).then(() => {
        if (sequence === checkSequence.current) setConflictCheck("Sin cruces detectados para esta configuración.")
      }).catch((reason: Error) => {
        if (sequence === checkSequence.current) setConflictCheck(reason.message)
      })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [course.id, parallel, capacity, start, end, teacherId])

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
        {capacityIssue && <p className="ui-alert ui-alert-error">{capacityIssue}</p>}
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
        {conflictCheck && <p className="ui-field-hint" role="status">{conflictCheck}</p>}
        <FormActions busy={busy} onClose={onClose} submitLabel="Guardar cambios" icon="check" />
      </form>
    </Modal>
  )
}

function AddScheduleDialog({ busy, error, onClose, course, initial, rooms, blocks, onSubmit }: DialogBase & { course: Course; initial?: ScheduleInput; rooms: PlanningRoom[]; blocks: ScheduleBlock[]; onSubmit: (input: ScheduleInput) => void }) {
  const [day, setDay] = useState<Weekday>(initial?.dia_semana ?? "LUNES")
  const [from, setFrom] = useState(initial?.hora_inicio ?? "08:00")
  const [to, setTo] = useState(initial?.hora_fin ?? "10:00")
  const [room, setRoom] = useState(initial?.aula ?? "")
  const [blockId, setBlockId] = useState("")
  const [localError, setLocalError] = useState("")
  const [conflictCheck, setConflictCheck] = useState("")
  const checkSequence = useRef(0)
  const capacityIssue = room ? roomCapacityIssue(course.cupo, room, rooms) : course.inscripcion_abierta ? "Cada horario de un paralelo abierto necesita aula" : ""

  useEffect(() => {
    if (!from || !to || to <= from) { setConflictCheck(""); return }
    const sequence = ++checkSequence.current
    setConflictCheck("Comprobando disponibilidad de docente, aula e inscripciones…")
    const timer = window.setTimeout(() => {
      const candidate: ScheduleInput = { dia_semana: day, hora_inicio: from, hora_fin: to, aula: room || null }
      void api.validateCourseSchedules(course.id, [...course.horarios.map(toScheduleInput), candidate])
        .then(() => { if (sequence === checkSequence.current) setConflictCheck("Sin cruces detectados para las fechas de clase del paralelo.") })
        .catch((reason: Error) => { if (sequence === checkSequence.current) setConflictCheck(reason.message) })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [course, day, from, to, room])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = capacityIssue || messageOf(timeSchema, from) || messageOf(timeSchema, to) || (to <= from ? "La hora de fin debe ser posterior a la hora de inicio." : null)
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
        <Field id="slot-block" label="Franja de turno (opcional)" hint="Puedes ajustar las horas manualmente después de elegirla.">
          <select id="slot-block" className="ui-select" value={blockId} onChange={(event) => { const selected = blocks.find((block) => block.id === event.target.value); setBlockId(event.target.value); if (selected) { setFrom(selected.hora_inicio.slice(0, 5)); setTo(selected.hora_fin.slice(0, 5)) } }}>
            <option value="">Elegir horas manualmente</option>
            {blocks.map((block) => <option key={block.id} value={block.id}>{block.turno === "MANANA" ? "Mañana" : block.turno.charAt(0) + block.turno.slice(1).toLowerCase()} · {block.nombre} ({block.hora_inicio.slice(0, 5)}–{block.hora_fin.slice(0, 5)})</option>)}
          </select>
        </Field>
        <Field id="slot-room" label="Aula (opcional)">
          <select id="slot-room" className="ui-select" value={room} onChange={(event) => setRoom(event.target.value)}>
            <option value="">Sin aula asignada</option>
            {rooms.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo} · {item.capacidad === null ? "capacidad pendiente" : `${item.capacidad} asientos`}</option>)}
          </select>
        </Field>
        {capacityIssue && <p className="ui-alert ui-alert-error">{capacityIssue}</p>}
        {conflictCheck && <p className="ui-field-hint" role="status">{conflictCheck}</p>}
        <FormActions busy={busy} onClose={onClose} submitLabel="Agregar horario" icon="plus" />
      </form>
    </Modal>
  )
}

function AddExceptionDialog({ course, busy, error, onClose, rooms, onSubmit }: DialogBase & { course: Course; rooms: PlanningRoom[]; onSubmit: (payload: ExceptionPayload) => void }) {
  const [original, setOriginal] = useState("")
  const [type, setType] = useState<ScheduleExceptionType>("CANCELADA")
  const [newDate, setNewDate] = useState("")
  const [from, setFrom] = useState("08:00")
  const [to, setTo] = useState("10:00")
  const [reason, setReason] = useState("")
  const [room, setRoom] = useState("")
  const [localError, setLocalError] = useState("")
  const capacityIssue = type === "REPROGRAMADA" && room ? roomCapacityIssue(course.cupo, room, rooms) : ""

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = capacityIssue || messageOf(dateSchema, original) || (type === "REPROGRAMADA"
      ? messageOf(dateSchema, newDate) ?? messageOf(timeSchema, from) ?? messageOf(timeSchema, to) ?? (to <= from ? "La hora de fin debe ser posterior a la hora de inicio." : null)
      : null)
    if (invalid) { setLocalError(invalid); return }
    setLocalError("")
    onSubmit(type === "CANCELADA"
      ? { fecha_original: original, tipo: type, motivo: reason.trim() || undefined }
      : { fecha_original: original, tipo: type, fecha_reprogramada: newDate, hora_inicio: from, hora_fin: to, aula: room || undefined, motivo: reason.trim() || undefined })
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
            <Field id="exc-room" label="Aula para la reprogramación (opcional)" hint="Si no eliges aula, se usará la del horario original cuando sea única."><select id="exc-room" className="ui-select" value={room} onChange={(event) => setRoom(event.target.value)}><option value="">Usar aula original</option>{rooms.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo} · {item.capacidad === null ? "capacidad pendiente" : `${item.capacidad} asientos`}</option>)}</select></Field>
            {capacityIssue && <p className="ui-alert ui-alert-error">{capacityIssue}</p>}
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
