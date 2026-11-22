import { useEffect, useRef, useState } from "react"
import type { FormEvent, ReactNode, RefObject } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, Course, Holiday, StudentAuthorization } from "../../api/client"
import { Icon } from "../shared/icons"
import { Modal } from "../shared/Modal"
import { ButtonLabel, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { PlanningShell } from "../planning/PlanningShell"
import { PERIOD_STATE_LABEL, PERIOD_STATE_TONE, dayOfMonth, daysBetween, formatDate, formatDateWithWeekday, monthShort, periodState, plural, sortPeriods } from "../planning/dates"
import type { Tone } from "../planning/dates"
import { syncPeriodParam } from "../planning/usePeriodSelection"

type Dialog = { kind: "new-period" } | { kind: "new-holiday" }

/* ------------------------------------------------------------------ */
/* Página (contenedor)                                                 */
/* ------------------------------------------------------------------ */

export function PeriodsPage() {
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get("periodo_id") ?? "")
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [authorizations, setAuthorizations] = useState<StudentAuthorization[]>([])
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [dialogError, setDialogError] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const selected = periods.find((period) => period.id === selectedId) ?? null

  async function reload() {
    const [periodData, courseData] = await Promise.all([api.listPeriods(), api.listCourses()])
    setPeriods(sortPeriods(periodData))
    setCourses(courseData)
    setSelectedId((current) => (periodData.some((period) => period.id === current) ? current : ""))
  }
  async function loadDetail(id: string) {
    const [holidayData, authorizationData] = await Promise.all([api.listHolidays(id), api.listAuthorizations(id)])
    setHolidays(holidayData)
    setAuthorizations(authorizationData)
  }

  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (!selectedId) { setHolidays([]); setAuthorizations([]); return }
    void loadDetail(selectedId).catch((reason: Error) => setError(reason.message))
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
      if (selectedId) await loadDetail(selectedId)
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

  function openDialog(next: Dialog) { setDialogError(""); setDialog(next) }
  function closeDialog() { setDialog(null); setDialogError("") }
  function openPeriod(id: string) { setError(""); setNotice(""); setSelectedId(id); syncPeriodParam(id) }
  function backToList() { setError(""); setNotice(""); setSelectedId(""); syncPeriodParam("") }

  async function createPeriod(data: { denominacion: string; fecha_inicio: string; fecha_fin: string }) {
    let createdId = ""
    const ok = await run(async () => { createdId = (await api.createPeriod(data)).id }, `Semestre ${data.denominacion} creado. Siguiente paso: programa su oferta de paralelos.`, "dialog")
    // No se usa openPeriod(): limpiaría el aviso "Siguiente paso" que acaba de mostrarse.
    if (ok) { closeDialog(); setSelectedId(createdId); syncPeriodParam(createdId) }
  }

  async function createHoliday(data: { fecha: string; descripcion: string }) {
    if (!selected) return
    if (await run(() => api.createHoliday(selected.id, data), "Feriado registrado: se excluye de las clases de todos los paralelos del semestre.", "dialog")) closeDialog()
  }

  if (loading) return <PlanningShell current="periodos"><p className="cat-loading" role="status">Cargando semestres…</p></PlanningShell>

  return (
    <PlanningShell current="periodos" periodId={selected?.id}>
      <Notices notice={notice} error={error} />
      {selected ? (
        <PeriodDetail
          period={selected}
          courses={courses.filter((course) => course.periodo_id === selected.id)}
          holidays={holidays}
          authorizations={authorizations}
          headingRef={headingRef}
          busy={busy}
          onBack={backToList}
          onNewHoliday={() => openDialog({ kind: "new-holiday" })}
          onRemoveHoliday={(holiday) => void run(() => api.deleteHoliday(selected.id, holiday.id), `Feriado del ${formatDate(holiday.fecha)} quitado.`)}
        />
      ) : (
        <PeriodList periods={periods} courses={courses} headingRef={headingRef} onNew={() => openDialog({ kind: "new-period" })} onOpen={openPeriod} />
      )}

      {dialog?.kind === "new-period" && <NewPeriodDialog busy={busy} error={dialogError} onClose={closeDialog} onSubmit={(data) => void createPeriod(data)} />}
      {dialog?.kind === "new-holiday" && selected && <NewHolidayDialog period={selected} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={(data) => void createHoliday(data)} />}
    </PlanningShell>
  )
}

