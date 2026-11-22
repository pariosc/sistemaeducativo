import { useEffect, useState } from "react"

import { api } from "../../api/client"
import type { AcademicPeriod } from "../../api/client"
import { pickDefaultPeriod, sortPeriods } from "./dates"

/** Mantiene ?periodo_id= en la URL (mismo enlace profundo que ya usaban las 3 pantallas). */
export function syncPeriodParam(id: string) {
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("periodo_id", id)
    else url.searchParams.delete("periodo_id")
    window.history.replaceState(null, "", url)
  } catch {
    /* entornos sin historial: el parámetro simplemente no se actualiza */
  }
}

/** Carga los semestres y recuerda cuál está seleccionado (por URL, o el que está en curso). */
export function usePeriodSelection() {
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [periodId, setPeriodIdState] = useState(() => new URLSearchParams(window.location.search).get("periodo_id") ?? "")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    void api.listPeriods()
      .then((data) => {
        const sorted = sortPeriods(data)
        setPeriods(sorted)
        setPeriodIdState((current) => (sorted.some((period) => period.id === current) ? current : pickDefaultPeriod(sorted)?.id ?? ""))
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  function setPeriodId(id: string) {
    setPeriodIdState(id)
    syncPeriodParam(id)
  }

  return { periods, periodId, setPeriodId, period: periods.find((candidate) => candidate.id === periodId) ?? null, loading, error }
}
