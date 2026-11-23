import { useEffect, useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type { User } from "../../api/client"
import { useAuth } from "../auth/AuthContext"
import { AppShell, PageLoading, RoleChip } from "../shared/AppShell"
import { Icon } from "../shared/icons"
import { ButtonLabel, Field, Notices, PageHeader } from "../shared/ui"
import { messageOf, phoneSchema } from "../shared/validation"

export function ProfilePage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<User | null>(null)
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  useEffect(() => {
    void api.readProfile().then((value) => {
      setProfile(value)
      setPhone(value.telefono)
    }).catch((reason: Error) => setError(reason.message))
  }, [])

  async function savePhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    setError("")
    const invalid = messageOf(phoneSchema, phone)
    setPhoneError(invalid)
    if (invalid) return
    setSaving(true)
    try {
      const updated = await api.updatePhone(phone)
      setProfile(updated)
      setMessage("Teléfono actualizado.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.")
    } finally {
      setSaving(false)
    }
  }

  if (!profile || !user) return <AppShell><PageLoading>Cargando perfil…</PageLoading></AppShell>

  const details: { icon: "idcard" | "mail" | "phone"; label: string; value: string }[] = [
    { icon: "idcard", label: "CI", value: profile.ci },
    { icon: "mail", label: "Correo", value: profile.correo },
    { icon: "phone", label: "Teléfono", value: profile.telefono },
  ]

  return (
    <AppShell>
      <PageHeader eyebrow="MI CUENTA" title="Mi perfil" description="Consulta tus datos personales y actualiza tu teléfono." />
      <Notices notice={message} error={error} />

      <div className="pf-layout">
        <section className="ui-card pf-identity" aria-labelledby="pf-name">
          <div className="pf-avatar" aria-hidden="true">{profile.nombres.charAt(0)}{profile.apellidos.charAt(0)}</div>
          <h2 id="pf-name">{profile.nombres} {profile.apellidos}</h2>
          <RoleChip rol={profile.rol} principal={profile.es_administrador_principal} />
          <dl className="pf-details">
            {details.map((item) => (
              <div key={item.label}>
                <span className="pf-detail-icon"><Icon name={item.icon} size={18} /></span>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="ui-card pf-edit" aria-labelledby="pf-edit-title">
          <h2 id="pf-edit-title">Actualizar teléfono</h2>
          <p className="pf-note">Los demás datos se corrigen mediante administración autorizada.</p>
          <form noValidate onSubmit={(event) => void savePhone(event)}>
            <Field id="phone" label="Teléfono" hint="Entre 5 y 40 caracteres." error={phoneError}>
              <input id="phone" className="ui-input" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError(null) }} required minLength={5} maxLength={40} autoComplete="tel" aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? "phone-error phone-hint" : "phone-hint"} />
            </Field>
            <div>
              <button className="ui-btn ui-btn-primary" type="submit" disabled={saving}>
                {saving ? "Guardando…" : <ButtonLabel icon="check">Guardar cambios</ButtonLabel>}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  )
}
