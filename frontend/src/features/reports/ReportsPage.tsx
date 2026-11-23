import { useEffect, useMemo, useState } from "react"

import { api, type Career, type Course, type GradeWorkItem, type ReportCode, type StudyPlan, type User } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AdminNavigation } from "../shared/AdminNavigation"

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

  async function exportReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("")
    const filters: { career_id?: string; plan_id?: string; student_id?: string; course_id?: string; teacher_id?: string } = {}
    if (selected.code === "RF33") {
      if (!careerId) { setError("Selecciona una carrera."); return }
      if (!planId) { setError("Selecciona un plan de estudio."); return }
      filters.career_id = careerId; filters.plan_id = planId
    }
    if (selected.code === "RF34") {
      if (!studentId) { setError("Selecciona un estudiante."); return }
      filters.student_id = studentId
    }
    if (selected.code === "RF35" || selected.code === "RF38") {
      if (!courseId) { setError("Selecciona un paralelo."); return }
      filters.course_id = courseId
    }
    if (selected.code === "RF40" && role === "ADMINISTRADOR") {
      if (!teacherId) { setError("Selecciona un docente."); return }
      filters.teacher_id = teacherId
    }
    setDownloading(true)
    try { await api.exportReport(selected.code, format, filters); setMessage("Reporte generado y descargado.") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo generar el reporte.") }
    finally { setDownloading(false) }
  }

  return <main className="dashboard-page">
    <header className="topbar">
      <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
      <AdminNavigation />
    </header>
    <section className="content-wrap"><span className="eyebrow">CONSULTA ACADÉMICA</span><h1>Reportes</h1>
      <p className="section-intro">Genera y descarga reportes PDF o Excel con los datos disponibles para tu rol.</p>
      {error && <p role="alert" className="form-alert">{error}</p>}{message && <p role="status" className="success-note">{message}</p>}
      {loading ? <p role="status">Cargando filtros…</p> : <section className="profile-card"><form className="stack-form" noValidate onSubmit={(event) => void exportReport(event)}>
        <label>Reporte<select className="form-input" value={selected.code} onChange={(event) => { setCode(event.target.value as ReportCode); setCareerId(""); setPlanId(""); setStudentId(""); setCourseId(""); setTeacherId(""); setError(""); setMessage("") }}>{available.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.label}</option>)}</select></label>
        {selected.code === "RF33" && <>
          <label>Carrera<select className="form-input" value={careerId} onChange={(event) => { setCareerId(event.target.value); setPlanId("") }} required>
            <option value="">Selecciona una carrera</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.codigo} — {career.nombre}</option>)}
          </select></label>
          <label>Plan<select className="form-input" value={planId} onChange={(event) => setPlanId(event.target.value)} required>
            <option value="">Selecciona un plan</option>{matchingPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.codigo} — {plan.estado}</option>)}
          </select></label>
        </>}
        {selected.code === "RF34" && <label>Estudiante<select className="form-input" value={studentId} onChange={(event) => setStudentId(event.target.value)} required>
          <option value="">Selecciona un estudiante</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select></label>}
        {(selected.code === "RF35" || selected.code === "RF38") && <label>Paralelo<select className="form-input" value={courseId} onChange={(event) => setCourseId(event.target.value)} required>
          <option value="">Selecciona un paralelo</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.materia_codigo} — {course.materia_nombre} · {course.paralelo} · {course.periodo_denominacion}</option>)}
        </select></label>}
        {selected.code === "RF40" && role === "ADMINISTRADOR" && <label>Docente<select className="form-input" value={teacherId} onChange={(event) => setTeacherId(event.target.value)} required>
          <option value="">Selecciona un docente</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.nombres} {teacher.apellidos} · {teacher.ci}</option>)}
        </select></label>}
        <label>Formato<select className="form-input" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="pdf">PDF</option><option value="xlsx">Excel (.xlsx)</option></select></label>
        <button className="primary-button" type="submit" disabled={downloading}>{downloading ? "Generando…" : `Descargar ${format.toUpperCase()}`}</button>
      </form></section>}
    </section>
  </main>
}
