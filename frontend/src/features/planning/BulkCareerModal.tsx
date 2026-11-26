import { useState } from "react"

import type { Career, Faculty, PeriodCareerPlanBatchItem, StudyPlan } from "../../api/client"
import { Modal } from "../shared/Modal"

interface Props {
  careers: Career[]
  faculties: Faculty[]
  plans: StudyPlan[]
  incorporatedIds: string[]
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (items: PeriodCareerPlanBatchItem[]) => Promise<boolean>
}

export function BulkCareerModal({ careers, faculties, plans, incorporatedIds, busy, error, onClose, onSubmit }: Props) {
  const [facultyId, setFacultyId] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const available = careers.filter((career) =>
    career.activo &&
    faculties.some((faculty) => faculty.id === career.facultad_id && faculty.activo) &&
    !incorporatedIds.includes(career.id),
  )
  const query = search.trim().toLocaleLowerCase("es")
  const visible = available.filter((career) =>
    (!facultyId || career.facultad_id === facultyId) &&
    (!query || `${career.nombre} ${career.codigo} ${career.facultad_nombre}`.toLocaleLowerCase("es").includes(query)),
  )
  const vigentePlans = (careerId: string) => plans.filter((plan) => plan.carrera_id === careerId && plan.estado === "VIGENTE")
  const eligibleVisible = visible.filter((career) => vigentePlans(career.id).length > 0)
  const selectedItems = Object.entries(selected).map(([carrera_id, plan_ids]) => ({ carrera_id, plan_ids }))
  const missingPlans = selectedItems.filter((item) => item.plan_ids.length === 0).length
  const planCount = selectedItems.reduce((total, item) => total + item.plan_ids.length, 0)
  const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every((career) => selected[career.id] !== undefined)

  function toggleCareer(career: Career) {
    setSelected((current) => {
      const next = { ...current }
      if (next[career.id] !== undefined) delete next[career.id]
      else {
        const options = vigentePlans(career.id)
        next[career.id] = options.length === 1 ? [options[0].id] : []
      }
      return next
    })
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = { ...current }
      for (const career of eligibleVisible) {
        if (allVisibleSelected) delete next[career.id]
        else if (next[career.id] === undefined) {
          const options = vigentePlans(career.id)
          next[career.id] = options.length === 1 ? [options[0].id] : []
        }
      }
      return next
    })
  }

  function togglePlan(careerId: string, planId: string) {
    setSelected((current) => {
      const chosen = current[careerId] ?? []
      return {
        ...current,
        [careerId]: chosen.includes(planId)
          ? chosen.filter((id) => id !== planId)
          : [...chosen, planId],
      }
    })
  }

  return <Modal
    title="Incorporar varias carreras"
    description="Selecciona las carreras y los planes vigentes que participarán en este semestre. Los grupos de ingreso se crean después."
    onClose={onClose}
    locked={busy}
  >
    <div className="pl-bulk-careers">
      <div className="pl-plan-table-filters">
        <div className="ui-field">
          <label htmlFor="bulk-faculty">Facultad</label>
          <select id="bulk-faculty" className="ui-select" value={facultyId} onChange={(event) => setFacultyId(event.target.value)}>
            <option value="">Todas las facultades</option>
            {faculties.filter((faculty) => faculty.activo && available.some((career) => career.facultad_id === faculty.id)).map((faculty) =>
              <option key={faculty.id} value={faculty.id}>{faculty.nombre}</option>,
            )}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="bulk-career-search">Buscar carrera</label>
          <input id="bulk-career-search" className="ui-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o código" />
        </div>
      </div>
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || eligibleVisible.length === 0} onClick={toggleVisible}>
        {allVisibleSelected ? "Desmarcar visibles" : "Seleccionar visibles"}
      </button>
      <p className="pl-table-count" role="status">{visible.length} carreras visibles · {selectedItems.length} seleccionadas · {planCount} planes</p>
      <div className="pl-table-scroll pl-bulk-careers-scroll">
        <table className="pl-data-table pl-bulk-careers-table">
          <thead><tr><th scope="col">Elegir</th><th scope="col">Facultad / carrera</th><th scope="col">Planes vigentes</th></tr></thead>
          <tbody>
            {visible.length === 0 ? <tr><td colSpan={3}>No hay carreras disponibles con estos filtros.</td></tr> : visible.map((career) => {
              const options = vigentePlans(career.id)
              const checked = selected[career.id] !== undefined
              return <tr key={career.id}>
                <td><input type="checkbox" checked={checked} disabled={busy || options.length === 0} aria-label={`Seleccionar ${career.nombre}`} onChange={() => toggleCareer(career)} /></td>
                <td><strong>{career.nombre}</strong><small>{career.facultad_nombre} · {career.codigo}</small></td>
                <td>{options.length === 0 ? <span className="ui-text-muted">Sin plan vigente</span> :
                  <div className="pl-bulk-plan-options">{options.map((plan) =>
                    <label key={plan.id}>
                      <input type="checkbox" checked={selected[career.id]?.includes(plan.id) ?? false} disabled={busy || !checked} onChange={() => togglePlan(career.id, plan.id)} />
                      <span>{plan.codigo} · {plan.modalidad}</span>
                    </label>,
                  )}</div>}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      {missingPlans > 0 && <p className="pl-bulk-warning" role="status">Selecciona al menos un plan vigente en {missingPlans} carrera(s).</p>}
      {error && <p className="pl-bulk-error" role="alert">{error}</p>}
      <div className="ui-modal-actions">
        <button type="button" className="ui-btn ui-btn-secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-primary" disabled={busy || selectedItems.length === 0 || missingPlans > 0} onClick={() => void onSubmit(selectedItems)}>
          {busy ? "Incorporando…" : `Incorporar ${selectedItems.length} carrera(s)`}
        </button>
      </div>
    </div>
  </Modal>
}
