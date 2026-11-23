import { useEffect, useState } from "react"
import type { FormEvent } from "react"

import { api } from "../../api/client"
import type { Career, Faculty, Subject } from "../../api/client"
import { Modal } from "../shared/Modal"
import { ButtonLabel, ConfirmDialog, DialogError, EmptyState, Field, FormActions, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { codeSchema, labelSchema, messageOf } from "../shared/validation"
import { CurriculumShell } from "./CurriculumShell"
import type { CurriculumSection } from "./CurriculumShell"

type CatalogItem = Career | Subject
type CatalogApi = {
  list: () => Promise<CatalogItem[]>
  create: (data: { codigo: string; nombre: string; facultad_id?: string }) => Promise<CatalogItem>
  update: (id: string, data: Partial<Pick<CatalogItem, "codigo" | "nombre" | "activo">> & { facultad_id?: string }) => Promise<CatalogItem>
  remove: (id: string) => Promise<void>
}
interface CatalogConfig {
  section: CurriculumSection
  title: string
  description: string
  singular: string // "Facultad": se usa en títulos y mensajes (todas son femeninas)
  newLabel: string
  emptyHint: string
}
type CatalogDialog = { kind: "form"; item: CatalogItem | null } | { kind: "delete"; item: CatalogItem }

function CatalogManager({ config, apiClient, facultyAware = false }: { config: CatalogConfig; apiClient: CatalogApi; facultyAware?: boolean }) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<CatalogDialog | null>(null)
  const [dialogError, setDialogError] = useState("")
  const [query, setQuery] = useState("")

  async function reload() {
    setItems(await apiClient.list())
    if (facultyAware) setFaculties((await api.listFaculties()).filter((faculty) => faculty.activo))
  }

  useEffect(() => {
    void reload().catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudo cargar el catálogo.")).finally(() => setLoading(false))
  }, [])

  async function run(action: () => Promise<unknown>, success: string, scope: "page" | "dialog"): Promise<boolean> {
    setBusy(true)
    setError("")
    setDialogError("")
    setNotice("")
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

  function open(next: CatalogDialog) { setDialogError(""); setDialog(next) }
  function close() { setDialog(null); setDialogError("") }

  async function save(item: CatalogItem | null, data: { codigo: string; nombre: string; facultad_id: string }) {
    const payload = { codigo: data.codigo, nombre: data.nombre, ...(facultyAware ? { facultad_id: data.facultad_id } : {}) }
    const ok = item
      ? await run(() => apiClient.update(item.id, payload), `${config.singular} ${data.codigo} actualizada.`, "dialog")
      : await run(() => apiClient.create(payload), `${config.singular} ${data.codigo} registrada.`, "dialog")
    if (ok) close()
  }

  async function toggleActive(item: CatalogItem) {
    await run(() => apiClient.update(item.id, { activo: !item.activo }), `${config.singular} ${item.codigo} ${item.activo ? "inactivada" : "reactivada"}.`, "page")
  }

  async function remove(item: CatalogItem) {
    if (await run(() => apiClient.remove(item.id), `${config.singular} ${item.codigo} eliminada.`, "dialog")) close()
  }

  const needle = query.trim().toLowerCase()
  const visible = items.filter((item) => !needle || `${item.codigo} ${item.nombre} ${(item as Career).facultad_nombre ?? ""}`.toLowerCase().includes(needle))
  const activeCount = items.filter((item) => item.activo).length
  const noun = config.title.toLowerCase()

  return (
    <CurriculumShell current={config.section}>
      <PageHeader
        eyebrow="CURRÍCULO"
        title={config.title}
        description={config.description}
        actions={<button type="button" className="ui-btn ui-btn-primary" onClick={() => open({ kind: "form", item: null })}><ButtonLabel icon="plus">{config.newLabel}</ButtonLabel></button>}
      />
      <Notices notice={notice} error={error} />

      <section className="ui-card cat-card-body" aria-label={config.title}>
        {!loading && items.length > 0 && (
          <div className="cat-toolbar">
            <p className="cat-summary">
              <strong>{items.length} {items.length === 1 ? "registro" : "registros"}</strong>
              <StatusBadge tone="green">{activeCount} {activeCount === 1 ? "activa" : "activas"}</StatusBadge>
              {items.length - activeCount > 0 && <StatusBadge tone="gray">{items.length - activeCount} {items.length - activeCount === 1 ? "inactiva" : "inactivas"}</StatusBadge>}
            </p>
            {items.length > 8 && (
              <div className="ui-field cat-search">
                <label htmlFor="cat-search">Buscar en {noun}</label>
                <input id="cat-search" type="search" className="ui-input" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="cat-loading" role="status">Cargando…</p>
        ) : items.length === 0 ? (
          <div style={{ padding: 20 }}><EmptyState icon="inbox" title={`Aún no hay ${noun}`}>{config.emptyHint}</EmptyState></div>
        ) : visible.length === 0 ? (
          <p className="cat-loading" role="status">Ningún registro coincide con «{query}».</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <caption className="ui-visually-hidden">{config.title} registradas</caption>
              <thead>
                <tr>
                  <th scope="col">Código</th><th scope="col">Nombre</th>
                  {facultyAware && <th scope="col">Facultad</th>}
                  <th scope="col">Estado</th><th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td className="ui-cell-strong">{item.codigo}</td>
                    <td>{item.nombre}</td>
                    {facultyAware && <td>{(item as Career).facultad_nombre}<span className="cat-sub">{(item as Career).facultad_codigo}</span></td>}
                    <td><StatusBadge tone={item.activo ? "green" : "gray"}>{item.activo ? "Activa" : "Inactiva"}</StatusBadge></td>
                    <td>
                      <div className="ui-row-actions">
                        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" aria-label={`Editar ${item.codigo}`} onClick={() => open({ kind: "form", item })}><ButtonLabel icon="edit">Editar</ButtonLabel></button>
                        {item.activo
                          ? <button type="button" className="ui-btn ui-btn-warning ui-btn-sm" aria-label={`Inactivar ${item.codigo}`} disabled={busy} onClick={() => void toggleActive(item)}><ButtonLabel icon="pause">Inactivar</ButtonLabel></button>
                          : <button type="button" className="ui-btn ui-btn-success-outline ui-btn-sm" aria-label={`Reactivar ${item.codigo}`} disabled={busy} onClick={() => void toggleActive(item)}><ButtonLabel icon="play">Reactivar</ButtonLabel></button>}
                        <button type="button" className="ui-btn ui-btn-danger-outline ui-btn-sm" aria-label={`Eliminar ${item.codigo}`} onClick={() => open({ kind: "delete", item })}><ButtonLabel icon="trash">Eliminar</ButtonLabel></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog?.kind === "form" && (
        <CatalogFormDialog config={config} item={dialog.item} faculties={faculties} facultyAware={facultyAware} busy={busy} error={dialogError} onClose={close} onSubmit={(data) => void save(dialog.item, data)} />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Eliminar ${config.singular.toLowerCase()} ${dialog.item.codigo}`}
          message={`Se eliminará «${dialog.item.nombre}». Esta acción no se puede deshacer. Si ya se usa en otros registros, el sistema lo impedirá; en ese caso puedes inactivarla.`}
          confirmLabel={`Eliminar ${config.singular.toLowerCase()}`}
          busy={busy}
          error={dialogError}
          onClose={close}
          onConfirm={() => void remove(dialog.item)}
        />
      )}
    </CurriculumShell>
  )
}

function CatalogFormDialog({ config, item, faculties, facultyAware, busy, error, onClose, onSubmit }: {
  config: CatalogConfig
  item: CatalogItem | null
  faculties: Faculty[]
  facultyAware: boolean
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (data: { codigo: string; nombre: string; facultad_id: string }) => void
}) {
  const currentFaculty = item ? (item as Career).facultad_id : ""
  const [codigo, setCodigo] = useState(item?.codigo ?? "")
  const [nombre, setNombre] = useState(item?.nombre ?? "")
  const [facultyId, setFacultyId] = useState(faculties.some((faculty) => faculty.id === currentFaculty) ? currentFaculty : "")
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const title = item ? `Editar ${config.singular.toLowerCase()} ${item.codigo}` : config.newLabel

  if (facultyAware && faculties.length === 0) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="ui-alert ui-alert-warning ui-alert-flush">Primero registra una facultad activa: cada carrera pertenece a una.</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} data-autofocus="">Cerrar</button>
          <a className="ui-btn ui-btn-primary" href="/admin/facultades">Ir a Facultades</a>
        </div>
      </Modal>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = {
      codigo: messageOf(codeSchema, codigo),
      nombre: messageOf(labelSchema, nombre),
      facultad_id: facultyAware && !facultyId ? "Selecciona una facultad activa." : null,
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    onSubmit({ codigo: codigo.trim().toUpperCase(), nombre: nombre.trim(), facultad_id: facultyId })
  }

  return (
    <Modal title={title} description="Todos los campos son obligatorios." onClose={onClose} locked={busy}>
      <form onSubmit={submit}>
        <DialogError error={error} />
        <Field id="cat-code" label="Código" hint="Se guarda en mayúsculas y debe ser único." error={errors.codigo}>
          <input id="cat-code" className="ui-input" value={codigo} onChange={(event) => { setCodigo(event.target.value); setErrors((current) => ({ ...current, codigo: null })) }} maxLength={32} required autoComplete="off" aria-invalid={Boolean(errors.codigo)} aria-describedby={errors.codigo ? "cat-code-error cat-code-hint" : "cat-code-hint"} data-autofocus="" />
        </Field>
        <Field id="cat-name" label="Nombre" error={errors.nombre}>
          <input id="cat-name" className="ui-input" value={nombre} onChange={(event) => { setNombre(event.target.value); setErrors((current) => ({ ...current, nombre: null })) }} maxLength={160} required autoComplete="off" aria-invalid={Boolean(errors.nombre)} aria-describedby={errors.nombre ? "cat-name-error" : undefined} />
        </Field>
        {facultyAware && (
          <Field id="cat-faculty" label="Facultad" hint={item && !faculties.some((faculty) => faculty.id === currentFaculty) ? "La facultad actual está inactiva: elige una activa." : undefined} error={errors.facultad_id}>
            <select id="cat-faculty" className="ui-select" value={facultyId} onChange={(event) => { setFacultyId(event.target.value); setErrors((current) => ({ ...current, facultad_id: null })) }} required aria-invalid={Boolean(errors.facultad_id)} aria-describedby={[errors.facultad_id ? "cat-faculty-error" : "", (item && !faculties.some((faculty) => faculty.id === currentFaculty)) ? "cat-faculty-hint" : ""].filter(Boolean).join(" ") || undefined}>
              <option value="">Selecciona una facultad</option>
              {faculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.codigo} — {faculty.nombre}</option>)}
            </select>
          </Field>
        )}
        <FormActions busy={busy} onClose={onClose} submitLabel={item ? "Guardar cambios" : "Registrar"} icon="check" />
      </form>
    </Modal>
  )
}

export function CareersPage() {
  return <CatalogManager facultyAware config={{
    section: "carreras", title: "Carreras", singular: "Carrera", newLabel: "Nueva carrera",
    description: "Registra las carreras de cada facultad. Al inactivarlas conservas su historial.",
    emptyHint: "Registra la primera con «Nueva carrera». Necesitas tener al menos una facultad activa.",
  }} apiClient={{
    list: api.listCareers,
    create: (data) => {
      if (!data.facultad_id) throw new Error("Selecciona una facultad.")
      return api.createCareer({ codigo: data.codigo, nombre: data.nombre, facultad_id: data.facultad_id })
    },
    update: api.updateCareer,
    remove: api.deleteCareer,
  }} />
}

export function FacultiesPage() {
  return <CatalogManager config={{
    section: "facultades", title: "Facultades", singular: "Facultad", newLabel: "Nueva facultad",
    description: "Administra las facultades y organiza cada carrera bajo una de ellas.",
    emptyHint: "Empieza registrando la primera con «Nueva facultad»; luego podrás crear sus carreras.",
  }} apiClient={{ list: api.listFaculties, create: api.createFaculty, update: api.updateFaculty, remove: api.deleteFaculty }} />
}

export function SubjectsPage() {
  return <CatalogManager config={{
    section: "materias", title: "Materias", singular: "Materia", newLabel: "Nueva materia",
    description: "Mantén el catálogo de materias disponible para organizar los planes de estudio.",
    emptyHint: "Registra la primera con «Nueva materia»; después podrás incluirla en un plan de estudio.",
  }} apiClient={{ list: api.listSubjects, create: api.createSubject, update: api.updateSubject, remove: api.deleteSubject }} />
}
