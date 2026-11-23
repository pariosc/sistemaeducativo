import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type { Career, Course, GradeWorkItem, ReportCode, StudyPlan, User } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AppShell, PageLoading } from "../shared/AppShell"
import { Icon } from "../shared/icons"
import { Field, Notices, PageHeader } from "../shared/ui"

type FilterKey = "career" | "plan" | "student" | "course" | "teacher"

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

const FIELD_ID: Record<FilterKey, string> = { career: "rp-career", plan: "rp-plan", student: "rp-student", course: "rp-course", teacher: "rp-teacher" }

export function ReportsPage() {
  const { user } = useAuth()
  const role = user?.rol ?? "ESTUDIANTE"
  const available = reportOptions[role]
  const [code, setCode] = useState<ReportCode>(available[0].code)
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf")
  const [careers, setCareers] = useState<Career[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [students, setStudents] = useState<{ id: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [careerId, setCareerId] = useState("")
  const [planId, setPlanId] = useState("")
  const [studentId, setStudentId] = useState("")
  const [courseId, setCourseId] = useState("")
  const [teacherId, setTeacherId] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FilterKey, string>>>({})
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const selected = available.find((item) => item.code === code) ?? available[0]
  const matchingPlans = useMemo(() => plans.filter((plan) => !careerId || plan.carrera_id === careerId), [plans, careerId])

  useEffect(() => {
    if (!available.some((item) => item.code === code)) setCode(available[0].code)
  }, [role])
  useEffect(() => {
    void (async () => {
      try {
        if (role === "ADMINISTRADOR") {
          const [careerData, planData, courseData, userData] = await Promise.all([
            api.listCareers(), api.listPlans(), api.listCourses(), api.listUsers(),
          ])
          setCareers(careerData); setPlans(planData); setCourses(courseData)
          setStudents(userData.filter((item) => item.rol === "ESTUDIANTE").map((item) => ({ id: item.id, name: `${item.nombres} ${item.apellidos} · ${item.ci}` })))
          setTeachers(userData.filter((item) => item.rol === "DOCENTE"))
        } else if (role === "DOCENTE") {
          const [courseData, gradebook] = await Promise.all([api.listCourses(), api.teacherGradebook()])
          setCourses(courseData)
          const uniqueStudents = new Map<string, { id: string; name: string }>()
          gradebook.forEach((item: GradeWorkItem) => uniqueStudents.set(item.estudiante_id, { id: item.estudiante_id, name: `${item.estudiante_nombre} · ${item.estudiante_ci}` }))
          setStudents([...uniqueStudents.values()])
        }
        setError("")
      } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar los filtros.") }
      finally { setLoading(false) }
    })()
  }, [role])

  /** Cambiar de reporte reinicia los filtros y los avisos: nada queda preseleccionado. */
  function chooseReport(next: ReportCode) {
    setCode(next)
    setCareerId(""); setPlanId(""); setStudentId(""); setCourseId(""); setTeacherId("")
    setFieldErrors({}); setError(""); setMessage("")
  }
  function clearFieldError(key: FilterKey) { setFieldErrors((current) => ({ ...current, [key]: undefined })) }

  async function exportReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("")
    const filters: { career_id?: string; plan_id?: string; student_id?: string; course_id?: string; teacher_id?: string } = {}
    const missing: Partial<Record<FilterKey, string>> = {}
    if (selected.code === "RF33") {
      if (!careerId) missing.career = "Selecciona una carrera."
      if (!planId) missing.plan = "Selecciona un plan de estudio."
      filters.career_id = careerId; filters.plan_id = planId
    }
    if (selected.code === "RF34") {
      if (!studentId) missing.student = "Selecciona un estudiante."
      filters.student_id = studentId
    }
    if (selected.code === "RF35" || selected.code === "RF38") {
      if (!courseId) missing.course = "Selecciona un paralelo."
      filters.course_id = courseId
    }
    if (selected.code === "RF40" && role === "ADMINISTRADOR") {
      if (!teacherId) missing.teacher = "Selecciona un docente."
      filters.teacher_id = teacherId
    }
    setFieldErrors(missing)
    const firstMissing = (Object.keys(missing) as FilterKey[])[0]
    if (firstMissing) {
      // El foco va al primer campo con problema (WCAG 3.3.1) y no se inicia la descarga.
      window.setTimeout(() => document.getElementById(FIELD_ID[firstMissing])?.focus(), 0)
      return
    }
    setDownloading(true)
    try { await api.exportReport(selected.code, format, filters); setMessage("Reporte generado y descargado.") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar el reporte.") }
    finally { setDownloading(false) }
  }

  const hasFilters = needsText(selected.code, role) !== "No necesita filtros"
  /** aria-describedby combinando el error del campo y el aviso de lista vacía. */
  const describe = (key: FilterKey, emptyHint: boolean) => [fieldErrors[key] ? `${FIELD_ID[key]}-error` : "", emptyHint ? `${FIELD_ID[key]}-hint` : ""].filter(Boolean).join(" ") || undefined

  return (
    <AppShell>
      <PageHeader
        eyebrow="CONSULTA ACADÉMICA"
        title="Reportes"
        description="Genera y descarga reportes PDF o Excel con los datos disponibles para tu rol."
      />
      <Notices notice={message} error={error} />

      {loading ? <PageLoading>Cargando filtros…</PageLoading> : (
        <form className="rp-layout" noValidate onSubmit={(event) => void exportReport(event)}>
          <fieldset className="ui-fieldset rp-catalog">
            <legend><span className="rp-step" aria-hidden="true">1</span>Elige el reporte</legend>
            {available.map((item) => (
              <label key={item.code} className="rp-option" data-selected={item.code === selected.code ? "" : undefined}>
                <input type="radio" name="report" value={item.code} checked={item.code === selected.code} onChange={() => chooseReport(item.code)} />
                <span className="rp-option-main"><strong>{item.label}</strong><small>{needsText(item.code, role)}</small></span>
                <span className="rp-code">{item.code}</span>
              </label>
            ))}
          </fieldset>

          <section className="ui-card rp-config" aria-labelledby="rp-config-title">
            <h2 id="rp-config-title"><span className="rp-step" aria-hidden="true">2</span>Define los datos</h2>
            <p className="rp-selected">{selected.label}</p>

            {selected.code === "RF33" && (
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
            {selected.code === "RF34" && (
              <Field id="rp-student" label="Estudiante" hint={students.length === 0 ? "No hay estudiantes disponibles." : undefined} error={fieldErrors.student}>
                <select id="rp-student" className="ui-select" value={studentId} onChange={(event) => { setStudentId(event.target.value); clearFieldError("student") }} required aria-invalid={Boolean(fieldErrors.student)} aria-describedby={describe("student", students.length === 0)}>
                  <option value="">Selecciona un estudiante</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                </select>
              </Field>
            )}
            {(selected.code === "RF35" || selected.code === "RF38") && (
              <Field id="rp-course" label="Paralelo" hint={courses.length === 0 ? "No hay paralelos disponibles." : undefined} error={fieldErrors.course}>
                <select id="rp-course" className="ui-select" value={courseId} onChange={(event) => { setCourseId(event.target.value); clearFieldError("course") }} required aria-invalid={Boolean(fieldErrors.course)} aria-describedby={describe("course", courses.length === 0)}>
                  <option value="">Selecciona un paralelo</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.materia_codigo} — {course.materia_nombre} · {course.paralelo} · {course.periodo_denominacion}</option>)}
                </select>
              </Field>
            )}
            {selected.code === "RF40" && role === "ADMINISTRADOR" && (
              <Field id="rp-teacher" label="Docente" hint={teachers.length === 0 ? "No hay docentes registrados." : undefined} error={fieldErrors.teacher}>
                <select id="rp-teacher" className="ui-select" value={teacherId} onChange={(event) => { setTeacherId(event.target.value); clearFieldError("teacher") }} required aria-invalid={Boolean(fieldErrors.teacher)} aria-describedby={describe("teacher", teachers.length === 0)}>
                  <option value="">Selecciona un docente</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.nombres} {teacher.apellidos} · {teacher.ci}</option>)}
                </select>
              </Field>
            )}
            {!hasFilters && <p className="ui-alert ui-alert-info ui-alert-flush">Este reporte se genera con tus propios datos: no necesitas elegir nada más.</p>}

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
              <p className="rp-summary">Se descargará: <strong>{selected.label}</strong> en <strong>{format === "pdf" ? "PDF" : "Excel"}</strong>.</p>
              <button className="ui-btn ui-btn-primary" type="submit" disabled={downloading}>
                {downloading ? "Generando…" : <><Icon name="download" /><span>{`Descargar ${format.toUpperCase()}`}</span></>}
              </button>
            </div>
          </section>
        </form>
      )}
    </AppShell>
  )
}
