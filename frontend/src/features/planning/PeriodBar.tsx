import type { AcademicPeriod } from "../../api/client"
import { StatusBadge } from "../shared/ui"
import { PERIOD_STATE_LABEL, PERIOD_STATE_TONE, formatDate, periodState } from "./dates"

/** Barra de contexto: qué semestre se está trabajando. Es la misma en Oferta y Habilitaciones. */
export function PeriodBar({ periods, periodId, onChange }: { periods: AcademicPeriod[]; periodId: string; onChange: (id: string) => void }) {
  const period = periods.find((candidate) => candidate.id === periodId)
  const state = period ? periodState(period) : null
  return (
    <div className="pl-periodbar">
      <div className="ui-field pl-periodbar-select">
        <label htmlFor="period-select">Semestre académico</label>
        <select id="period-select" className="ui-select" value={periodId} onChange={(event) => onChange(event.target.value)}>
          {periods.map((item) => <option key={item.id} value={item.id}>{item.denominacion}</option>)}
        </select>
      </div>
      {period && state && (
        <div className="pl-periodbar-meta">
          <StatusBadge tone={PERIOD_STATE_TONE[state]}>{PERIOD_STATE_LABEL[state]}</StatusBadge>
          <span>{formatDate(period.fecha_inicio)} – {formatDate(period.fecha_fin)}</span>
          <a className="ui-btn ui-btn-quiet" href={`/admin/periodos?periodo_id=${period.id}`}>Ver semestre</a>
        </div>
      )}
    </div>
  )
}
