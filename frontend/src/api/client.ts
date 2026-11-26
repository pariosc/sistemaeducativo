export type Role = "ADMINISTRADOR" | "DOCENTE" | "ESTUDIANTE"

export interface User {
  id: string
  ci: string
  nombres: string
  apellidos: string
  correo: string
  telefono: string
  direccion: string | null
  fecha_nacimiento: string | null
  titulo: string | null
  especialidad: string | null
  plan_estudio_id: string | null
  apertura_plan_id: string | null
  plan_codigo: string | null
  carrera_codigo: string | null
  carrera_nombre: string | null
  apertura_codigo: string | null
  rol: Role
  es_administrador_principal: boolean
  activo: boolean
  debe_cambiar_contrasena: boolean
}

export interface LoginOutput {
  usuario: User
  debe_cambiar_contrasena: boolean
}

export interface UserInput {
  ci: string
  nombres: string
  apellidos: string
  correo: string
  telefono: string
  direccion?: string | null
  fecha_nacimiento?: string | null
  titulo?: string | null
  especialidad?: string | null
  plan_estudio_id?: string | null
  apertura_plan_id?: string | null
  rol: Role
}

export interface UserUpdateInput {
  ci?: string
  nombres?: string
  apellidos?: string
  telefono?: string
  direccion?: string
  fecha_nacimiento?: string
  titulo?: string
  especialidad?: string
  plan_estudio_id?: string
  apertura_plan_id?: string
  activo?: boolean
}

export interface Career {
  id: string
  codigo: string
  nombre: string
  facultad_id: string
  facultad_codigo: string
  facultad_nombre: string
  facultad_activa: boolean
  activo: boolean
  planes_count: number
  planes_vigentes_count: number
  materias_count: number
  estudiantes_count: number
}

export interface Faculty {
  id: string
  codigo: string
  nombre: string
  activo: boolean
  carreras_count: number
  carreras_activas_count: number
  planes_count: number
}

export interface Subject {
  id: string
  codigo: string
  nombre: string
  activo: boolean
  planes_count: number
  planes_vigentes_count: number
  carreras_count: number
  ofertas_count: number
}

export type PlanModality = "MODULAR" | "SEMESTRAL"
export type PlanState = "BORRADOR" | "VIGENTE" | "INACTIVO"

export interface PlanDiagnostic {
  tipo: "error" | "warning"
  codigo: string
  mensaje: string
  unidad_id: string | null
  materia_plan_id: string | null
}

export interface PlanSubject {
  id: string
  materia_id: string
  codigo: string
  nombre: string
  activo: boolean
  prerrequisitos: string[]
}

export interface PlanUnit {
  id: string
  plan_id: string
  numero: number
  nombre: string
  materias: PlanSubject[]
}

export interface StudyPlan {
  id: string
  carrera_id: string
  carrera_codigo: string
  carrera_nombre: string
  carrera_activa: boolean
  facultad_activa: boolean
  codigo: string
  modalidad: PlanModality
  estado: PlanState
  total_semestres: number
  total_materias: number
  puede_publicarse: boolean
  diagnosticos: PlanDiagnostic[]
  unidades: PlanUnit[]
}

export interface StudentPlan {
  usuario_id: string
  ci: string
  nombres: string
  apellidos: string
  plan_estudio_id: string | null
  plan_codigo: string | null
  plan_estado: PlanState | null
  apertura_plan_id: string | null
  apertura_periodo_denominacion: string | null
}

export interface AcademicPeriod {
  id: string
  denominacion: string
  fecha_inicio: string
  fecha_fin: string
}

export interface PeriodPlanning {
  periodo_id: string
  carrera_ids: string[]
  plan_ids: string[]
  plantilla_modular_id: string | null
}

export interface PlanOpening {
  id: string
  codigo: string
  plan_id: string
  periodo_inicio_id: string
  periodo_denominacion: string
  estudiantes: number
  semestre_proyectado: number | null
  proyeccion: { semestre_numero: number; periodo_id: string | null; periodo_denominacion: string | null }[]
}

