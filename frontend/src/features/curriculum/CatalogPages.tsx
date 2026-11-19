import { useEffect, useState } from "react"

import { api, type Career, type Faculty, type Subject } from "../../api/client"
import { AdminNavigation } from "../shared/AdminNavigation"

type CatalogItem = Career | Subject
type CatalogApi = {
  list: () => Promise<CatalogItem[]>
  create: (data: { codigo: string; nombre: string; facultad_id?: string }) => Promise<CatalogItem>
  update: (id: string, data: Partial<Pick<CatalogItem, "codigo" | "nombre" | "activo">> & { facultad_id?: string }) => Promise<CatalogItem>
  remove: (id: string) => Promise<void>
}

function CatalogManager({ title, description, apiClient, facultyAware = false }: { title: string; description: string; apiClient: CatalogApi; facultyAware?: boolean }) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [codigo, setCodigo] = useState("")
  const [nombre, setNombre] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [facultyId, setFacultyId] = useState("")

  async function reload() {
    try {
      setItems(await apiClient.list())
      if (facultyAware) setFaculties((await api.listFaculties()).filter((faculty) => faculty.activo))
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar el catálogo.")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void reload() }, [])

  async function createItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    try {
      await apiClient.create({ codigo, nombre, ...(facultyAware ? { facultad_id: facultyId } : {}) })
      setCodigo("")
      setNombre("")
      setFacultyId("")
      setMessage(`${title.slice(0, -1)} registrada.`)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo registrar el elemento.")
    }
  }

  async function editItem(item: CatalogItem) {
    const nextCode = window.prompt("Código", item.codigo)
    if (nextCode === null) return
    const nextName = window.prompt("Nombre", item.nombre)
    if (nextName === null) return
    const nextFacultyCode = facultyAware
      ? window.prompt(`Código de facultad (${faculties.map((faculty) => faculty.codigo).join(", ")})`, (item as Career).facultad_codigo)
      : null
    const nextFacultyId = faculties.find((faculty) => faculty.codigo === nextFacultyCode?.trim().toUpperCase())?.id
    if (facultyAware && (!nextFacultyId || !faculties.some((faculty) => faculty.id === nextFacultyId))) {
      if (nextFacultyCode !== null) setError("Selecciona el código de una facultad activa válida.")
      return
    }
    try {
      await apiClient.update(item.id, { codigo: nextCode, nombre: nextName, ...(facultyAware ? { facultad_id: nextFacultyId! } : {}) })
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo editar el elemento.")
    }
  }

  async function toggleActive(item: CatalogItem) {
    try {
      await apiClient.update(item.id, { activo: !item.activo })
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cambiar el estado.")
    }
  }

  async function deleteItem(item: CatalogItem) {
    if (!window.confirm(`¿Eliminar ${item.codigo} — ${item.nombre}?`)) return
    try {
      await apiClient.remove(item.id)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar.")
    }
  }

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <a className="small-brand" href="/">GA <span>Gestión Académica</span></a>
        <AdminNavigation />
      </header>
      <section className="content-wrap">
        <span className="eyebrow">CURRÍCULO</span>
        <h1>{title}</h1>
        <p className="section-intro">{description}</p>
        {error && <p role="alert" className="form-alert">{error}</p>}
        {message && <p role="status" className="success-note">{message}</p>}
        <div className="profile-grid users-grid">
          <section className="profile-card">
            <h2>Nuevo registro</h2>
            <form className="stack-form" onSubmit={(event) => void createItem(event)}>
              <label>Código<input className="form-input" value={codigo} onChange={(event) => setCodigo(event.target.value)} required maxLength={32} /></label>
              <label>Nombre<input className="form-input" value={nombre} onChange={(event) => setNombre(event.target.value)} required maxLength={160} /></label>
              {facultyAware && <label>Facultad<select className="form-input" value={facultyId} onChange={(event) => setFacultyId(event.target.value)} required><option value="">Selecciona una facultad</option>{faculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.codigo} — {faculty.nombre}</option>)}</select>{faculties.length === 0 && <small>Primero registra una facultad activa.</small>}</label>}
              <button className="primary-button" type="submit">Registrar</button>
            </form>
          </section>
          <section className="profile-card users-table-card">
            <h2>Registros</h2>
            {loading ? <p>Cargando…</p> : <div className="table-scroll"><table>
              <thead><tr><th>Código</th><th>Nombre</th>{facultyAware && <th>Facultad</th>}<th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>{items.map((item) => <tr key={item.id}>
                <td>{item.codigo}</td><td>{item.nombre}</td>{facultyAware && <td>{(item as Career).facultad_codigo} — {(item as Career).facultad_nombre}</td>}
                <td><span className={item.activo ? "status-active" : "status-inactive"}>{item.activo ? "Activa" : "Inactiva"}</span></td>
                <td><div className="table-actions">
                  <button className="text-action" onClick={() => void editItem(item)}>Editar</button>
                  <button className="text-action" onClick={() => void toggleActive(item)}>{item.activo ? "Inactivar" : "Reactivar"}</button>
                  <button className="text-action" onClick={() => void deleteItem(item)}>Eliminar</button>
                </div></td>
              </tr>)}</tbody>
            </table></div>}
          </section>
        </div>
      </section>
    </main>
  )
}

export function CareersPage() {
  return <CatalogManager title="Carreras" description="Registra carreras y conserva su historial al inactivarlas." apiClient={{
    list: api.listCareers,
    create: (data) => {
      if (!data.facultad_id) throw new Error("Selecciona una facultad.")
      return api.createCareer({ codigo: data.codigo, nombre: data.nombre, facultad_id: data.facultad_id })
    },
    update: api.updateCareer,
    remove: api.deleteCareer,
  }} facultyAware />
}

export function FacultiesPage() {
  return <CatalogManager title="Facultades" description="Administra las facultades y organiza cada carrera bajo una facultad." apiClient={{
    list: api.listFaculties,
    create: api.createFaculty,
    update: api.updateFaculty,
    remove: api.deleteFaculty,
  }} />
}

export function SubjectsPage() {
  return <CatalogManager title="Materias" description="Mantén el catálogo de materias disponible para organizar planes de estudio." apiClient={{
    list: api.listSubjects,
    create: api.createSubject,
    update: api.updateSubject,
    remove: api.deleteSubject,
  }} />
}
