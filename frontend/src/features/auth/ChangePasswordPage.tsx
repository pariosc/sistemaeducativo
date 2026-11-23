import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { api } from "../../api/client"
import { ThemeToggle } from "../shared/ThemeToggle"
import { passwordSchema } from "../shared/validation"
import { useAuth } from "./AuthContext"

const schema = z.object({
  actual: z.string().min(1, "Ingresa la contraseña temporal o actual.").max(128, "Usa hasta 128 caracteres."),
  nueva: passwordSchema,
  confirmacion: passwordSchema,
}).refine((value) => value.nueva === value.confirmacion, {
  message: "Las contraseñas no coinciden.",
  path: ["confirmacion"],
})

type FormValues = z.infer<typeof schema>

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { actual: "", nueva: "", confirmacion: "" },
  })
  const change = useMutation({
    mutationFn: (value: FormValues) => api.changePassword(value.actual, value.nueva),
    onSuccess: async () => {
      await refresh()
      window.sessionStorage.setItem("academico_flash", "Contraseña actualizada. Ingresa con la nueva contraseña.")
      await navigate({ to: "/login" })
    },
  })
  return (
    <main className="simple-page">
      <section className="simple-card">
        <ThemeToggle floating />
        <span className="eyebrow">SEGURIDAD DE LA CUENTA</span>
        <h1>Crea una contraseña nueva</h1>
        <p>Por seguridad, debes cambiar la contraseña temporal para continuar.</p>
        <form className="stack-form" noValidate onSubmit={form.handleSubmit((value) => change.mutate(value))}>
          <label>Contraseña actual o temporal<input type="password" autoComplete="current-password" maxLength={128} aria-invalid={Boolean(form.formState.errors.actual)} {...form.register("actual")} /></label>
          {form.formState.errors.actual && <span className="field-error">{form.formState.errors.actual.message}</span>}
          <label>Nueva contraseña<input type="password" autoComplete="new-password" maxLength={128} aria-invalid={Boolean(form.formState.errors.nueva)} {...form.register("nueva")} /></label>
          {form.formState.errors.nueva && <span className="field-error">{form.formState.errors.nueva.message}</span>}
          <label>Confirmar contraseña<input type="password" autoComplete="new-password" maxLength={128} aria-invalid={Boolean(form.formState.errors.confirmacion)} {...form.register("confirmacion")} /></label>
          {form.formState.errors.confirmacion && <span className="field-error">{form.formState.errors.confirmacion.message}</span>}
          {change.error && <p role="alert" className="form-alert">{change.error.message}</p>}
          <button className="primary-button" disabled={change.isPending}>{change.isPending ? "Guardando…" : "Guardar contraseña"}</button>
        </form>
      </section>
    </main>
  )
}