export interface SubjectSuggestion {
  materia_plan_id: string
  codigo: string
  nombre: string
  semestre_numero: number
  semestre_nombre: string
  prerrequisitos: string[]
  paralelos: number
  cohortes_previstas: number
  estudiantes_previstos: number
  aptos: number
  repetidores: number
  bloqueados: number
  sin_nota: number
  aprobados: number
  recomendada: boolean
}

export interface PeriodSubjectOverview extends SubjectSuggestion {
  facultad_id: string
  facultad_nombre: string
  carrera_id: string
  carrera_nombre: string
  plan_id: string
  plan_codigo: string
  plan_modalidad: PlanModality
  plan_estado: PlanState
}

export interface PlanningRoom { codigo: string; capacidad: number | null; activa: boolean }
export type PlanningShift = "MADRUGADA" | "MANANA" | "TARDE" | "NOCHE"
export interface ScheduleBlock { id: string; turno: PlanningShift; nombre: string; hora_inicio: string; hora_fin: string; activo: boolean; predeterminado_modular: boolean }
export interface ModularTemplate { id: string; nombre: string; clases_por_modulo: number; minutos_por_clase: number; activa: boolean }
export interface ModularSubjectInput { materia_plan_id: string; paralelo: string; cupo: number; docente_id: string | null; aula: string; clases?: number }
export interface ModularPlanInput { plan_id: string; apertura_plan_id: string; turno: PlanningShift; fecha_inicio: string; materias: ModularSubjectInput[] }
export interface ModularModulePreview { materia_plan_id: string; paralelo: string; fecha_inicio: string; fecha_fin: string; fechas_clase: string[]; clases: number }
export interface ModularPlanPreview { periodo_id: string; plantilla_modular_id: string; grupo_id: string; turno: PlanningShift; cabe_en_semestre: boolean; fin_estimado: string; materias: ModularModulePreview[] }
export interface ModularBatchInput { secuencias: ModularPlanInput[] }
export interface ModularBatchPreview { periodo_id: string; cabe_en_semestre: boolean; secuencias: ModularPlanPreview[] }

