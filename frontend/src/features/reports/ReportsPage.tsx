import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type {
  AcademicPeriod,
  Career,
  Course,
  GradeWorkItem,
  PlanState,
  ReportCode,
  ReportFilters,
  ReportPreview,
  StudyPlan,
  User,
} from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AppShell, PageLoading } from "../shared/AppShell"
import { Icon } from "../shared/icons"
import { Field, Notices, PageHeader } from "../shared/ui"

type FilterKey = "career" | "plan" | "student" | "course" | "teacher" | "dates"
type CareerOption = Pick<Career, "id" | "codigo" | "nombre">
type PlanOption = Pick<StudyPlan, "id" | "carrera_id" | "codigo" | "estado">

const reportOptions: Record<User["rol"], { code: ReportCode; label: string }[]> = {
  ADMINISTRADOR: [
    { code: "RF33", label: "Materias por carrera y plan" }, { code: "RF34", label: "Notas de un estudiante" },
    { code: "RF35", label: "Notas de un paralelo" }, { code: "RF38", label: "Inscritos por paralelo" },
    { code: "RF40", label: "Materias de un docente" },
  ],
  DOCENTE: [
    { code: "RF34", label: "Notas de un estudiante" }, { code: "RF35", label: "Notas de un paralelo" },
    { code: "RF38", label: "Inscritos por paralelo" }, { code: "RF40", label: "Mis materias asignadas" },
  ],
  ESTUDIANTE: [
    { code: "RF36", label: "Mi historial académico" }, { code: "RF37", label: "Mis calificaciones" },
    { code: "RF39", label: "Mis materias inscritas" },
  ],
}

/** Qué hay que elegir para cada reporte (coincide con los filtros que pide el formulario). */
function needsText(code: ReportCode, role: User["rol"]) {
  if (code === "RF33") return "Elige carrera y plan"
  if (code === "RF34") return "Elige un estudiante"
  if (code === "RF35" || code === "RF38") return "Elige un paralelo"
  if (code === "RF40" && role === "ADMINISTRADOR") return "Elige un docente"
  return "No necesita filtros"
}

const FIELD_ID: Record<FilterKey, string> = {
  career: "rp-career", plan: "rp-plan", student: "rp-student", course: "rp-course",
  teacher: "rp-teacher", dates: "rp-date-from",
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()]
}

function periodOptions(courses: Course[]): AcademicPeriod[] {
  return uniqueBy(
    courses.map((course) => ({
      id: course.periodo_id,
      denominacion: course.periodo_denominacion,
      fecha_inicio: course.fecha_inicio,
      fecha_fin: course.fecha_fin,
    })),
    (period) => period.id,
  )
}

function careerOptions(courses: Course[]): CareerOption[] {
  return uniqueBy(
    courses.map((course) => ({
      id: course.carrera_id,
      codigo: course.carrera_codigo,
      nombre: course.carrera_nombre,
    })),
    (career) => career.id,
  )
}

function planOptions(courses: Course[]): PlanOption[] {
  return uniqueBy(
    courses.map((course) => ({
      id: course.plan_id,
      carrera_id: course.carrera_id,
      codigo: course.plan_codigo,
      estado: course.plan_estado,
    })),
    (plan) => plan.id,
  )
}

function cellText(value: string | number | null) {
  return value === null || value === "" ? "—" : String(value)
}

