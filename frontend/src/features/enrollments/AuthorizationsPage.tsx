import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { StudentAuthorization } from "../../api/client"
import { ButtonLabel, ConfirmDialog, EmptyState, Notices, PageHeader, StatusBadge } from "../shared/ui"
import { PeriodBar } from "../planning/PeriodBar"
import { PlanningShell } from "../planning/PlanningShell"
import { plural } from "../planning/dates"
import type { Tone } from "../planning/dates"
import { usePeriodSelection } from "../planning/usePeriodSelection"

type Filter = "all" | "enabled" | "none" | "revoked"
type Status = "enabled" | "none" | "revoked"

const statusOf = (student: StudentAuthorization): Status => (student.habilitada ? "enabled" : student.id ? "revoked" : "none")
const STATUS_LABEL: Record<Status, string> = { enabled: "Habilitada", none: "Sin habilitar", revoked: "Revocada" }
const STATUS_TONE: Record<Status, Tone> = { enabled: "green", none: "gray", revoked: "amber" }
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" }, { id: "enabled", label: "Habilitados" }, { id: "none", label: "Sin habilitar" }, { id: "revoked", label: "Revocados" },
]

export function AuthorizationsPage() {
  const { periods, periodId, setPeriodId, period, loading, error: periodsError } = usePeriodSelection()
  const [students, setStudents] = useState<StudentAuthorization[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)

  useEffect(() => {
    if (!periodId) { setStudents([]); return }
    void api.listAuthorizations(periodId).then(setStudents).catch((reason: Error) => setError(reason.message))
  }, [periodId])

  async function toggle(student: StudentAuthorization) {
    setBusy(true); setError(""); setNotice("")
    try {
      await api.setAuthorization(periodId, student.estudiante_id, !student.habilitada)
      setStudents(await api.listAuthorizations(periodId))
      setNotice(`${student.estudiante_nombre} ${student.habilitada ? "fue revocado" : "fue habilitado"} para ${period?.denominacion ?? "el semestre"}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la habilitación.")
    } finally {
      setBusy(false)
    }
  }

  /** Habilita uno por uno a quienes aún no lo están; si alguno falla, sigue con el resto y lo informa al final. */
  async function enableAll(targets: StudentAuthorization[]) {
    setBusy(true); setError(""); setNotice("")
    let done = 0
    const failures: string[] = []
    for (const student of targets) {
      try { await api.setAuthorization(periodId, student.estudiante_id, true); done += 1 }
      catch (reason) { failures.push(`${student.estudiante_nombre}: ${reason instanceof Error ? reason.message : "error"}`) }
    }
    try { setStudents(await api.listAuthorizations(periodId)) } catch (reason) { failures.push(reason instanceof Error ? reason.message : "No se pudo recargar la lista.") }
    if (done > 0) setNotice(`Se habilitó a ${plural(done, "estudiante", "estudiantes")} para ${period?.denominacion ?? "el semestre"}.`)
    if (failures.length > 0) setError(`No se pudo habilitar a ${plural(failures.length, "estudiante", "estudiantes")}. Primer motivo: ${failures[0]}`)
    setConfirmBulk(false)
    setBusy(false)
  }

  const counts = {
    all: students.length,
    enabled: students.filter((student) => statusOf(student) === "enabled").length,
    none: students.filter((student) => statusOf(student) === "none").length,
    revoked: students.filter((student) => statusOf(student) === "revoked").length,
  }
  const needle = query.trim().toLowerCase()
  const visible = students.filter((student) =>
    (filter === "all" || statusOf(student) === filter) &&
    (!needle || `${student.estudiante_ci} ${student.estudiante_nombre}`.toLowerCase().includes(needle)))
  const pending = visible.filter((student) => !student.habilitada)

  if (loading) return <PlanningShell current="habilitaciones"><p className="cat-loading" role="status">Cargando semestres…</p></PlanningShell>

  return (
    <PlanningShell current="habilitaciones" periodId={periodId}>
      <PageHeader
        eyebrow="PLANIFICACIÓN ACADÉMICA"
        title="Habilitaciones"
        description="Autoriza o revoca a cada estudiante para inscribirse durante el semestre. Esta autorización no abre los paralelos: eso se hace en la oferta."
      />
      <Notices notice={notice} error={error || periodsError} />

      {periods.length === 0 ? (
        <EmptyState icon="layers" title="Primero registra un semestre académico">
          Las habilitaciones se otorgan por semestre. <a className="ui-btn ui-btn-primary" href="/admin/periodos" style={{ marginTop: 8 }}>Ir a Planificar semestre</a>
        </EmptyState>
      ) : (
        <>
          <PeriodBar periods={periods} periodId={periodId} onChange={setPeriodId} />
          <p className="ui-alert ui-alert-info">
            La autorización es distinta de la oferta académica. Revisa los <a className="pl-inline-link" href={`/admin/paralelos?periodo_id=${periodId}`}>paralelos programados para este semestre</a> y confirma que abran inscripciones según corresponda.
          </p>

          {students.length === 0 ? (
            <EmptyState icon="users" title="No hay estudiantes registrados">Cuando existan estudiantes en el sistema aparecerán aquí para habilitarlos.</EmptyState>
          ) : (
            <section className="ui-card pl-auth" aria-label="Estudiantes del semestre">
              <div className="pl-auth-bar">
                <div className="pl-segment" role="group" aria-label="Filtrar por estado">
                  {FILTERS.map((item) => (
                    <button key={item.id} type="button" className="pl-segment-btn" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                      {item.label} <span className="ui-count">{counts[item.id]}</span>
                    </button>
                  ))}
                </div>
                <div className="ui-field pl-auth-search">
                  <label htmlFor="auth-search">Buscar por CI o nombre</label>
                  <input id="auth-search" type="search" className="ui-input" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
              </div>

              {pending.length > 0 && (
                <div className="pl-bulk">
                  <p><strong>{plural(pending.length, "estudiante", "estudiantes")}</strong> {pending.length === 1 ? "de esta lista aún no está habilitado" : "de esta lista aún no están habilitados"}.</p>
                  <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => setConfirmBulk(true)}><ButtonLabel icon="check">Habilitar a todos los de la lista</ButtonLabel></button>
                </div>
              )}

              {visible.length === 0 ? (
                <p className="cat-loading" role="status">Ningún estudiante coincide con el filtro.</p>
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table">
                    <caption className="ui-visually-hidden">Habilitaciones de {period?.denominacion}</caption>
                    <thead><tr><th scope="col">CI</th><th scope="col">Estudiante</th><th scope="col">Estado</th><th scope="col">Último cambio</th><th scope="col">Acciones</th></tr></thead>
                    <tbody>
                      {visible.map((student) => {
                        const status = statusOf(student)
                        return (
                          <tr key={student.estudiante_id}>
                            <td>{student.estudiante_ci}</td>
                            <td className="ui-cell-strong">{student.estudiante_nombre}</td>
                            <td><StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge></td>
                            <td>{student.fecha_autorizacion ? new Date(student.fecha_autorizacion).toLocaleString() : "—"}</td>
                            <td>
                              {student.habilitada
                                ? <button type="button" className="ui-btn ui-btn-warning ui-btn-sm" disabled={busy} aria-label={`Revocar a ${student.estudiante_nombre}`} onClick={() => void toggle(student)}><ButtonLabel icon="pause">Revocar</ButtonLabel></button>
                                : <button type="button" className="ui-btn ui-btn-success-outline ui-btn-sm" disabled={busy} aria-label={`Habilitar a ${student.estudiante_nombre}`} onClick={() => void toggle(student)}><ButtonLabel icon="check">Habilitar</ButtonLabel></button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {confirmBulk && (
        <ConfirmDialog
          danger={false}
          title={`Habilitar a ${plural(pending.length, "estudiante", "estudiantes")}`}
          message={`Se autorizará la inscripción en ${period?.denominacion ?? "el semestre"} de todos los estudiantes de la lista actual que aún no están habilitados. Esto no abre los paralelos y cada habilitación se puede revocar después.`}
          confirmLabel="Habilitar estudiantes"
          busy={busy}
          error=""
          onClose={() => setConfirmBulk(false)}
          onConfirm={() => void enableAll(pending)}
        />
      )}
    </PlanningShell>
  )
}
