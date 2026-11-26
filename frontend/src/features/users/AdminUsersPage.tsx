import { useEffect, useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type { PlanOpening, Role, StudyPlan, User, UserUpdateInput } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AppShell, PageLoading, RoleChip } from "../shared/AppShell"
import { Icon } from "../shared/icons"
import { Modal } from "../shared/Modal"
import { ButtonLabel, ConfirmDialog, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { ciSchema, emailSchema, messageOf, personNameSchema, phoneSchema } from "../shared/validation"

type RoleFilter = "all" | Role
type Dialog =
  | { kind: "create" }
  | { kind: "detail"; target: User }
  | { kind: "edit"; target: User }
  | { kind: "reset"; target: User }

type DetailForm = {
  direccion: string
  fecha_nacimiento: string
  titulo: string
  especialidad: string
  plan_estudio_id: string
  apertura_plan_id: string
}
type CreateForm = {
  ci: string
  nombres: string
  apellidos: string
  correo: string
  telefono: string
  rol: Role
} & DetailForm
type EditForm = {
  ci: string
  nombres: string
  apellidos: string
  telefono: string
} & DetailForm

const emptyDetail: DetailForm = {
  direccion: "",
  fecha_nacimiento: "",
  titulo: "",
  especialidad: "",
  plan_estudio_id: "",
  apertura_plan_id: "",
}
const optional = (value: string) => value.trim() || undefined

const FILTERS: { id: RoleFilter; label: string }[] = [
  { id: "all", label: "Todos" }, { id: "ADMINISTRADOR", label: "Administradores" }, { id: "DOCENTE", label: "Docentes" }, { id: "ESTUDIANTE", label: "Estudiantes" },
]
const fullName = (target: User) => `${target.nombres} ${target.apellidos}`

export function AdminUsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [temporaryPassword, setTemporaryPassword] = useState("")
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [dialogError, setDialogError] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<RoleFilter>("all")
  const [query, setQuery] = useState("")

  const reload = () => api.listUsers(query).then(setUsers)
  useEffect(() => {
    void api.listPlans().then((items) => setPlans(items.filter((item) => item.estado !== "INACTIVO"))).catch(() => setPlans([]))
  }, [])
  useEffect(() => {
    setLoading(true)
    void reload().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [query])

  async function run(action: () => Promise<unknown>, success: string, scope: "page" | "dialog"): Promise<boolean> {
    setBusy(true); setError(""); setDialogError(""); setNotice("")
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
  function openDialog(next: Dialog) { setDialogError(""); setDialog(next) }
  function closeDialog() { setDialog(null); setDialogError("") }

  async function createUser(form: CreateForm) {
    let secret = ""
    const payload = {
      ci: form.ci.trim().toUpperCase(),
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      correo: form.correo.trim().toLowerCase(),
      telefono: form.telefono.trim(),
      direccion: optional(form.direccion),
      fecha_nacimiento: optional(form.fecha_nacimiento),
      titulo: form.rol === "DOCENTE" ? optional(form.titulo) : undefined,
      especialidad: form.rol === "DOCENTE" ? optional(form.especialidad) : undefined,
      plan_estudio_id: form.rol === "ESTUDIANTE" ? optional(form.plan_estudio_id) : undefined,
      apertura_plan_id: form.rol === "ESTUDIANTE" ? optional(form.apertura_plan_id) : undefined,
      rol: form.rol,
    }
    const ok = await run(async () => { secret = (await api.createUser(payload)).contrasena_temporal }, `Cuenta creada para ${form.nombres} ${form.apellidos}.`, "dialog")
    if (ok) { closeDialog(); setTemporaryPassword(secret) }
  }
  async function editUser(target: User, form: EditForm) {
    const data: UserUpdateInput = {
      ci: form.ci.trim().toUpperCase(),
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      telefono: form.telefono.trim(),
    }
    if (optional(form.direccion)) data.direccion = optional(form.direccion)
    if (optional(form.fecha_nacimiento)) data.fecha_nacimiento = optional(form.fecha_nacimiento)
    if (target.rol === "DOCENTE") {
      if (optional(form.titulo)) data.titulo = optional(form.titulo)
      if (optional(form.especialidad)) data.especialidad = optional(form.especialidad)
    }
    if (target.rol === "ESTUDIANTE") {
      if (optional(form.plan_estudio_id)) data.plan_estudio_id = optional(form.plan_estudio_id)
      if (optional(form.apertura_plan_id)) data.apertura_plan_id = optional(form.apertura_plan_id)
    }
    if (await run(() => api.updateUser(target.id, data), `Datos de ${form.nombres} ${form.apellidos} corregidos.`, "dialog")) closeDialog()
  }
  async function resetPassword(target: User) {
    let secret = ""
    const ok = await run(async () => { secret = (await api.resetPassword(target.id)).contrasena_temporal }, `Contraseña de ${fullName(target)} restablecida.`, "dialog")
    if (ok) { closeDialog(); setTemporaryPassword(secret) }
  }
  const toggleActive = (target: User) => run(
    () => api.updateUser(target.id, { activo: !target.activo }),
    `Cuenta de ${fullName(target)} ${target.activo ? "inactivada" : "activada"}.`,
    "page",
  )

  const counts: Record<RoleFilter, number> = {
    all: users.length,
    ADMINISTRADOR: users.filter((item) => item.rol === "ADMINISTRADOR").length,
    DOCENTE: users.filter((item) => item.rol === "DOCENTE").length,
    ESTUDIANTE: users.filter((item) => item.rol === "ESTUDIANTE").length,
  }
  const visible = users.filter((item) => filter === "all" || item.rol === filter)

  if (loading) return <AppShell><PageLoading>Cargando usuarios…</PageLoading></AppShell>

  return (
    <AppShell>
      <PageHeader
        eyebrow="ADMINISTRACIÓN"
        title="Usuarios"
        description="Crea y administra las cuentas según tus permisos."
        actions={<button type="button" className="ui-btn ui-btn-primary" onClick={() => openDialog({ kind: "create" })}><ButtonLabel icon="plus">Nuevo usuario</ButtonLabel></button>}
      />
      <Notices notice={notice} error={error} />

      <dl className="us-tiles" aria-label="Resumen de cuentas">
        <div><dt>Cuentas</dt><dd>{counts.all}</dd></div>
        <div><dt>Administradores</dt><dd>{counts.ADMINISTRADOR}</dd></div>
        <div><dt>Docentes</dt><dd>{counts.DOCENTE}</dd></div>
        <div><dt>Estudiantes</dt><dd>{counts.ESTUDIANTE}</dd></div>
      </dl>

      <section className="ui-card us-card" aria-label="Cuentas registradas">
        <div className="us-toolbar">
          <div className="ap-segment" role="group" aria-label="Filtrar por rol">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className="ap-segment-btn" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label} <span className="ui-count">{counts[item.id]}</span>
              </button>
            ))}
          </div>
          <div className="ui-field us-search">
            <label htmlFor="user-search">Buscar por nombre, CI, correo, carrera, plan, grupo o datos profesionales</label>
            <input id="user-search" type="search" className="ui-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. Psicología, plan PSI, Magíster, Av. Banzer" />
          </div>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: 20 }}><EmptyState icon="users" title="Aún no hay cuentas">Crea la primera con «Nuevo usuario».</EmptyState></div>
        ) : visible.length === 0 ? (
          <p className="ap-loading" role="status">Ninguna cuenta coincide con el filtro.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <caption className="ui-visually-hidden">Cuentas registradas</caption>
              <thead><tr><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="ui-cell-strong">{fullName(item)}</span>
                      <span className="us-sub">{item.correo}</span>
                      <span className="us-sub">CI {item.ci}</span>
                    </td>
                    <td><RoleChip rol={item.rol} principal={item.es_administrador_principal} /></td>
                    <td><StatusBadge tone={item.activo ? "green" : "gray"}>{item.activo ? "Activa" : "Inactiva"}</StatusBadge></td>
                    <td>
                      {item.es_administrador_principal ? (
                        <span className="us-protected"><Icon name="shield" size={16} />Cuenta protegida</span>
                      ) : (
                        <div className="ui-row-actions">
                          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" aria-label={`Ver detalle de ${fullName(item)}`} onClick={() => openDialog({ kind: "detail", target: item })}><ButtonLabel icon="eye">Ver detalle</ButtonLabel></button>
                          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" aria-label={`Corregir datos de ${fullName(item)}`} onClick={() => openDialog({ kind: "edit", target: item })}><ButtonLabel icon="edit">Corregir datos</ButtonLabel></button>
                          {item.activo
                            ? <button type="button" className="ui-btn ui-btn-warning ui-btn-sm" disabled={busy} aria-label={`Inactivar a ${fullName(item)}`} onClick={() => void toggleActive(item)}><ButtonLabel icon="pause">Inactivar</ButtonLabel></button>
                            : <button type="button" className="ui-btn ui-btn-success-outline ui-btn-sm" disabled={busy} aria-label={`Activar a ${fullName(item)}`} onClick={() => void toggleActive(item)}><ButtonLabel icon="play">Activar</ButtonLabel></button>}
                          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" aria-label={`Restablecer clave de ${fullName(item)}`} onClick={() => openDialog({ kind: "reset", target: item })}><ButtonLabel icon="key">Restablecer clave</ButtonLabel></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog?.kind === "create" && <CreateUserDialog canCreateAdmin={Boolean(user?.es_administrador_principal)} plans={plans} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={(form) => void createUser(form)} />}
      {dialog?.kind === "detail" && <UserDetailDialog target={dialog.target} onClose={closeDialog} />}
      {dialog?.kind === "edit" && <EditUserDialog target={dialog.target} plans={plans} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={(form) => void editUser(dialog.target, form)} />}
      {dialog?.kind === "reset" && (
        <ConfirmDialog
          danger={false}
          title={`Restablecer la contraseña de ${fullName(dialog.target)}`}
          message="Se generará una contraseña temporal que reemplaza a la actual. La persona deberá cambiarla al ingresar."
          confirmLabel="Restablecer contraseña"
          busy={busy}
          error={dialogError}
          onClose={closeDialog}
          onConfirm={() => void resetPassword(dialog.target)}
        />
      )}
      {temporaryPassword && <TemporaryPasswordDialog secret={temporaryPassword} onDone={() => setTemporaryPassword("")} />}
    </AppShell>
  )
}

function DetailFields({ prefix, rol, form, plans, onChange }: {
  prefix: string
  rol: Role
  form: DetailForm
  plans: StudyPlan[]
  onChange: (patch: Partial<DetailForm>) => void
}) {
  const [openings, setOpenings] = useState<PlanOpening[]>([])
  useEffect(() => {
    if (rol !== "ESTUDIANTE" || !form.plan_estudio_id) { setOpenings([]); return }
    let active = true
    void api.listPlanOpenings(form.plan_estudio_id).then((items) => { if (active) setOpenings(items) }).catch(() => { if (active) setOpenings([]) })
    return () => { active = false }
  }, [rol, form.plan_estudio_id])

  return (
    <>
      <div className="ap-form-row">
        <Field id={`${prefix}-address`} label="Dirección" hint="Opcional, hasta 200 caracteres.">
          <input id={`${prefix}-address`} className="ui-input" value={form.direccion} onChange={(event) => onChange({ direccion: event.target.value })} maxLength={200} autoComplete="street-address" />
        </Field>
        <Field id={`${prefix}-birth`} label="Fecha de nacimiento" hint="Opcional.">
          <input id={`${prefix}-birth`} className="ui-input" type="date" value={form.fecha_nacimiento} onChange={(event) => onChange({ fecha_nacimiento: event.target.value })} />
        </Field>
      </div>
      {rol === "DOCENTE" && (
        <div className="ap-form-row">
          <Field id={`${prefix}-title`} label="Título" hint="Opcional, hasta 120 caracteres.">
            <input id={`${prefix}-title`} className="ui-input" value={form.titulo} onChange={(event) => onChange({ titulo: event.target.value })} maxLength={120} />
          </Field>
          <Field id={`${prefix}-specialty`} label="Especialidad" hint="Opcional, hasta 120 caracteres.">
            <input id={`${prefix}-specialty`} className="ui-input" value={form.especialidad} onChange={(event) => onChange({ especialidad: event.target.value })} maxLength={120} />
          </Field>
        </div>
      )}
      {rol === "ESTUDIANTE" && (
        <>
          <Field id={`${prefix}-plan`} label="Carrera y plan" hint="Opcional. Solo planes vigentes o en borrador.">
            <select id={`${prefix}-plan`} className="ui-select" value={form.plan_estudio_id} onChange={(event) => onChange({ plan_estudio_id: event.target.value, apertura_plan_id: "" })}>
              <option value="">Sin asignar</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.carrera_nombre} — {plan.codigo} ({plan.modalidad})</option>)}
            </select>
          </Field>
          <Field id={`${prefix}-opening`} label="Grupo de ingreso" hint="Opcional. Debe pertenecer al plan elegido.">
            <select id={`${prefix}-opening`} className="ui-select" value={form.apertura_plan_id} disabled={!form.plan_estudio_id || openings.length === 0} onChange={(event) => onChange({ apertura_plan_id: event.target.value })}>
              <option value="">Sin grupo</option>
              {openings.map((opening) => <option key={opening.id} value={opening.id}>{opening.codigo} · {opening.periodo_denominacion}</option>)}
            </select>
          </Field>
        </>
      )}
    </>
  )
}

