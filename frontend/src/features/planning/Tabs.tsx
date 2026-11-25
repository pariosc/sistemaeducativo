import type { KeyboardEvent } from "react"

export interface TabItem<T extends string> {
  id: T
  label: string
  count?: number
}

/** Pestañas accesibles con el patrón tablist: flechas, Home y End. */
export function Tabs<T extends string>({ items, active, onChange, label, idPrefix }: {
  items: TabItem<T>[]
  active: T
  onChange: (id: T) => void
  label: string
  idPrefix: string
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === active)
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % items.length
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = items.length - 1
    else return
    event.preventDefault()
    onChange(items[next].id)
    document.getElementById(`${idPrefix}-${items[next].id}`)?.focus()
  }
  return (
    <div className="pl-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" id={`${idPrefix}-${item.id}`} className="pl-tab" aria-selected={active === item.id} aria-controls={`${idPrefix}-panel-${item.id}`} tabIndex={active === item.id ? 0 : -1} onClick={() => onChange(item.id)}>
          {item.label}
          {item.count !== undefined && <span className="pl-tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  )
}
