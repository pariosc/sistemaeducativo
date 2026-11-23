import { useEffect, useState } from "react"

import { api, type Role, type User } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AdminNavigation } from "../shared/AdminNavigation"
import { ciSchema, emailSchema, messageOf, personNameSchema, phoneSchema } from "../shared/validation"

const emptyForm = { ci: "", nombres: "", apellidos: "", correo: "", telefono: "", rol: "DOCENTE" as Role }

export function AdminUsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState(emptyForm)
  const [temporaryPassword, setTemporaryPassword] = useState("")
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)

  const reload = () => api.listUsers().then(setUsers).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  useEffect(() => { void reload() }, [])

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    const errors = {
      ci: messageOf(ciSchema, form.ci),
      nombres: messageOf(personNameSchema, form.nombres),
      apellidos: messageOf(personNameSchema, form.apellidos),
      correo: messageOf(emailSchema, form.correo),
      telefono: messageOf(phoneSchema, form.telefono),
    }
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) return
    try {
      const created = await api.createUser({ ...form, ci: form.ci.trim().toUpperCase(), correo: form.correo.trim().toLowerCase() })
      setTemporaryPassword(created.contrasena_temporal)
      setForm(emptyForm)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la cuenta.")
    }
  }

  async function toggleActive(target: User) {
    try {
      await api.updateUser(target.id, { activo: !target.activo })
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la cuenta.")
    }
  }

  async function editIdentity(target: User) {
    const nombres = window.prompt("Nombres", target.nombres)
    if (nombres === null) return
    const apellidos = window.prompt("Apellidos", target.apellidos)
    if (apellidos === null) return
    const ci = window.prompt("CI", target.ci)
    if (ci === null) return
    const errors = [
      messageOf(personNameSchema, nombres),
      messageOf(personNameSchema, apellidos),
      messageOf(ciSchema, ci),
    ].filter((value): value is string => Boolean(value))
    if (errors.length > 0) { setError(errors.join(" ")); return }
    try {
      await api.updateUser(target.id, { nombres: nombres.trim(), apellidos: apellidos.trim(), ci: ci.trim().toUpperCase() })
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron corregir los datos.")
    }
  }

  async function resetPassword(target: User) {
    if (!window.confirm(`¿Restablecer la contraseña de ${target.nombres} ${target.apellidos}?`)) return
    try {
      const result = await api.resetPassword(target.id)
      setTemporaryPassword(result.contrasena_temporal)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo restablecer la contraseña.")
    }
  }

  if (loading) return <main className="simple-page"><p className="loading-copy">Cargando usuarios…</p></main>
  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap">
        <span className="eyebrow">ADMINISTRACIÓN</span>
        <h1>Usuarios</h1>
        <p className="section-intro">Crea y administra las cuentas según tus permisos.</p>
        {error && <p role="alert" className="form-alert">{error}</p>}
        <div className="profile-grid users-grid">
          <section className="profile-card">
            <h2>Crear cuenta</h2>
            <form className="stack-form" noValidate onSubmit={(event) => void createUser(event)}>
              <label>CI<input className="form-input" value={form.ci} onChange={(e) => { setForm({ ...form, ci: e.target.value }); setFieldErrors((current) => ({ ...current, ci: null })) }} maxLength={32} required aria-invalid={Boolean(fieldErrors.ci)} /></label>
              {fieldErrors.ci && <span className="field-error">{fieldErrors.ci}</span>}
              <label>Nombres<input className="form-input" value={form.nombres} onChange={(e) => { setForm({ ...form, nombres: e.target.value }); setFieldErrors((current) => ({ ...current, nombres: null })) }} maxLength={120} required aria-invalid={Boolean(fieldErrors.nombres)} /></label>
              {fieldErrors.nombres && <span className="field-error">{fieldErrors.nombres}</span>}
              <label>Apellidos<input className="form-input" value={form.apellidos} onChange={(e) => { setForm({ ...form, apellidos: e.target.value }); setFieldErrors((current) => ({ ...current, apellidos: null })) }} maxLength={120} required aria-invalid={Boolean(fieldErrors.apellidos)} /></label>
              {fieldErrors.apellidos && <span className="field-error">{fieldErrors.apellidos}</span>}
              <label>Correo<input className="form-input" type="email" value={form.correo} onChange={(e) => { setForm({ ...form, correo: e.target.value }); setFieldErrors((current) => ({ ...current, correo: null })) }} maxLength={254} required aria-invalid={Boolean(fieldErrors.correo)} /></label>
              {fieldErrors.correo && <span className="field-error">{fieldErrors.correo}</span>}
              <label>Teléfono<input className="form-input" value={form.telefono} onChange={(e) => { setForm({ ...form, telefono: e.target.value }); setFieldErrors((current) => ({ ...current, telefono: null })) }} maxLength={40} required aria-invalid={Boolean(fieldErrors.telefono)} /></label>
              {fieldErrors.telefono && <span className="field-error">{fieldErrors.telefono}</span>}
              <label>Rol<select className="form-input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Role })}>
                <option value="DOCENTE">Docente</option><option value="ESTUDIANTE">Estudiante</option>
                {user?.es_administrador_principal && <option value="ADMINISTRADOR">Administrador</option>}
              </select></label>
              <button className="primary-button" type="submit">Crear cuenta</button>
            </form>
          </section>
          <section className="profile-card users-table-card">
            <h2>Cuentas registradas</h2>
            <div className="table-scroll"><table>
              <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>{users.map((item) => <tr key={item.id}>
                <td><strong>{item.nombres} {item.apellidos}</strong><small>{item.correo}<br />CI {item.ci}</small></td>
                <td>{item.es_administrador_principal ? "Principal" : item.rol}</td>
                <td><span className={item.activo ? "status-active" : "status-inactive"}>{item.activo ? "Activa" : "Inactiva"}</span></td>
                <td><div className="table-actions">
                  {!item.es_administrador_principal && <button className="text-action" onClick={() => void editIdentity(item)}>Corregir identidad</button>}
                  {!item.es_administrador_principal && <button className="text-action" onClick={() => void toggleActive(item)}>{item.activo ? "Inactivar" : "Activar"}</button>}
                  {!item.es_administrador_principal && <button className="text-action" onClick={() => void resetPassword(item)}>Restablecer clave</button>}
                </div></td>
              </tr>)}</tbody>
            </table></div>
          </section>
        </div>
      </section>
      {temporaryPassword && <div className="modal-backdrop" role="presentation"><section className="temporary-modal" role="dialog" aria-modal="true" aria-labelledby="temporary-title">
        <span className="eyebrow">ACCESO TEMPORAL</span><h2 id="temporary-title">Contraseña temporal</h2>
        <p>Entrégala al titular por un canal seguro. No volverá a mostrarse y deberá cambiarla al ingresar.</p>
        <code className="temporary-secret">{temporaryPassword}</code>
        <button className="primary-button" onClick={() => setTemporaryPassword("")}>Listo, ya la guardé</button>
      </section></div>}
    </main>
  )
}