function CreateUserDialog({ canCreateAdmin, plans, busy, error, onClose, onSubmit }: {
  canCreateAdmin: boolean
  plans: StudyPlan[]
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (form: CreateForm) => void
}) {
  const [form, setForm] = useState<CreateForm>({ ci: "", nombres: "", apellidos: "", correo: "", telefono: "", rol: "DOCENTE", ...emptyDetail })
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const set = (patch: Partial<CreateForm>) => setForm((current) => ({ ...current, ...patch }))
  const change = (key: keyof CreateForm, value: string) => { set({ [key]: value } as Partial<CreateForm>); setErrors((current) => ({ ...current, [key]: null })) }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = {
      ci: messageOf(ciSchema, form.ci),
      nombres: messageOf(personNameSchema, form.nombres),
      apellidos: messageOf(personNameSchema, form.apellidos),
      correo: messageOf(emailSchema, form.correo),
      telefono: messageOf(phoneSchema, form.telefono),
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    onSubmit(form)
  }
  const describe = (key: string) => (errors[key] ? `user-${key}-error` : undefined)
  return (
    <Modal title="Nuevo usuario" description="Se generará una contraseña temporal que verás una sola vez. Identidad y teléfono son obligatorios; los demás datos puedes completarlos después." onClose={onClose} locked={busy}>
      <form noValidate onSubmit={submit}>
        <DialogError error={error} />
        <Field id="user-role" label="Rol">
          <select id="user-role" className="ui-select" value={form.rol} onChange={(event) => set({ rol: event.target.value as Role })} data-autofocus="">
            <option value="DOCENTE">Docente</option><option value="ESTUDIANTE">Estudiante</option>
            {canCreateAdmin && <option value="ADMINISTRADOR">Administrador</option>}
          </select>
        </Field>
        <div className="ap-form-row">
          <Field id="user-ci" label="CI" error={errors.ci}><input id="user-ci" className="ui-input" value={form.ci} onChange={(event) => change("ci", event.target.value)} maxLength={32} required autoComplete="off" aria-invalid={Boolean(errors.ci)} aria-describedby={describe("ci")} /></Field>
          <Field id="user-phone" label="Teléfono" error={errors.telefono}><input id="user-phone" className="ui-input" value={form.telefono} onChange={(event) => change("telefono", event.target.value)} maxLength={40} required autoComplete="off" aria-invalid={Boolean(errors.telefono)} aria-describedby={errors.telefono ? "user-phone-error" : undefined} /></Field>
        </div>
        <div className="ap-form-row">
          <Field id="user-names" label="Nombres" error={errors.nombres}><input id="user-names" className="ui-input" value={form.nombres} onChange={(event) => change("nombres", event.target.value)} maxLength={120} required autoComplete="off" aria-invalid={Boolean(errors.nombres)} aria-describedby={errors.nombres ? "user-names-error" : undefined} /></Field>
          <Field id="user-surnames" label="Apellidos" error={errors.apellidos}><input id="user-surnames" className="ui-input" value={form.apellidos} onChange={(event) => change("apellidos", event.target.value)} maxLength={120} required autoComplete="off" aria-invalid={Boolean(errors.apellidos)} aria-describedby={errors.apellidos ? "user-surnames-error" : undefined} /></Field>
        </div>
        <Field id="user-mail" label="Correo" error={errors.correo}><input id="user-mail" className="ui-input" type="email" value={form.correo} onChange={(event) => change("correo", event.target.value)} maxLength={254} required autoComplete="off" aria-invalid={Boolean(errors.correo)} aria-describedby={errors.correo ? "user-mail-error" : undefined} /></Field>
        <DetailFields prefix="user" rol={form.rol} form={form} plans={plans} onChange={set} />
        <FormActions busy={busy} onClose={onClose} submitLabel="Crear cuenta" icon="check" />
      </form>
    </Modal>
  )
}