export type Weekday = "LUNES" | "MARTES" | "MIERCOLES" | "JUEVES" | "VIERNES" | "SABADO" | "DOMINGO"
export type ScheduleExceptionType = "CANCELADA" | "REPROGRAMADA"
export interface CourseSchedule { id: string; dia_semana: Weekday; hora_inicio: string; hora_fin: string; aula: string | null }
export interface CalendarSession { curso_id: string; fecha: string; hora_inicio: string; hora_fin: string; aula: string | null; reprogramada: boolean }
export interface PlanningBooking extends CalendarSession {
  materia_codigo: string; materia_nombre: string; paralelo: string
  docente_id: string | null; docente_nombre: string | null; carrera_nombre: string
  fecha_inicio_curso: string; fecha_fin_curso: string
}
export interface Course {
  id: string; materia_plan_id: string; materia_codigo: string; materia_nombre: string
  plan_id: string; carrera_id: string; facultad_id: string
  plan_codigo: string; plan_estado: PlanState
  carrera_codigo: string; carrera_nombre: string
  periodo_id: string; periodo_denominacion: string
  apertura_plan_id: string | null; plantilla_modular_id: string | null; turno_modular: PlanningShift | null
  clases_objetivo: number | null; clases_programadas: number | null
  paralelo: string; cupo: number; fecha_inicio: string; fecha_fin: string
  docente_id: string | null; docente_nombre: string | null; inscripcion_abierta: boolean
  activo: boolean; horarios: CourseSchedule[]
}
export interface Holiday { id: string; periodo_id: string; fecha: string; descripcion: string }
export interface ScheduleException {
  id: string; curso_id: string; fecha_original: string; tipo: ScheduleExceptionType
  fecha_reprogramada: string | null; hora_inicio: string | null; hora_fin: string | null
  aula: string | null; motivo: string | null
}
export interface StudentAuthorization {
  id: string | null; estudiante_id: string; estudiante_ci: string; estudiante_nombre: string
  periodo_id: string; habilitada: boolean; origen: "ADMINISTRADOR" | "SISTEMA" | null
  fecha_autorizacion: string | null
}
export interface PendingPrerequisite { materia_plan_id: string; codigo: string; nombre: string }
export interface CourseOffer {
  curso: Course
  semestre_numero: number
  semestre_nombre: string
  cupos_disponibles: number
  aula_habilitada: boolean
  inscrito: boolean
  prerrequisitos_pendientes: PendingPrerequisite[]
}
export interface Enrollment { id: string; curso_id: string; fecha_inscripcion: string; estado: "ACTIVA" | "RETIRADA"; curso: Course }
export interface GradeWorkItem {
  inscripcion_id: string; estudiante_id: string; estudiante_ci: string; estudiante_nombre: string
  materia_codigo: string; materia_nombre: string; paralelo: string; periodo_denominacion: string
  nota_final: number | null; fecha_registro: string | null
}
export interface Grade {
  id: string; inscripcion_id: string; estudiante_id: string; materia_codigo: string
  materia_nombre: string; paralelo: string; periodo_denominacion: string
  nota_final: number; fecha_registro: string
}
export type ReportCode = "RF33" | "RF34" | "RF35" | "RF36" | "RF37" | "RF38" | "RF39" | "RF40"
export type ReportFilters = {
  career_id?: string
  plan_id?: string
  student_id?: string
  course_id?: string
  teacher_id?: string
  period_id?: string
  estado_inscripcion?: "ACTIVA" | "RETIRADA"
  estado_paralelo?: "ACTIVO" | "INACTIVO"
  estado_plan?: PlanState
  fecha_desde?: string
  fecha_hasta?: string
}
export interface ReportPreview {
  code: ReportCode
  title: string
  headers: string[]
  rows: (string | number | null)[][]
  row_count: number
  generated_at: string
}
export interface AcademicNotification {
  id: string; curso_id: string | null; tipo: "INSCRIPCION" | "CAMBIO_HORARIO" | "CALIFICACION" | "GENERAL"
  titulo: string; mensaje: string; fecha_creacion: string; leida: boolean
}
export interface DashboardData {
  rol: Role
  indicadores: { clave: string; etiqueta: string; valor: number }[]
  actividad: { tipo: string; mensaje: string; fecha: string }[]
  notificaciones_pendientes: number
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function messageFromDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const issue = detail[0] as { msg?: unknown; loc?: unknown }
    if (typeof issue?.msg === "string") {
      const location = Array.isArray(issue.loc) ? String(issue.loc.at(-1) ?? "") : ""
      return location ? `${location}: ${issue.msg}` : issue.msg
    }
  }
  return fallback
}

function messageFromResponse(status: number, detail: unknown, fallback: string): string {
  if (status === 401) return "Tu sesión expiró o las credenciales no son válidas. Vuelve a ingresar."
  if (status === 403) return "No tienes permisos para realizar esta acción."
  if (status === 409) return messageFromDetail(detail, "El registro ya existe o no permite esta operación.")
  if (status === 422) return messageFromDetail(detail, "Revisa los datos enviados.")
  return messageFromDetail(detail, fallback)
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null)
  return messageFromResponse(
    response.status,
    (body as { detail?: unknown } | null)?.detail,
    fallback,
  )
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) throw new ApiError(response.status, await readError(response, "No se pudo completar la solicitud."))
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function reportQuery(filters: ReportFilters, format?: "pdf" | "xlsx") {
  const params = new URLSearchParams()
  if (format) params.set("format", format)
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  return params
}

