import type { PeriodPlanning, PlanOpening, StudyPlan, SubjectSuggestion } from "../../api/client"
import { ButtonLabel, EmptyState, StatusBadge } from "../shared/ui"

export function PlanOfferPanel({ planning, plans, planId, openings, suggestions, onPlan, onCreateSubject }: {
  planning: PeriodPlanning | null
  plans: StudyPlan[]
  planId: string
  openings: PlanOpening[]
  suggestions: SubjectSuggestion[]
  onPlan: (id: string) => void
  onCreateSubject: (subjectId: string) => void
}) {
  const participating = plans.filter((plan) => planning?.plan_ids.includes(plan.id))
  const plan = participating.find((item) => item.id === planId)
  const semesters = [...new Set(suggestions.map((item) => item.semestre_numero))].sort((a, b) => a - b)
  return <section className="pl-section" aria-labelledby="suggestions-title">
    <div className="pl-toolbar">
      <div><h2 id="suggestions-title">Materias del plan y demanda</h2><p className="pl-lead">El sistema propone qué abrir según los grupos de ingreso y las notas de periodos anteriores. Tú decides los paralelos.</p></div>
      <a className="ui-link-button" href="/admin/periodos">Configurar carreras y planes</a>
    </div>
    {participating.length === 0 ? <EmptyState icon="layers" title="Incorpora un plan a este semestre">Abre el semestre académico y selecciona primero la carrera y su plan vigente.</EmptyState> : <>
      <div className="ui-field pl-plan-pick">
        <label htmlFor="offer-plan">Plan a programar</label>
        <select id="offer-plan" className="ui-select" value={planId} onChange={(event) => onPlan(event.target.value)}>
          {participating.map((item) => <option key={item.id} value={item.id}>{item.carrera_nombre} · {item.codigo} · {item.modalidad}</option>)}
        </select>
      </div>
      {plan && <>
        <p className="pl-lead">Duración del plan: {Math.max(0, ...plan.unidades.map((unit) => unit.numero))} semestres curriculares. {plan.modalidad === "MODULAR" ? "Distribuye las materias elegidas por fechas de módulo dentro de este semestre académico." : "Programa los paralelos elegidos durante el semestre académico."}</p>
        {openings.length > 0 && <ul className="pl-cohort-list" aria-label="Grupos de ingreso de este plan">{openings.filter((item) => item.semestre_proyectado !== null).map((item) => <li key={item.id}>Ingreso {item.periodo_denominacion}: semestre previsto {item.semestre_proyectado}, {item.estudiantes} estudiantes</li>)}</ul>}
        {semesters.map((semester) => <div key={semester} className="pl-suggestion-semester">
          <h3>Semestre curricular {semester}</h3>
          <ul className="pl-suggestion-grid">
            {suggestions.filter((item) => item.semestre_numero === semester).map((item) => <li key={item.materia_plan_id} className="pl-suggestion-card">
              <div className="pl-card-top"><strong>{item.codigo} — {item.nombre}</strong><StatusBadge tone={item.recomendada ? "green" : "gray"}>{item.recomendada ? "Sugerida" : "Opcional"}</StatusBadge></div>
              <p>{item.prerrequisitos.length ? `Requisitos: ${item.prerrequisitos.join(", ")}` : "Sin prerrequisitos"}</p>
              <dl className="pl-suggestion-facts">
                <div><dt>Aptos</dt><dd>{item.aptos}</dd></div>
                <div><dt>Repetidores</dt><dd>{item.repetidores}</dd></div>
                <div><dt>Bloqueados</dt><dd>{item.bloqueados}</dd></div>
                <div><dt>Sin nota</dt><dd>{item.sin_nota}</dd></div>
              </dl>
              <p>{item.cohortes_previstas ? `${item.cohortes_previstas} grupo(s) en este semestre del plan · ${item.estudiantes_previstos} estudiantes aptos de esos grupos` : "Ningún grupo cursa este semestre nominalmente"}</p>
              <div className="pl-card-actions"><span>{item.paralelos} paralelo(s) programado(s)</span><button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => onCreateSubject(item.materia_plan_id)}><ButtonLabel icon="plus">Programar paralelo</ButtonLabel></button></div>
            </li>)}
          </ul>
        </div>)}
      </>}
    </>}
  </section>
}
