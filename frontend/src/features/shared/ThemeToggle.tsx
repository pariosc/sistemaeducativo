import { useTheme } from "../../app/ThemeProvider"
import { Icon } from "./icons"
import type { IconName } from "./icons"

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const { resolved, setPreference } = useTheme()
  const isDark = resolved === "oscuro"
  const label = isDark ? "Modo claro" : "Modo oscuro"
  const icon: IconName = isDark ? "sun" : "moon"

  return (
    <button
      type="button"
      className={floating ? "theme-toggle theme-toggle--floating" : "theme-toggle"}
      onClick={() => setPreference(isDark ? "claro" : "oscuro")}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </button>
  )
}