/* ------------------------------------------------------------------ */
/* Vista 1: lista de semestres                                         */
/* ------------------------------------------------------------------ */

function PeriodList({ periods, courses, headingRef, onNew, onOpen }: {
  periods: AcademicPeriod[]
  courses: Course[]
  headingRef: RefObject<HTMLHeadingElement | null>
  onNew: () => void
  onOpen: (id: string) => void
}) {
  return (
    <>
      <PageHeader
        eyebrow="PLANIFICACIÓN ACADÉMICA"
        title="Planificar semestre"
        description="El semestre académico es el ciclo común de oferta e inscripción, tanto para planes semestrales como modulares. No es lo mismo que el semestre curricular, que ubica una materia dentro de un plan."
        headingRef={headingRef}
        actions={<button type="button" className="ui-btn ui-btn-primary" onClick={onNew}><ButtonLabel icon="plus">Nuevo semestre</ButtonLabel></button>}
      />

      {periods.length === 0 ? (
        <EmptyState icon="layers" title="Aún no hay semestres académicos">
          Crea el primero con «Nuevo semestre». Después podrás cargar su calendario, programar la oferta de paralelos y habilitar a los estudiantes.
        </EmptyState>
      ) : (
        <ul className="pl-grid">
          {periods.map((period) => {
            const state = periodState(period)
            const own = courses.filter((course) => course.periodo_id === period.id)
            return (
              <li key={period.id}>
                <article className="pl-card" data-tone={PERIOD_STATE_TONE[state]}>
                  <div className="pl-card-top">
                    <StatusBadge tone={PERIOD_STATE_TONE[state]}>{PERIOD_STATE_LABEL[state]}</StatusBadge>
                    <span className="pl-card-meta">{plural(daysBetween(period.fecha_inicio, period.fecha_fin), "día", "días")}</span>
                  </div>
                  <h3>{period.denominacion}</h3>
                  <p className="pl-card-dates">{formatDate(period.fecha_inicio)} – {formatDate(period.fecha_fin)}</p>
                  <dl className="pl-mini-stats">
                    <div><dt>Paralelos</dt><dd>{own.length}</dd></div>
                    <div><dt>Con inscripción abierta</dt><dd>{own.filter((course) => course.inscripcion_abierta).length}</dd></div>
                  </dl>
                  <button type="button" className="ui-btn ui-btn-secondary" aria-label={`Abrir semestre ${period.denominacion}`} onClick={() => onOpen(period.id)}><ButtonLabel icon="arrow">Abrir semestre</ButtonLabel></button>
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
/* Vista 2: detalle de un semestre (avance del flujo + calendario)     */
/* ------------------------------------------------------------------ */

interface Step { title: string; metric: string; hint: string; tone: Tone; badge: string; action: ReactNode }

function PeriodDetail({ period, courses, holidays, authorizations, headingRef, busy, onBack, onNewHoliday, onRemoveHoliday }: {
  period: AcademicPeriod
  courses: Course[]
  holidays: Holiday[]
  authorizations: StudentAuthorization[]
  headingRef: RefObject<HTMLHeadingElement | null>
  busy: boolean
  onBack: () => void
  onNewHoliday: () => void
  onRemoveHoliday: (holiday: Holiday) => void
}) {
  const state = periodState(period)
  const open = courses.filter((course) => course.inscripcion_abierta).length
  const enabled = authorizations.filter((item) => item.habilitada).length
  const sortedHolidays = [...holidays].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const offerTone: Tone = courses.length === 0 ? "amber" : open > 0 ? "green" : "gray"
  const authTone: Tone = authorizations.length === 0 ? "gray" : enabled > 0 ? "green" : "amber"
  // El primer paso con trabajo pendiente se destaca como "siguiente paso".
  const nextIndex = courses.length === 0 ? 1 : authorizations.length > 0 && enabled === 0 ? 2 : -1

  const steps: Step[] = [
    {
      title: "Calendario", metric: plural(holidays.length, "feriado registrado", "feriados registrados"), hint: "Los feriados excluyen las clases de todos los paralelos.",
      tone: "green", badge: "Definido",
      action: <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onNewHoliday}><ButtonLabel icon="plus">Agregar feriado</ButtonLabel></button>,
    },
    {
      title: "Oferta de paralelos", metric: `${plural(courses.length, "paralelo", "paralelos")} · ${plural(open, "abierto", "abiertos")}`, hint: "Crea paralelos con docente, cupo y horario.",
      tone: offerTone, badge: courses.length === 0 ? "Pendiente" : open > 0 ? "En marcha" : "En preparación",
      action: <a className={`ui-btn ui-btn-sm ${nextIndex === 1 ? "ui-btn-primary" : "ui-btn-secondary"}`} href={`/admin/paralelos?periodo_id=${period.id}`}><ButtonLabel icon="arrow">Programar oferta</ButtonLabel></a>,
    },
    {
      title: "Habilitaciones", metric: authorizations.length === 0 ? "Sin estudiantes registrados" : `${enabled} de ${authorizations.length} habilitados`, hint: "Autoriza a cada estudiante a inscribirse en este semestre.",
      tone: authTone, badge: authorizations.length === 0 ? "Sin estudiantes" : enabled > 0 ? "En marcha" : "Pendiente",
      action: <a className={`ui-btn ui-btn-sm ${nextIndex === 2 ? "ui-btn-primary" : "ui-btn-secondary"}`} href={`/admin/habilitaciones?periodo_id=${period.id}`}><ButtonLabel icon="arrow">Habilitar estudiantes</ButtonLabel></a>,
    },
  ]

  return (
    <>
      <nav className="pl-breadcrumb" aria-label="Ruta de navegación">
        <ol>
          <li><button type="button" className="ui-link-button" onClick={onBack}><Icon name="back" size={14} />Semestres académicos</button></li>
          <li aria-current="page">{period.denominacion}</li>
        </ol>
      </nav>

      <div className="pl-hero" data-tone={PERIOD_STATE_TONE[state]}>
        <div className="pl-hero-main">
          <StatusBadge tone={PERIOD_STATE_TONE[state]}>{PERIOD_STATE_LABEL[state]}</StatusBadge>
          <h1 ref={headingRef} tabIndex={-1} className="ui-heading-focus">Semestre {period.denominacion}</h1>
          <p className="pl-hero-sub">{formatDate(period.fecha_inicio)} – {formatDate(period.fecha_fin)} · {plural(daysBetween(period.fecha_inicio, period.fecha_fin), "día", "días")}</p>
        </div>
      </div>

      <section className="pl-section" aria-labelledby="steps-title">
        <h2 id="steps-title">Preparación del semestre</h2>
        <p className="pl-lead">Sigue los pasos en orden. El paso destacado en verde es el siguiente con trabajo pendiente.</p>
        <ol className="pl-steps">
          {steps.map((step, index) => (
            <li key={step.title} className="pl-step" data-next={index === nextIndex ? "" : undefined}>
              <span className="pl-step-n" aria-hidden="true">{index + 1}</span>
              <div className="pl-step-body">
                <div className="pl-step-head"><h3>{step.title}</h3><StatusBadge tone={step.tone}>{step.badge}</StatusBadge></div>
                <p className="pl-step-metric">{step.metric}</p>
                <p className="pl-step-hint">{step.hint}</p>
                <div>{step.action}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pl-section" aria-labelledby="calendar-title">
        <div className="pl-toolbar">
          <h2 id="calendar-title">Calendario del semestre</h2>
          <button type="button" className="ui-btn ui-btn-primary" onClick={onNewHoliday}><ButtonLabel icon="plus">Agregar feriado</ButtonLabel></button>
        </div>
        <p className="pl-lead">Los feriados excluyen las clases recurrentes de todos los paralelos de este semestre.</p>
        {sortedHolidays.length === 0 ? (
          <EmptyState icon="layers" title="No hay feriados registrados">Si hay fechas sin clases dentro del semestre, regístralas con «Agregar feriado».</EmptyState>
        ) : (
          <ul className="pl-holidays">
            {sortedHolidays.map((holiday) => (
              <li key={holiday.id} className="pl-holiday">
                <span className="pl-leaf" aria-hidden="true"><span>{monthShort(holiday.fecha)}</span><strong>{dayOfMonth(holiday.fecha)}</strong></span>
                <div className="pl-holiday-text"><strong>{holiday.descripcion}</strong><span>{formatDateWithWeekday(holiday.fecha)}</span></div>
                <button type="button" className="ui-btn ui-btn-quiet ui-btn-quiet-danger" disabled={busy} aria-label={`Quitar feriado ${holiday.descripcion}`} onClick={() => onRemoveHoliday(holiday)}><ButtonLabel icon="trash">Quitar</ButtonLabel></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Diálogos                                                            */
/* ------------------------------------------------------------------ */

interface DialogBase { busy: boolean; error: string; onClose: () => void }

function NewPeriodDialog({ busy, error, onClose, onSubmit }: DialogBase & { onSubmit: (data: { denominacion: string; fecha_inicio: string; fecha_fin: string }) => void }) {
  const [name, setName] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ denominacion: name.trim(), fecha_inicio: start, fecha_fin: end })
  }
  return (
    <Modal title="Nuevo semestre académico" description="Después de crearlo podrás cargar su calendario y programar su oferta. Todos los campos son obligatorios." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <Field id="period-name" label="Denominación" hint="Ejemplo: 2027-I.">
          <input id="period-name" className="ui-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoComplete="off" aria-describedby="period-name-hint" data-autofocus="" />
        </Field>
        <Field id="period-start" label="Fecha de inicio">
          <input id="period-start" className="ui-input" type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
        </Field>
        <Field id="period-end" label="Fecha de finalización" hint="No puede ser anterior a la fecha de inicio.">
          <input id="period-end" className="ui-input" type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} required aria-describedby="period-end-hint" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Crear semestre" icon="check" />
      </form>
    </Modal>
  )
}

function NewHolidayDialog({ period, busy, error, onClose, onSubmit }: DialogBase & { period: AcademicPeriod; onSubmit: (data: { fecha: string; descripcion: string }) => void }) {
  const [date, setDate] = useState("")
  const [description, setDescription] = useState("")
  return (
    <Modal title="Agregar feriado" description={`Se excluirá de las clases de todos los paralelos del semestre ${period.denominacion}.`} onClose={onClose} locked={busy}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit({ fecha: date, descripcion: description.trim() }) }}>
        <DialogError error={error} />
        <Field id="holiday-date" label="Fecha" hint={`Debe estar entre ${formatDate(period.fecha_inicio)} y ${formatDate(period.fecha_fin)}.`}>
          <input id="holiday-date" className="ui-input" type="date" value={date} min={period.fecha_inicio} max={period.fecha_fin} onChange={(event) => setDate(event.target.value)} required aria-describedby="holiday-date-hint" data-autofocus="" />
        </Field>
        <Field id="holiday-desc" label="Descripción" hint="Ejemplo: Día del Trabajo.">
          <input id="holiday-desc" className="ui-input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} required autoComplete="off" aria-describedby="holiday-desc-hint" />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Agregar feriado" icon="check" />
      </form>
    </Modal>
  )
}