export function ReportsPage() {
  const { user } = useAuth()
  const role = user?.rol ?? "ESTUDIANTE"
  const available = reportOptions[role]
  const [code, setCode] = useState<ReportCode>(available[0].code)
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf")
  const [careers, setCareers] = useState<CareerOption[]>([])
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [students, setStudents] = useState<{ id: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [careerId, setCareerId] = useState("")
  const [planId, setPlanId] = useState("")
  const [studentId, setStudentId] = useState("")
  const [courseId, setCourseId] = useState("")
  const [teacherId, setTeacherId] = useState("")
  const [extraCareerId, setExtraCareerId] = useState("")
  const [extraPlanId, setExtraPlanId] = useState("")
  const [periodId, setPeriodId] = useState("")
  const [enrollmentStatus, setEnrollmentStatus] = useState<"" | "ACTIVA" | "RETIRADA">("")
  const [courseStatus, setCourseStatus] = useState<"" | "ACTIVO" | "INACTIVO">("")
  const [planStatus, setPlanStatus] = useState<"" | PlanState>("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FilterKey, string>>>({})
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [previewSignature, setPreviewSignature] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  const selected = available.find((item) => item.code === code) ?? available[0]
  const matchingPlans = useMemo(() => plans.filter((plan) => !careerId || plan.carrera_id === careerId), [plans, careerId])
  const extraMatchingPlans = useMemo(() => plans.filter((plan) => !extraCareerId || plan.carrera_id === extraCareerId), [plans, extraCareerId])
  const usesExtraFilters = code !== "RF33"
  const statusField = code === "RF33" ? "plan" : code === "RF40" ? "paralelo" : "inscripcion"

  const filters = useMemo<ReportFilters>(() => {
    const next: ReportFilters = {}
    const add = (key: keyof ReportFilters, value: string | undefined) => {
      if (value) Object.assign(next, { [key]: value })
    }
    if (code === "RF33") {
      add("career_id", careerId)
      add("plan_id", planId)
      add("estado_plan", planStatus)
      return next
    }
    if (code === "RF34") add("student_id", studentId)
    if (code === "RF35" || code === "RF38") add("course_id", courseId)
    if (code === "RF40" && role === "ADMINISTRADOR") add("teacher_id", teacherId)
    add("career_id", extraCareerId)
    add("plan_id", extraPlanId)
    add("period_id", periodId)
    add("estado_inscripcion", enrollmentStatus)
    add("estado_paralelo", courseStatus)
    add("fecha_desde", dateFrom)
    add("fecha_hasta", dateTo)
    return next
  }, [code, role, careerId, planId, studentId, courseId, teacherId, extraCareerId, extraPlanId, periodId, enrollmentStatus, courseStatus, planStatus, dateFrom, dateTo])

  const signature = useMemo(() => JSON.stringify(filters), [filters])
  const previewStale = preview !== null && previewSignature !== signature
  const canExport = preview !== null && !previewStale && !previewing

  const filterSummary = useMemo(() => {
    const parts: string[] = []
    const careerLabel = (identifier: string) => careers.find((item) => item.id === identifier)?.codigo ?? identifier.slice(0, 8)
    const planLabel = (identifier: string) => plans.find((item) => item.id === identifier)?.codigo ?? identifier.slice(0, 8)
    const periodLabel = (identifier: string) => periods.find((item) => item.id === identifier)?.denominacion ?? identifier.slice(0, 8)
    if (careerId) parts.push(`Carrera ${careerLabel(careerId)}`)
    if (planId) parts.push(`Plan ${planLabel(planId)}`)
    if (extraCareerId) parts.push(`Carrera ${careerLabel(extraCareerId)}`)
    if (extraPlanId) parts.push(`Plan ${planLabel(extraPlanId)}`)
    if (periodId) parts.push(`Periodo ${periodLabel(periodId)}`)
    if (enrollmentStatus) parts.push(`Inscripción ${enrollmentStatus}`)
    if (courseStatus) parts.push(`Paralelo ${courseStatus}`)
    if (planStatus) parts.push(`Plan ${planStatus}`)
    if (dateFrom) parts.push(`Desde ${dateFrom}`)
    if (dateTo) parts.push(`Hasta ${dateTo}`)
    return parts.length ? parts.join(" · ") : "Sin filtros adicionales"
  }, [careers, plans, periods, careerId, planId, extraCareerId, extraPlanId, periodId, enrollmentStatus, courseStatus, planStatus, dateFrom, dateTo])

  useEffect(() => {
    if (!available.some((item) => item.code === code)) setCode(available[0].code)
  }, [role])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    void (async () => {
      try {
        if (role === "ADMINISTRADOR") {
          const [careerData, planData, courseData, userData, periodData] = await Promise.all([
            api.listCareers(), api.listPlans(), api.listCourses(), api.listUsers(), api.listPeriods(),
          ])
          setCareers(careerData); setPlans(planData); setCourses(courseData); setPeriods(periodData)
          setStudents(userData.filter((item) => item.rol === "ESTUDIANTE").map((item) => ({ id: item.id, name: `${item.nombres} ${item.apellidos} · ${item.ci}` })))
          setTeachers(userData.filter((item) => item.rol === "DOCENTE"))
        } else if (role === "DOCENTE") {
          const [courseData, gradebook] = await Promise.all([api.listCourses(), api.teacherGradebook()])
          setCourses(courseData)
          setCareers(careerOptions(courseData)); setPlans(planOptions(courseData)); setPeriods(periodOptions(courseData))
          const uniqueStudents = new Map<string, { id: string; name: string }>()
          gradebook.forEach((item: GradeWorkItem) => uniqueStudents.set(item.estudiante_id, { id: item.estudiante_id, name: `${item.estudiante_nombre} · ${item.estudiante_ci}` }))
          setStudents([...uniqueStudents.values()])
        } else {
          const enrollments = await api.studentEnrollments()
          const ownCourses = enrollments.map((item) => item.curso)
          setCourses(ownCourses)
          setCareers(careerOptions(ownCourses)); setPlans(planOptions(ownCourses)); setPeriods(periodOptions(ownCourses))
        }
        setError("")
      } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar los filtros.") }
      finally { setLoading(false) }
    })()
  }, [role])

  /** Cambiar de reporte reinicia los filtros y los avisos: nada queda preseleccionado. */
  function chooseReport(next: ReportCode) {
    abortRef.current?.abort()
    setCode(next)
    setCareerId(""); setPlanId(""); setStudentId(""); setCourseId(""); setTeacherId("")
    setExtraCareerId(""); setExtraPlanId(""); setPeriodId("")
    setEnrollmentStatus(""); setCourseStatus(""); setPlanStatus(""); setDateFrom(""); setDateTo("")
    setPreview(null); setPreviewSignature("")
    setFieldErrors({}); setError(""); setMessage("")
  }
  function clearFieldError(key: FilterKey) { setFieldErrors((current) => ({ ...current, [key]: undefined })) }

  function validateFilters() {
    const missing: Partial<Record<FilterKey, string>> = {}
    if (code === "RF33") {
      if (!careerId) missing.career = "Selecciona una carrera."
      if (!planId) missing.plan = "Selecciona un plan de estudio."
    }
    if (code === "RF34" && !studentId) missing.student = "Selecciona un estudiante."
    if ((code === "RF35" || code === "RF38") && !courseId) missing.course = "Selecciona un paralelo."
    if (code === "RF40" && role === "ADMINISTRADOR" && !teacherId) missing.teacher = "Selecciona un docente."
    if (dateFrom && dateTo && dateFrom > dateTo) missing.dates = "La fecha desde no puede ser mayor a la fecha hasta."
    return missing
  }

  async function loadPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("")
    const missing = validateFilters()
    setFieldErrors(missing)
    const firstMissing = (Object.keys(missing) as FilterKey[])[0]
    if (firstMissing) {
      // El foco va al primer campo con problema (WCAG 3.3.1) y no se consulta el reporte.
      window.setTimeout(() => document.getElementById(FIELD_ID[firstMissing])?.focus(), 0)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestedSignature = JSON.stringify(filters)
    setPreviewing(true)
    try {
      const data = await api.previewReport(code, filters, controller.signal)
      if (controller.signal.aborted) return
      setPreview(data); setPreviewSignature(requestedSignature)
      setMessage("Vista previa lista. Revisa los datos antes de imprimir o descargar.")
    } catch (reason) {
      if (controller.signal.aborted) return
      setPreview(null); setPreviewSignature("")
      setError(reason instanceof Error ? reason.message : "No se pudo generar la vista previa.")
    } finally {
      if (!controller.signal.aborted) setPreviewing(false)
    }
  }

  async function downloadReport() {
    if (!canExport) return
    setError(""); setMessage(""); setDownloading(true)
    try {
      await api.exportReport(code, format, filters)
      setMessage(`Reporte ${format === "pdf" ? "PDF" : "Excel"} descargado.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar el reporte.") }
    finally { setDownloading(false) }
  }

  /** aria-describedby combinando el error del campo y el aviso de lista vacía. */
  const describe = (key: FilterKey, emptyHint: boolean) => [fieldErrors[key] ? `${FIELD_ID[key]}-error` : "", emptyHint ? `${FIELD_ID[key]}-hint` : ""].filter(Boolean).join(" ") || undefined

  return (
    <AppShell>
      <PageHeader
        eyebrow="CONSULTA ACADÉMICA"
        title="Reportes"
        description="Consulta una vista previa con los filtros que necesitas; después podrás imprimirla o descargarla en PDF o Excel."
      />
      <Notices notice={message} error={error} />

      {loading ? <PageLoading>Cargando filtros…</PageLoading> : (
        <>
          <form className="rp-layout" noValidate onSubmit={(event) => void loadPreview(event)}>
            <fieldset className="ui-fieldset rp-catalog">
              <legend><span className="rp-step" aria-hidden="true">1</span>Elige el reporte</legend>
              {available.map((item) => (
                <label key={item.code} className="rp-option" data-selected={item.code === code ? "" : undefined}>
                  <input type="radio" name="report" value={item.code} checked={item.code === code} onChange={() => chooseReport(item.code)} />
                  <span className="rp-option-main"><strong>{item.label}</strong><small>{needsText(item.code, role)}</small></span>
                  <span className="rp-code">{item.code}</span>
                </label>
              ))}
            </fieldset>

            <section className="ui-card rp-config" aria-labelledby="rp-config-title">
              <h2 id="rp-config-title"><span className="rp-step" aria-hidden="true">2</span>Define los datos</h2>
              <p className="rp-selected">{selected.label}</p>

              {code === "RF33" && (
                <>
                  <Field id="rp-career" label="Carrera" hint={careers.length === 0 ? "No hay carreras registradas." : undefined} error={fieldErrors.career}>
                    <select id="rp-career" className="ui-select" value={careerId} onChange={(event) => { setCareerId(event.target.value); setPlanId(""); clearFieldError("career"); clearFieldError("plan") }} required aria-invalid={Boolean(fieldErrors.career)} aria-describedby={describe("career", careers.length === 0)}>
                      <option value="">Selecciona una carrera</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.codigo} — {career.nombre}</option>)}
                    </select>
                  </Field>
                  <Field id="rp-plan" label="Plan" hint={careerId && matchingPlans.length === 0 ? "Esta carrera no tiene planes." : undefined} error={fieldErrors.plan}>
                    <select id="rp-plan" className="ui-select" value={planId} onChange={(event) => { setPlanId(event.target.value); clearFieldError("plan") }} required aria-invalid={Boolean(fieldErrors.plan)} aria-describedby={describe("plan", Boolean(careerId) && matchingPlans.length === 0)}>
                      <option value="">Selecciona un plan</option>{matchingPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.codigo} — {plan.estado}</option>)}
                    </select>
                  </Field>
                </>
              )}
              {code === "RF34" && (
                <Field id="rp-student" label="Estudiante" hint={students.length === 0 ? "No hay estudiantes disponibles." : undefined} error={fieldErrors.student}>
                  <select id="rp-student" className="ui-select" value={studentId} onChange={(event) => { setStudentId(event.target.value); clearFieldError("student") }} required aria-invalid={Boolean(fieldErrors.student)} aria-describedby={describe("student", students.length === 0)}>
                    <option value="">Selecciona un estudiante</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                  </select>
                </Field>
              )}
              {(code === "RF35" || code === "RF38") && (
                <Field id="rp-course" label="Paralelo" hint={courses.length === 0 ? "No hay paralelos disponibles." : undefined} error={fieldErrors.course}>
                  <select id="rp-course" className="ui-select" value={courseId} onChange={(event) => { setCourseId(event.target.value); clearFieldError("course") }} required aria-invalid={Boolean(fieldErrors.course)} aria-describedby={describe("course", courses.length === 0)}>
                    <option value="">Selecciona un paralelo</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.materia_codigo} — {course.materia_nombre} · {course.paralelo} · {course.periodo_denominacion}</option>)}
                  </select>
                </Field>
              )}
              {code === "RF40" && role === "ADMINISTRADOR" && (
                <Field id="rp-teacher" label="Docente" hint={teachers.length === 0 ? "No hay docentes registrados." : undefined} error={fieldErrors.teacher}>
                  <select id="rp-teacher" className="ui-select" value={teacherId} onChange={(event) => { setTeacherId(event.target.value); clearFieldError("teacher") }} required aria-invalid={Boolean(fieldErrors.teacher)} aria-describedby={describe("teacher", teachers.length === 0)}>
                    <option value="">Selecciona un docente</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.nombres} {teacher.apellidos} · {teacher.ci}</option>)}
                  </select>
                </Field>
              )}
              {role === "ESTUDIANTE" && <p className="ui-alert ui-alert-info ui-alert-flush">Este reporte usa solo tus datos; los filtros opcionales no muestran información ajena.</p>}

              {usesExtraFilters && (
                <fieldset className="ui-fieldset rp-extra-filters">
                  <legend>Filtros adicionales</legend>
                  <div className="rp-filters-grid">
                    <Field id="rp-extra-career" label="Carrera">
                      <select id="rp-extra-career" className="ui-select" value={extraCareerId} onChange={(event) => { setExtraCareerId(event.target.value); setExtraPlanId("") }}>
                        <option value="">Todas las carreras</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.codigo} — {career.nombre}</option>)}
                      </select>
                    </Field>
                    <Field id="rp-extra-plan" label="Plan" hint={extraCareerId && extraMatchingPlans.length === 0 ? "Esta carrera no tiene planes." : undefined}>
                      <select id="rp-extra-plan" className="ui-select" value={extraPlanId} onChange={(event) => setExtraPlanId(event.target.value)} aria-describedby={extraCareerId && extraMatchingPlans.length === 0 ? "rp-extra-plan-hint" : undefined}>
                        <option value="">Todos los planes</option>{extraMatchingPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.codigo} — {plan.estado}</option>)}
                      </select>
                    </Field>
                    <Field id="rp-period" label="Periodo académico">
                      <select id="rp-period" className="ui-select" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
                        <option value="">Todos los periodos</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.denominacion}</option>)}
                      </select>
                    </Field>
                    {statusField === "inscripcion" && (
                      <Field id="rp-status" label="Estado de inscripción">
                        <select id="rp-status" className="ui-select" value={enrollmentStatus} onChange={(event) => setEnrollmentStatus(event.target.value as "" | "ACTIVA" | "RETIRADA")}>
                          <option value="">Todos los estados</option><option value="ACTIVA">Activa</option><option value="RETIRADA">Retirada</option>
                        </select>
                      </Field>
                    )}
                    {statusField === "paralelo" && (
                      <Field id="rp-status" label="Estado del paralelo">
                        <select id="rp-status" className="ui-select" value={courseStatus} onChange={(event) => setCourseStatus(event.target.value as "" | "ACTIVO" | "INACTIVO")}>
                          <option value="">Todos los estados</option><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option>
                        </select>
                      </Field>
                    )}
                    {statusField === "plan" && (
                      <Field id="rp-status" label="Estado del plan">
                        <select id="rp-status" className="ui-select" value={planStatus} onChange={(event) => setPlanStatus(event.target.value as "" | PlanState)}>
                          <option value="">Todos los estados</option><option value="BORRADOR">Borrador</option><option value="VIGENTE">Vigente</option><option value="INACTIVO">Inactivo</option>
                        </select>
                      </Field>
                    )}
                    <Field id="rp-date-from" label="Desde" error={fieldErrors.dates}>
                      <input id="rp-date-from" className="ui-input" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); clearFieldError("dates") }} aria-invalid={Boolean(fieldErrors.dates)} aria-describedby={describe("dates", false)} />
                    </Field>
                    <Field id="rp-date-to" label="Hasta">
                      <input id="rp-date-to" className="ui-input" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); clearFieldError("dates") }} />
                    </Field>
                  </div>
                </fieldset>
              )}

              <fieldset className="ui-fieldset">
                <legend><span className="rp-step" aria-hidden="true">3</span>Formato de descarga</legend>
                <div className="rp-formats">
                  <label className="rp-format" data-selected={format === "pdf" ? "" : undefined}>
                    <input type="radio" name="format" value="pdf" checked={format === "pdf"} onChange={() => setFormat("pdf")} />
                    <Icon name="file" size={22} /><span><strong>PDF</strong><small>Para leer o imprimir</small></span>
                  </label>
                  <label className="rp-format" data-selected={format === "xlsx" ? "" : undefined}>
                    <input type="radio" name="format" value="xlsx" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
                    <Icon name="table" size={22} /><span><strong>Excel</strong><small>Para analizar datos (.xlsx)</small></span>
                  </label>
                </div>
              </fieldset>

              <div className="rp-actions">
                <p className="rp-summary">
                  {preview ? `Vista previa: ${preview.row_count} fila(s) · ${filterSummary}` : "Primero consulta los datos; luego podrás imprimir o descargar."}
                  {previewStale && " Los filtros cambiaron: vuelve a consultar."}
                </p>
                <div className="rp-action-buttons">
                  <button className="ui-btn ui-btn-secondary" type="submit" disabled={previewing}>
                    {previewing ? "Consultando…" : <><Icon name="search" /><span>Ver vista previa</span></>}
                  </button>
                  <button className="ui-btn ui-btn-secondary" type="button" disabled={!canExport} onClick={() => window.print()}>
                    <Icon name="file" /><span>Imprimir</span>
                  </button>
                  <button className="ui-btn ui-btn-primary" type="button" disabled={!canExport || downloading} onClick={() => void downloadReport()}>
                    {downloading ? "Generando…" : <><Icon name="download" /><span>{`Descargar ${format.toUpperCase()}`}</span></>}
                  </button>
                </div>
              </div>
            </section>
          </form>

          {preview && (
            <section className="ui-card rp-preview" id="rp-print-area" aria-labelledby="rp-preview-title">
              <div className="rp-preview-heading">
                <div>
                  <p className="ui-eyebrow">{preview.code}</p>
                  <h2 id="rp-preview-title">{preview.title}</h2>
                  <p className="rp-preview-meta">{filterSummary}</p>
                </div>
                <p className="rp-preview-meta">{new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(preview.generated_at))}</p>
              </div>
              {preview.row_count === 0 ? (
                <p className="ui-empty">No hay datos para los filtros seleccionados.</p>
              ) : (
                <div className="rp-table-wrap">
                  <table className="ui-table rp-preview-table">
                    <caption className="ui-visually-hidden">{preview.title}</caption>
                    <thead><tr>{preview.headers.map((header, index) => <th key={`${header}-${index}`} scope="col">{header}</th>)}</tr></thead>
                    <tbody>
                      {preview.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellText(cell)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </AppShell>
  )
}