function EditUserDialog({ target, plans, busy, error, onClose, onSubmit }: {
  target: User
  plans: StudyPlan[]
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (form: EditForm) => void
}) {
  const [form, setForm] = useState<EditForm>({
    ...emptyDetail,
    nombres: target.nombres,
    apellidos: target.apellidos,
    ci: target.ci,
    telefono: target.telefono,
    direccion: target.direccion ?? "",
    fecha_nacimiento: target.fecha_nacimiento ?? "",
    titulo: target.titulo ?? "",
    especialidad: target.especialidad ?? "",
    plan_estudio_id: target.plan_estudio_id ?? "",
    apertura_plan_id: target.apertura_plan_id ?? "",
  })
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const set = (patch: Partial<EditForm>) => setForm((current) => ({ ...current, ...patch }))
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = {
      nombres: messageOf(personNameSchema, form.nombres),
      apellidos: messageOf(personNameSchema, form.apellidos),
      ci: messageOf(ciSchema, form.ci),
      telefono: messageOf(phoneSchema, form.telefono),
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    onSubmit(form)
  }
  return (
    <Modal title={`Corregir datos de ${fullName(target)}`} description="No cambia el correo ni el rol. Si el estudiante ya tiene inscripciones, el plan y el grupo se corrigen desde Planes de estudio." onClose={onClose} locked={busy}>
      <form noValidate onSubmit={submit}>
        <DialogError error={error} />
        <div className="ap-form-row">
          <Field id="edit-names" label="Nombres" error={errors.nombres}><input id="edit-names" className="ui-input" value={form.nombres} onChange={(event) => { set({ nombres: event.target.value }); setErrors((current) => ({ ...current, nombres: null })) }} maxLength={120} required autoComplete="off" aria-invalid={Boolean(errors.nombres)} aria-describedby={errors.nombres ? "edit-names-error" : undefined} data-autofocus="" /></Field>
          <Field id="edit-surnames" label="Apellidos" error={errors.apellidos}><input id="edit-surnames" className="ui-input" value={form.apellidos} onChange={(event) => { set({ apellidos: event.target.value }); setErrors((current) => ({ ...current, apellidos: null })) }} maxLength={120} required autoComplete="off" aria-invalid={Boolean(errors.apellidos)} aria-describedby={errors.apellidos ? "edit-surnames-error" : undefined} /></Field>
        </div>
        <div className="ap-form-row">
          <Field id="edit-ci" label="CI" error={errors.ci}><input id="edit-ci" className="ui-input" value={form.ci} onChange={(event) => { set({ ci: event.target.value }); setErrors((current) => ({ ...current, ci: null })) }} maxLength={32} required autoComplete="off" aria-invalid={Boolean(errors.ci)} aria-describedby={errors.ci ? "edit-ci-error" : undefined} /></Field>
          <Field id="edit-phone" label="Teléfono" error={errors.telefono}><input id="edit-phone" className="ui-input" value={form.telefono} onChange={(event) => { set({ telefono: event.target.value }); setErrors((current) => ({ ...current, telefono: null })) }} maxLength={40} required autoComplete="tel" aria-invalid={Boolean(errors.telefono)} aria-describedby={errors.telefono ? "edit-phone-error" : undefined} /></Field>
        </div>
        <DetailFields prefix="edit" rol={target.rol} form={form} plans={plans} onChange={set} />
        <FormActions busy={busy} onClose={onClose} submitLabel="Guardar cambios" icon="check" />
      </form>
    </Modal>
  )
}