export const api = {
  login: (identificador: string, contrasena: string) =>
    request<LoginOutput>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ identificador, contrasena }),
    }),
  me: () => request<LoginOutput>("/api/v1/auth/me"),
  logout: () => request<void>("/api/v1/auth/logout", { method: "POST" }),
  changePassword: (contrasena_actual: string, contrasena_nueva: string) =>
    request<User>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ contrasena_actual, contrasena_nueva }),
    }),
  readProfile: () => request<User>("/api/v1/profile/me"),
  updatePhone: (telefono: string) =>
    request<User>("/api/v1/profile/me", {
      method: "PATCH",
      body: JSON.stringify({ telefono }),
    }),
  listUsers: (query = "") =>
    request<User[]>(
      `/api/v1/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
    ),
  createUser: (user: UserInput) =>
    request<User & { contrasena_temporal: string }>("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify(user),
    }),
  updateUser: (id: string, data: UserUpdateInput) =>
    request<User>(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  resetPassword: (id: string) =>
    request<{ contrasena_temporal: string }>(`/api/v1/admin/users/${id}/reset-password`, {
      method: "POST",
    }),
  listCareers: () => request<Career[]>("/api/v1/admin/careers"),
  listFaculties: () => request<Faculty[]>("/api/v1/admin/faculties"),
  createFaculty: (data: Pick<Faculty, "codigo" | "nombre">) =>
    request<Faculty>("/api/v1/admin/faculties", { method: "POST", body: JSON.stringify(data) }),
  updateFaculty: (id: string, data: Partial<Pick<Faculty, "codigo" | "nombre" | "activo">>) =>
    request<Faculty>(`/api/v1/admin/faculties/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteFaculty: (id: string) => request<void>(`/api/v1/admin/faculties/${id}`, { method: "DELETE"}),
  createCareer: (data: Pick<Career, "codigo" | "nombre" | "facultad_id">) =>
    request<Career>("/api/v1/admin/careers", { method: "POST", body: JSON.stringify(data) }),
  updateCareer: (id: string, data: Partial<Pick<Career, "codigo" | "nombre" | "activo" | "facultad_id">>) =>
    request<Career>(`/api/v1/admin/careers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCareer: (id: string) =>
    request<void>(`/api/v1/admin/careers/${id}`, { method: "DELETE" }),
  listSubjects: () => request<Subject[]>("/api/v1/admin/subjects"),
  createSubject: (data: Pick<Subject, "codigo" | "nombre">) =>
    request<Subject>("/api/v1/admin/subjects", { method: "POST", body: JSON.stringify(data) }),
  updateSubject: (id: string, data: Partial<Pick<Subject, "codigo" | "nombre" | "activo">>) =>
    request<Subject>(`/api/v1/admin/subjects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSubject: (id: string) =>
    request<void>(`/api/v1/admin/subjects/${id}`, { method: "DELETE" }),
  listPlans: () => request<StudyPlan[]>("/api/v1/admin/plans"),
  createPlan: (data: { carrera_id: string; codigo: string; modalidad: PlanModality }) =>
    request<StudyPlan>("/api/v1/admin/plans", { method: "POST", body: JSON.stringify(data) }),
  duplicatePlan: (id: string, codigo: string) =>
    request<StudyPlan>(`/api/v1/admin/plans/${id}/duplicate`, { method: "POST", body: JSON.stringify({ codigo }) }),
  updatePlan: (id: string, data: { codigo?: string; estado?: PlanState }) =>
    request<StudyPlan>(`/api/v1/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePlan: (id: string) => request<void>(`/api/v1/admin/plans/${id}`, { method: "DELETE" }),
  createPlanUnit: (planId: string, data: { numero: number; nombre: string }) =>
    request<PlanUnit>(`/api/v1/admin/plans/${planId}/units`, { method: "POST", body: JSON.stringify(data) }),
  generatePlanUnits: (planId: string, data: { cantidad: number; nombre_base?: string }) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/units/generate`, { method: "POST", body: JSON.stringify(data) }),
  renumberPlanUnits: (planId: string) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/units/renumber`, { method: "POST" }),
  updatePlanUnit: (planId: string, unitId: string, data: { numero?: number; nombre?: string }) =>
    request<PlanUnit>(`/api/v1/admin/plans/${planId}/units/${unitId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePlanUnit: (planId: string, unitId: string) =>
    request<void>(`/api/v1/admin/plans/${planId}/units/${unitId}`, { method: "DELETE" }),
  addPlanSubject: (planId: string, data: { materia_id: string; unidad_id: string }) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/subjects`, { method: "POST", body: JSON.stringify(data) }),
  addPlanSubjectsBulk: (planId: string, data: { materia_ids: string[]; unidad_id: string }) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/subjects/bulk`, { method: "POST", body: JSON.stringify(data) }),
  movePlanSubject: (planId: string, subjectPlanId: string, unidad_id: string) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/subjects/${subjectPlanId}`, { method: "PATCH", body: JSON.stringify({ unidad_id }) }),
  removePlanSubject: (planId: string, subjectPlanId: string) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/subjects/${subjectPlanId}`, { method: "DELETE" }),
  addPrerequisite: (planId: string, subjectPlanId: string, requisito_materia_plan_id: string) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/subjects/${subjectPlanId}/prerequisites`, { method: "POST", body: JSON.stringify({ requisito_materia_plan_id }) }),
  removePrerequisite: (planId: string, subjectPlanId: string, requirementId: string) =>
    request<StudyPlan>(`/api/v1/admin/plans/${planId}/subjects/${subjectPlanId}/prerequisites/${requirementId}`, { method: "DELETE" }),
  listStudentPlanAssignments: () => request<StudentPlan[]>("/api/v1/admin/students/plan-assignments"),
  assignStudentPlan: (studentId: string, plan_estudio_id: string, apertura_plan_id?: string) =>
    request<StudentPlan>(`/api/v1/admin/students/${studentId}/plan`, { method: "PUT", body: JSON.stringify({ plan_estudio_id, ...(apertura_plan_id ? { apertura_plan_id } : {}) }) }),
  assignStudentOpening: (studentId: string, apertura_plan_id: string) =>
    request<StudentPlan>(`/api/v1/admin/students/${studentId}/opening`, { method: "PUT", body: JSON.stringify({ apertura_plan_id }) }),
  listPlanOpenings: (planId: string) => request<PlanOpening[]>(`/api/v1/admin/plans/${planId}/openings`),
  listPeriods: () => request<AcademicPeriod[]>("/api/v1/admin/periods"),
  createPeriod: (data: Omit<AcademicPeriod, "id">) =>
    request<AcademicPeriod>("/api/v1/admin/periods", { method: "POST", body: JSON.stringify(data) }),
  getPeriodPlanning: (periodId: string) => request<PeriodPlanning>(`/api/v1/admin/periods/${periodId}/planning`),
  getPeriodSubjectOverview: (periodId: string) => request<PeriodSubjectOverview[]>(`/api/v1/admin/periods/${periodId}/planning/overview`),
  getPeriodCalendar: (periodId: string, weekStart: string) => request<CalendarSession[]>(`/api/v1/admin/periods/${periodId}/calendar?week_start=${encodeURIComponent(weekStart)}`),
  getPlanningAvailability: (date: string) => request<CalendarSession[]>(`/api/v1/admin/planning/availability?date=${encodeURIComponent(date)}`),
  getPlanningAvailabilityRange: (start: string, end: string) => request<PlanningBooking[]>(`/api/v1/admin/planning/availability-range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  setPeriodModularTemplate: (periodId: string, plantilla_modular_id: string) => request<PeriodPlanning>(`/api/v1/admin/periods/${periodId}/planning/modular-template`, { method: "PUT", body: JSON.stringify({ plantilla_modular_id }) }),
  addPeriodCareer: (periodId: string, carrera_id: string) => request<PeriodPlanning>(`/api/v1/admin/periods/${periodId}/careers`, { method: "POST", body: JSON.stringify({ carrera_id }) }),
  removePeriodCareer: (periodId: string, careerId: string) => request<PeriodPlanning>(`/api/v1/admin/periods/${periodId}/careers/${careerId}`, { method: "DELETE" }),
  addPeriodPlan: (periodId: string, plan_id: string) => request<PeriodPlanning>(`/api/v1/admin/periods/${periodId}/plans`, { method: "POST", body: JSON.stringify({ plan_id }) }),
  removePeriodPlan: (periodId: string, planId: string) => request<PeriodPlanning>(`/api/v1/admin/periods/${periodId}/plans/${planId}`, { method: "DELETE" }),
  createPlanOpening: (periodId: string, plan_id: string) => request<PlanOpening>(`/api/v1/admin/periods/${periodId}/openings`, { method: "POST", body: JSON.stringify({ plan_id }) }),
  removePlanOpening: (periodId: string, openingId: string) => request<void>(`/api/v1/admin/periods/${periodId}/openings/${openingId}`, { method: "DELETE" }),
  listPeriodOpenings: (periodId: string, planId: string) => request<PlanOpening[]>(`/api/v1/admin/periods/${periodId}/plans/${planId}/openings`),
  listSubjectSuggestions: (periodId: string, planId: string) => request<SubjectSuggestion[]>(`/api/v1/admin/periods/${periodId}/plans/${planId}/suggestions`),
  listCourses: () => request<Course[]>("/api/v1/courses"),
  listPlanningRooms: () => request<PlanningRoom[]>("/api/v1/admin/planning/rooms"),
  createPlanningRoom: (data: { codigo: string; capacidad: number }) => request<PlanningRoom>("/api/v1/admin/planning/rooms", { method: "POST", body: JSON.stringify(data) }),
  updatePlanningRoom: (codigo: string, data: { activa?: boolean; capacidad?: number }) => request<PlanningRoom>(`/api/v1/admin/planning/rooms/${encodeURIComponent(codigo)}`, { method: "PATCH", body: JSON.stringify(data) }),
  listScheduleBlocks: () => request<ScheduleBlock[]>("/api/v1/admin/planning/schedule-blocks"),
  createScheduleBlock: (data: Pick<ScheduleBlock, "turno" | "nombre" | "hora_inicio" | "hora_fin" | "predeterminado_modular">) => request<ScheduleBlock>("/api/v1/admin/planning/schedule-blocks", { method: "POST", body: JSON.stringify(data) }),
  updateScheduleBlock: (id: string, data: Partial<Pick<ScheduleBlock, "turno" | "nombre" | "hora_inicio" | "hora_fin" | "activo" | "predeterminado_modular">>) => request<ScheduleBlock>(`/api/v1/admin/planning/schedule-blocks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listModularTemplates: () => request<ModularTemplate[]>("/api/v1/admin/planning/modular-templates"),
  createModularTemplate: (data: Pick<ModularTemplate, "nombre" | "clases_por_modulo" | "minutos_por_clase">) => request<ModularTemplate>("/api/v1/admin/planning/modular-templates", { method: "POST", body: JSON.stringify(data) }),
  updateModularTemplate: (id: string, data: Partial<Pick<ModularTemplate, "nombre" | "clases_por_modulo" | "minutos_por_clase" | "activa">>) => request<ModularTemplate>(`/api/v1/admin/planning/modular-templates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  previewModularPlan: (periodId: string, data: ModularPlanInput) => request<ModularPlanPreview>(`/api/v1/admin/periods/${periodId}/modular/preview`, { method: "POST", body: JSON.stringify(data) }),
  createModularPlan: (periodId: string, data: ModularPlanInput) => request<Course[]>(`/api/v1/admin/periods/${periodId}/modular/courses`, { method: "POST", body: JSON.stringify(data) }),
  previewModularBatch: (periodId: string, data: ModularBatchInput) => request<ModularBatchPreview>(`/api/v1/admin/periods/${periodId}/modular/batch/preview`, { method: "POST", body: JSON.stringify(data) }),
  createModularBatch: (periodId: string, data: ModularBatchInput) => request<Course[]>(`/api/v1/admin/periods/${periodId}/modular/batch/courses`, { method: "POST", body: JSON.stringify(data) }),
  createCourse: (data: { materia_plan_id: string; periodo_id: string; paralelo: string; cupo: number; fecha_inicio: string; fecha_fin: string; docente_id?: string }) =>
    request<Course>("/api/v1/admin/courses", { method: "POST", body: JSON.stringify(data) }),
  updateCourse: (id: string, data: Partial<Pick<Course, "paralelo" | "cupo" | "fecha_inicio" | "fecha_fin" | "docente_id" | "activo">>) =>
    request<Course>(`/api/v1/admin/courses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  previewCourseUpdate: (id: string, data: Partial<Pick<Course, "paralelo" | "cupo" | "fecha_inicio" | "fecha_fin" | "docente_id">>) =>
    request<{ valido: boolean }>(`/api/v1/admin/courses/${id}/preview`, { method: "POST", body: JSON.stringify(data) }),
  replaceCourseSchedules: (id: string, horarios: Omit<CourseSchedule, "id">[]) =>
    request<Course>(`/api/v1/admin/courses/${id}/schedules`, { method: "PUT", body: JSON.stringify({ horarios }) }),
  validateCourseSchedules: (id: string, horarios: Omit<CourseSchedule, "id">[]) =>
    request<{ valido: boolean }>(`/api/v1/admin/courses/${id}/schedules/validate`, { method: "POST", body: JSON.stringify({ horarios }) }),
  setCourseRegistration: (id: string, inscripcion_abierta: boolean) =>
    request<Course>(`/api/v1/admin/courses/${id}/registration`, { method: "PATCH", body: JSON.stringify({ inscripcion_abierta }) }),
  setPeriodCourseRegistration: (periodId: string, courseIds: string[], inscripcion_abierta: boolean) =>
    request<Course[]>(`/api/v1/admin/periods/${periodId}/courses/registration`, { method: "PATCH", body: JSON.stringify({ curso_ids: courseIds, inscripcion_abierta }) }),
  deleteCourse: (id: string) => request<void>(`/api/v1/admin/courses/${id}`, { method: "DELETE" }),
  listHolidays: (periodId: string) => request<Holiday[]>(`/api/v1/admin/periods/${periodId}/holidays`),
  createHoliday: (periodId: string, data: { fecha: string; descripcion: string }) =>
    request<Holiday>(`/api/v1/admin/periods/${periodId}/holidays`, { method: "POST", body: JSON.stringify(data) }),
  deleteHoliday: (periodId: string, holidayId: string) =>
    request<void>(`/api/v1/admin/periods/${periodId}/holidays/${holidayId}`, { method: "DELETE" }),
  listExceptions: (courseId: string) => request<ScheduleException[]>(`/api/v1/admin/courses/${courseId}/exceptions`),
  createException: (courseId: string, data: { fecha_original: string; tipo: ScheduleExceptionType; fecha_reprogramada?: string; hora_inicio?: string; hora_fin?: string; aula?: string; motivo?: string }) =>
    request<ScheduleException>(`/api/v1/admin/courses/${courseId}/exceptions`, { method: "POST", body: JSON.stringify(data) }),
  deleteException: (courseId: string, exceptionId: string) =>
    request<void>(`/api/v1/admin/courses/${courseId}/exceptions/${exceptionId}`, { method: "DELETE" }),
  listAuthorizations: (periodId: string) =>
    request<StudentAuthorization[]>(`/api/v1/admin/periods/${periodId}/authorizations`),
  setAuthorization: (periodId: string, studentId: string, activa: boolean) =>
    request<StudentAuthorization>(`/api/v1/admin/periods/${periodId}/students/${studentId}/authorization`, { method: "PUT", body: JSON.stringify({ activa }) }),
  studentOffer: () => request<CourseOffer[]>("/api/v1/student/offer"),
  studentEnrollments: () => request<Enrollment[]>("/api/v1/student/enrollments"),
  enrollInCourse: (curso_id: string) =>
    request<Enrollment>("/api/v1/student/enrollments", { method: "POST", body: JSON.stringify({ curso_id }) }),
  teacherGradebook: () => request<GradeWorkItem[]>("/api/v1/teacher/grades"),
  registerGrade: (enrollmentId: string, nota_final: number) =>
    request<Grade>(`/api/v1/teacher/enrollments/${enrollmentId}/grade`, { method: "POST", body: JSON.stringify({ nota_final }) }),
  correctGrade: (enrollmentId: string, nota_final: number) =>
    request<Grade>(`/api/v1/teacher/enrollments/${enrollmentId}/grade`, { method: "PUT", body: JSON.stringify({ nota_final }) }),
  studentGrades: () => request<Grade[]>("/api/v1/student/grades"),
  dashboard: () => request<DashboardData>("/api/v1/dashboard"),
  listNotifications: (limit = 50) => request<AcademicNotification[]>(`/api/v1/notifications?limit=${limit}`),
  markNotificationRead: (id: string) =>
    request<AcademicNotification>(`/api/v1/notifications/${id}/read`, { method: "PATCH" }),
  previewReport: (code: ReportCode, filters: ReportFilters, signal?: AbortSignal) =>
    request<ReportPreview>(`/api/v1/reports/${code}/preview?${reportQuery(filters).toString()}`, { signal }),
  exportReport: async (code: ReportCode, format: "pdf" | "xlsx", filters: ReportFilters) => {
    const query = reportQuery(filters, format)
    const response = await fetch(`/api/v1/reports/${code}/export?${query.toString()}`, { credentials: "include" })
    if (!response.ok) {
      throw new ApiError(response.status, await readError(response, "No se pudo generar el reporte."))
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${code}.${format}`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
}
