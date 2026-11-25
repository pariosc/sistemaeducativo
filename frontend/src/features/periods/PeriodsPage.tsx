import { useEffect, useRef, useState } from "react"
import type { FormEvent, RefObject } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod, Course, Holiday } from "../../api/client"
import { Icon } from "../shared/icons"
import { Modal } from "../shared/Modal"
import { ButtonLabel, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { dateSchema, descriptionSchema, labelSchema, messageOf } from "../shared/validation"
import { PlanningShell } from "../planning/PlanningShell"
import { PeriodPlanSetup } from "../planning/PeriodPlanSetup"
import { PERIOD_STATE_LABEL, PERIOD_STATE_TONE, dayOfMonth, daysBetween, formatDate, formatDateWithWeekday, monthShort, periodState, plural, sortPeriods } from "../planning/dates"
import type { PeriodState } from "../planning/dates"
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
    setHolidays(await api.listHolidays(id))
  }

  useEffect(() => { void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (!selectedId) { setHolidays([]); return }
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
          holidays={holidays}
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
  const [filter, setFilter] = useState<PeriodState | "all">("all")
  const visible = filter === "all" ? periods : periods.filter((period) => periodState(period) === filter)
  return (
    <>
      <PageHeader
        eyebrow="PLANIFICACIÓN ACADÉMICA"
        title="Planificar semestre"
        description="El semestre académico es el ciclo común de oferta e inscripción, tanto para planes semestrales como modulares. No es lo mismo que el semestre curricular, que ubica una materia dentro de un plan."
        headingRef={headingRef}
        actions={<button type="button" className="ui-btn ui-btn-primary" onClick={onNew}><ButtonLabel icon="plus">Nuevo semestre</ButtonLabel></button>}
      />

      {periods.length > 0 && <div className="pl-period-filter ui-field">
        <label htmlFor="period-state-filter">Mostrar semestres</label>
        <select id="period-state-filter" className="ui-select" value={filter} onChange={(event) => setFilter(event.target.value as PeriodState | "all")}>
          <option value="all">Todos ({periods.length})</option>
          <option value="current">En curso ({periods.filter((period) => periodState(period) === "current").length})</option>
          <option value="upcoming">Próximos ({periods.filter((period) => periodState(period) === "upcoming").length})</option>
          <option value="past">Finalizados ({periods.filter((period) => periodState(period) === "past").length})</option>
        </select>
      </div>}
      {periods.length === 0 ? (
        <EmptyState icon="layers" title="Aún no hay semestres académicos">
          Crea el primero con «Nuevo semestre». Después podrás cargar su calendario, programar la oferta de paralelos y habilitar a los estudiantes.
        </EmptyState>
      ) : visible.length === 0 ? <p className="pl-filter-empty">No hay semestres en este estado.</p> : (
        <ul className="pl-grid">
          {visible.map((period) => {
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

function PeriodDetail({ period, holidays, headingRef, busy, onBack, onNewHoliday, onRemoveHoliday }: {
  period: AcademicPeriod
  holidays: Holiday[]
  headingRef: RefObject<HTMLHeadingElement | null>
  busy: boolean
  onBack: () => void
  onNewHoliday: () => void
  onRemoveHoliday: (holiday: Holiday) => void
}) {
  const state = periodState(period)
  const sortedHolidays = [...holidays].sort((a, b) => a.fecha.localeCompare(b.fecha))

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

      <PeriodPlanSetup key={period.id} periodId={period.id} />

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
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      denominacion: messageOf(labelSchema, name),
      fecha_inicio: messageOf(dateSchema, start),
      fecha_fin: messageOf(dateSchema, end) ?? (start && end <= start ? "La fecha de fin debe ser posterior a la de inicio." : null),
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    onSubmit({ denominacion: name.trim(), fecha_inicio: start, fecha_fin: end })
  }
  return (
    <Modal title="Nuevo semestre académico" description="Después de crearlo podrás cargar su calendario y programar su oferta. Todos los campos son obligatorios." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <Field id="period-name" label="Denominación" hint="Ejemplo: 2027-I." error={errors.denominacion}>
          <input id="period-name" className="ui-input" value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, denominacion: null })) }} maxLength={160} required autoComplete="off" aria-invalid={Boolean(errors.denominacion)} aria-describedby={errors.denominacion ? "period-name-error period-name-hint" : "period-name-hint"} data-autofocus="" />
        </Field>
        <Field id="period-start" label="Fecha de inicio" error={errors.fecha_inicio}>
          <input id="period-start" className="ui-input" type="date" value={start} onChange={(event) => { setStart(event.target.value); setErrors((current) => ({ ...current, fecha_inicio: null })) }} required aria-invalid={Boolean(errors.fecha_inicio)} aria-describedby={errors.fecha_inicio ? "period-start-error" : undefined} />
        </Field>
        <Field id="period-end" label="Fecha de finalización" hint="No puede ser anterior a la fecha de inicio." error={errors.fecha_fin}>
          <input id="period-end" className="ui-input" type="date" value={end} min={start || undefined} onChange={(event) => { setEnd(event.target.value); setErrors((current) => ({ ...current, fecha_fin: null })) }} required aria-invalid={Boolean(errors.fecha_fin)} aria-describedby={errors.fecha_fin ? "period-end-error period-end-hint" : "period-end-hint"} />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Crear semestre" icon="check" />
      </form>
    </Modal>
  )
}

function NewHolidayDialog({ period, busy, error, onClose, onSubmit }: DialogBase & { period: AcademicPeriod; onSubmit: (data: { fecha: string; descripcion: string }) => void }) {
  const [date, setDate] = useState("")
  const [description, setDescription] = useState("")
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      fecha: messageOf(dateSchema, date) ?? (date < period.fecha_inicio || date > period.fecha_fin ? "La fecha debe estar dentro del semestre." : null),
      descripcion: messageOf(descriptionSchema, description),
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    onSubmit({ fecha: date, descripcion: description.trim() })
  }
  return (
    <Modal title="Agregar feriado" description={`Se excluirá de las clases de todos los paralelos del semestre ${period.denominacion}.`} onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <Field id="holiday-date" label="Fecha" hint={`Debe estar entre ${formatDate(period.fecha_inicio)} y ${formatDate(period.fecha_fin)}.`} error={errors.fecha}>
          <input id="holiday-date" className="ui-input" type="date" value={date} min={period.fecha_inicio} max={period.fecha_fin} onChange={(event) => { setDate(event.target.value); setErrors((current) => ({ ...current, fecha: null })) }} required aria-invalid={Boolean(errors.fecha)} aria-describedby={errors.fecha ? "holiday-date-error holiday-date-hint" : "holiday-date-hint"} data-autofocus="" />
        </Field>
        <Field id="holiday-desc" label="Descripción" hint="Ejemplo: Día del Trabajo." error={errors.descripcion}>
          <input id="holiday-desc" className="ui-input" value={description} onChange={(event) => { setDescription(event.target.value); setErrors((current) => ({ ...current, descripcion: null })) }} maxLength={160} required autoComplete="off" aria-invalid={Boolean(errors.descripcion)} aria-describedby={errors.descripcion ? "holiday-desc-error holiday-desc-hint" : "holiday-desc-hint"} />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="Agregar feriado" icon="check" />
      </form>
    </Modal>
  )
}
