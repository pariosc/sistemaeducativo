import { useEffect, useState } from "react"

import { api, type User } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AdminNavigation } from "../shared/AdminNavigation"
import { messageOf, phoneSchema } from "../shared/validation"

export function ProfilePage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<User | null>(null)
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [phoneError, setPhoneError] = useState<string | null>(null)

  useEffect(() => {
    void api.readProfile().then((value) => {
      setProfile(value)
      setPhone(value.telefono)
    }).catch((reason: Error) => setError(reason.message))
  }, [])

  async function savePhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    setError("")
    const invalid = messageOf(phoneSchema, phone)
    setPhoneError(invalid)
    if (invalid) return
    try {
      const updated = await api.updatePhone(phone)
      setProfile(updated)
      setMessage("Teléfono actualizado.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.")
    }
  }

  if (!profile || !user) return <main className="simple-page"><p className="loading-copy">Cargando perfil…</p></main>
  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap">
        <span className="eyebrow">MI CUENTA</span>
        <h1>Mi perfil</h1>
        <p className="section-intro">Consulta tus datos personales y actualiza tu teléfono.</p>
        <div className="profile-grid">
          <div className="profile-card">
            <div className="avatar">{profile.nombres.charAt(0)}{profile.apellidos.charAt(0)}</div>
            <h2>{profile.nombres} {profile.apellidos}</h2>
            <span className="role-badge">{profile.es_administrador_principal ? "ADMINISTRADOR PRINCIPAL" : profile.rol}</span>
            <dl className="profile-details">
              <div><dt>CI</dt><dd>{profile.ci}</dd></div>
              <div><dt>Correo</dt><dd>{profile.correo}</dd></div>
              <div><dt>Teléfono</dt><dd>{profile.telefono}</dd></div>
            </dl>
          </div>
          <div className="profile-card">
            <h2>Actualizar teléfono</h2>
            <p>Los demás datos se corrigen mediante administración autorizada.</p>
            <form className="stack-form" noValidate onSubmit={(event) => void savePhone(event)}>
              <label htmlFor="phone">Teléfono</label>
              <input id="phone" className="form-input" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError(null) }} required minLength={5} maxLength={40} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? "phone-error" : undefined} />
              {phoneError && <p id="phone-error" role="alert" className="field-error">{phoneError}</p>}
              {message && <p role="status" className="success-note">{message}</p>}
              {error && <p role="alert" className="form-alert">{error}</p>}
              <button className="primary-button" type="submit">Guardar cambios</button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
