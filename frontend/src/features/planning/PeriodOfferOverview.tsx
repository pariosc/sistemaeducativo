import { useState } from "react"

import type { Course, PeriodSubjectOverview, PlanOpening } from "../../api/client"

type SortKey = "facultad" | "carrera" | "plan" | "semestre" | "materia" | "demanda" | "paralelos"
const PAGE_SIZE = 25

export function PeriodOfferOverview({ rows, courses, loading, openings, initialPlanId, initialGroupId, onPlan, onCreateSubject, onModularPlan }: {
  rows: PeriodSubjectOverview[]
  courses: Course[]
  loading: boolean
  openings: PlanOpening[]
  initialPlanId: string
  initialGroupId: string
  onPlan: (planId: string) => void
  onCreateSubject: (subjectId: string) => void
  onModularPlan: (planId: string, subjectId: string) => void
}) {
  const [faculty, setFaculty] = useState("")
  const [career, setCareer] = useState("")
  const [plan, setPlan] = useState(initialPlanId)
  const [groupId, setGroupId] = useState(initialGroupId)
  const [showPrevious, setShowPrevious] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [semester, setSemester] = useState("")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("facultad")
  const [descending, setDescending] = useState(false)
  const [page, setPage] = useState(1)

  const faculties = [...new Map(rows.map((row) => [row.facultad_id, { id: row.facultad_id, nombre: row.facultad_nombre }])).values()]
  const careers = [...new Map(rows.filter((row) => !faculty || row.facultad_id === faculty).map((row) => [row.carrera_id, { id: row.carrera_id, nombre: row.carrera_nombre }])).values()]
  const plans = [...new Map(rows.filter((row) => (!faculty || row.facultad_id === faculty) && (!career || row.carrera_id === career)).map((row) => [row.plan_id, { id: row.plan_id, codigo: row.plan_codigo, modalidad: row.plan_modalidad }])).values()]
  const group = openings.find((opening) => opening.id === groupId && opening.plan_id === plan)
  const scopedRows = rows.filter((row) => group ? (
    row.plan_id === plan && (row.semestre_numero === group.semestre_proyectado || (showPrevious && group.semestre_proyectado !== null && row.semestre_numero < group.semestre_proyectado))
  ) : showAll || row.cohortes_previstas > 0)
  const semesters = [...new Set(scopedRows.filter((row) => !plan || row.plan_id === plan).map((row) => row.semestre_numero))].sort((a, b) => a - b)
  const needle = query.trim().toLocaleLowerCase()
  const matching = scopedRows.filter((row) =>
    (!faculty || row.facultad_id === faculty) &&
    (!career || row.carrera_id === career) &&
    (!plan || row.plan_id === plan) &&
    (!semester || row.semestre_numero === Number(semester)) &&
    (!needle || `${row.codigo} ${row.nombre} ${row.facultad_nombre} ${row.carrera_nombre} ${row.plan_codigo}`.toLocaleLowerCase().includes(needle)),
  )
  const activeCounts = new Map<string, number>()
  for (const course of courses) {
    if (course.activo) activeCounts.set(course.materia_plan_id, (activeCounts.get(course.materia_plan_id) ?? 0) + 1)
  }
  const orderValue = (row: PeriodSubjectOverview): string | number => {
    switch (sort) {
      case "facultad": return `${row.facultad_nombre} ${row.carrera_nombre} ${row.plan_codigo} ${row.semestre_numero.toString().padStart(3, "0")} ${row.codigo}`
      case "carrera": return `${row.carrera_nombre} ${row.plan_codigo} ${row.semestre_numero.toString().padStart(3, "0")} ${row.codigo}`
      case "plan": return `${row.plan_codigo} ${row.semestre_numero.toString().padStart(3, "0")} ${row.codigo}`
      case "semestre": return row.semestre_numero
      case "materia": return row.codigo
      case "demanda": return row.aptos
      case "paralelos": return activeCounts.get(row.materia_plan_id) ?? 0
    }
  }
  const ordered = [...matching].sort((a, b) => {
    const left = orderValue(a)
    const right = orderValue(b)
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "es")
    return (descending ? -comparison : comparison) || a.codigo.localeCompare(b.codigo, "es")
  })
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const shown = ordered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const unprogrammed = matching.filter((row) => (row.cohortes_previstas > 0 || row.recomendada) && !activeCounts.get(row.materia_plan_id)).length
  function changeSort(key: SortKey) {
    setDescending(sort === key ? !descending : false)
    setSort(key)
    setPage(1)
  }

  return <section className="pl-offer-overview" aria-labelledby="offer-overview-title">
    <div className="pl-toolbar"><div><h2 id="offer-overview-title">Materias previstas para este semestre</h2><p className="pl-lead">La propuesta parte del semestre que corresponde a cada grupo de ingreso. Los aptos y repetidores reflejan la demanda real del plan.</p></div><span className="pl-overview-summary">{matching.length} materias · {unprogrammed} previstas sin paralelo activo</span></div>
    <div className="pl-overview-filters">
      <label>Facultad<select className="ui-select" value={faculty} onChange={(event) => { setFaculty(event.target.value); setCareer(""); setPlan(""); onPlan(""); setGroupId(""); setPage(1) }}><option value="">Todas</option>{faculties.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <label>Carrera<select className="ui-select" value={career} onChange={(event) => { setCareer(event.target.value); setPlan(""); onPlan(""); setGroupId(""); setPage(1) }}><option value="">Todas</option>{careers.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <label>Plan<select className="ui-select" value={plan} onChange={(event) => { setPlan(event.target.value); onPlan(event.target.value); setGroupId(""); setSemester(""); setPage(1) }}><option value="">Todos</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.modalidad === "MODULAR" ? "Modular" : "Semestral"}</option>)}</select></label>
      {plan && <label>Grupo de ingreso<select className="ui-select" value={groupId} onChange={(event) => { setGroupId(event.target.value); setShowPrevious(false); setSemester(""); setPage(1) }}><option value="">Todos los grupos</option>{openings.filter((opening) => opening.semestre_proyectado !== null).map((opening) => <option key={opening.id} value={opening.id}>{opening.codigo} · semestre {opening.semestre_proyectado}</option>)}</select></label>}
      <label>Semestre<select className="ui-select" value={semester} onChange={(event) => { setSemester(event.target.value); setPage(1) }}><option value="">Todos</option>{semesters.map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
      <label>Buscar<input className="ui-input" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Materia o código" /></label>
    </div>
    <div className="pl-offer-scope">
      {group ? <><strong>{group.codigo}: semestre {group.semestre_proyectado} del plan.</strong><label><input type="checkbox" checked={showPrevious} onChange={(event) => { setShowPrevious(event.target.checked); setPage(1) }} /> Incluir materias de semestres anteriores</label></> : <label><input type="checkbox" checked={showAll} onChange={(event) => { setShowAll(event.target.checked); setPage(1) }} /> Consultar todas las materias del plan</label>}
    </div>
    {loading ? <p role="status">Cargando materias del semestre…</p> : <div className="pl-table-scroll"><table className="pl-data-table pl-offer-table">
      <thead><tr>
        {([ ["facultad", "Facultad"], ["carrera", "Carrera"], ["plan", "Plan"], ["semestre", "Semestre"], ["materia", "Materia"], ["demanda", "Aptos"], ["paralelos", "Paralelos"] ] as [SortKey, string][]).map(([key, label]) => <th key={key} scope="col"><button className="pl-sort-heading" type="button" onClick={() => changeSort(key)} aria-label={`Ordenar por ${label.toLowerCase()}`}>{label}{sort === key ? descending ? " ↓" : " ↑" : ""}</button></th>)}
        <th scope="col">Estado</th><th scope="col">Acción</th>
      </tr></thead>
      <tbody>{shown.map((row) => <tr key={row.materia_plan_id}>
        <td>{row.facultad_nombre}</td><td>{row.carrera_nombre}</td><td><strong>{row.plan_codigo}</strong><small className="pl-table-secondary">{row.plan_modalidad === "MODULAR" ? "Modular" : "Semestral"}</small></td><td>{row.semestre_numero}</td><td><strong>{row.codigo}</strong><small className="pl-table-secondary">{row.nombre}</small></td><td>{row.aptos}<small className="pl-table-secondary">{row.repetidores} repiten · {row.bloqueados} bloqueados</small></td><td>{activeCounts.get(row.materia_plan_id) ?? 0}<small className="pl-table-secondary">activos{row.paralelos > (activeCounts.get(row.materia_plan_id) ?? 0) ? ` · ${row.paralelos} registrados` : ""}</small></td><td>{activeCounts.get(row.materia_plan_id) ? "Programada" : row.cohortes_previstas > 0 ? <strong className="pl-warn">Prevista por grupo</strong> : row.recomendada ? <strong className="pl-warn">Sugerida por demanda</strong> : "Sin programar"}</td>
        <td>{row.plan_modalidad === "MODULAR" ? <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onModularPlan(row.plan_id, row.materia_plan_id)}>Programar secuencia</button> : <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onCreateSubject(row.materia_plan_id)}>Crear paralelo</button>}</td>
      </tr>)}{shown.length === 0 && <tr><td colSpan={9}>{rows.length === 0 ? "Incorpora carreras y planes al semestre para ver sus materias." : "No hay materias para estos filtros."}</td></tr>}</tbody>
    </table></div>}
    {!loading && pageCount > 1 && <div className="pl-table-pagination"><span>Página {currentPage} de {pageCount}</span><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div>}
  </section>
}