function UserDetailDialog({ target, onClose }: { target: User; onClose: () => void }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "CI", value: target.ci },
    { label: "Correo", value: target.correo },
    { label: "Teléfono", value: target.telefono },
    { label: "Dirección", value: target.direccion },
    { label: "Fecha de nacimiento", value: target.fecha_nacimiento },
    { label: "Rol", value: target.rol },
    { label: "Estado de la cuenta", value: target.activo ? "Activa" : "Inactiva" },
    { label: "Debe cambiar contraseña", value: target.debe_cambiar_contrasena ? "Sí" : "No" },
  ]
  if (target.rol === "DOCENTE") {
    rows.push({ label: "Título", value: target.titulo })
    rows.push({ label: "Especialidad", value: target.especialidad })
  }
  if (target.rol === "ESTUDIANTE") {
    rows.push({ label: "Carrera", value: target.carrera_nombre })
    rows.push({ label: "Plan", value: target.plan_codigo })
    rows.push({ label: "Grupo de ingreso", value: target.apertura_codigo })
  }
  return (
    <Modal title={`Detalle de ${fullName(target)}`} description="Datos registrados para este usuario. Usa «Corregir datos» para editarlos." onClose={onClose}>
      <dl className="pf-details">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value || "No registrado"}</dd>
          </div>
        ))}
      </dl>
      <div className="ui-modal-actions">
        <button type="button" className="ui-btn ui-btn-primary" onClick={onClose} data-autofocus=""><ButtonLabel icon="check">Cerrar</ButtonLabel></button>
      </div>
    </Modal>
  )
}

