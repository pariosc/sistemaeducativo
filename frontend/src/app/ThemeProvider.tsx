import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type ThemePreference = "claro" | "oscuro" | "sistema"
type ResolvedTheme = "claro" | "oscuro"

type ThemeContextValue = {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (value: ThemePreference) => void
  cyclePreference: () => void
}

const STORAGE_KEY = "gestion-academica:tema"
const ORDER: ThemePreference[] = ["claro", "oscuro", "sistema"]
const LABELS: Record<ThemePreference, string> = {
  claro: "Claro",
  oscuro: "Oscuro",
  sistema: "Sistema",
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "claro" || stored === "oscuro" || stored === "sistema" ? stored : "sistema"
  } catch {
    return "sistema"
  }
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const [systemDark, setSystemDark] = useState(prefersDark)

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolved: ResolvedTheme =
    preference === "sistema" ? (systemDark ? "oscuro" : "claro") : preference

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolved === "oscuro")
    root.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      resolved === "oscuro" ? "#0b1220" : "#f6f7fb",
    )
  }, [resolved])

  const value = useMemo<ThemeContextValue>(() => {
    const setPreference = (next: ThemePreference) => {
      setPreferenceState(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {}
    }
    return {
      preference,
      resolved,
      setPreference,
      cyclePreference: () => setPreference(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]),
    }
  }, [preference, resolved])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme debe usarse dentro de ThemeProvider")
  return context
}

export function themeLabel(value: ThemePreference): string {
  return LABELS[value]
}