/** La contraseña no vuelve a mostrarse: la ventana no se cierra con Esc ni con la X, solo con el botón final. */
function TemporaryPasswordDialog({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copyState, setCopyState] = useState<"" | "ok" | "fail">("")
  async function copy() {
    try { await navigator.clipboard.writeText(secret); setCopyState("ok") } catch { setCopyState("fail") }
  }
  return (
    <Modal title="Contraseña temporal" description="Entrégala al titular por un canal seguro. No volverá a mostrarse y deberá cambiarla al ingresar." onClose={onDone} locked>
      <div className="us-secret-box">
        <code className="us-secret" aria-label="Contraseña temporal">{secret}</code>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void copy()} data-autofocus=""><ButtonLabel icon="copy">Copiar</ButtonLabel></button>
      </div>
      <div role="status" aria-live="polite">
        {copyState === "ok" && <p className="ui-alert ui-alert-success ui-alert-flush">Contraseña copiada al portapapeles.</p>}
        {copyState === "fail" && <p className="ui-alert ui-alert-warning ui-alert-flush">No se pudo copiar automáticamente: selecciónala y cópiala manualmente.</p>}
      </div>
      <div className="ui-modal-actions">
        <button type="button" className="ui-btn ui-btn-primary" onClick={onDone}><ButtonLabel icon="check">Listo, ya la guardé</ButtonLabel></button>
      </div>
    </Modal>
  )
}
