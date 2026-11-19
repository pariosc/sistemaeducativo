import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { api } from "../../api/client"
import { AuthLayout } from "./AuthLayout"
import { useAuth } from "./AuthContext"

const schema = z.object({
  identificador: z.string().trim().min(1, "Ingresa tu correo o CI."),
  contrasena: z.string().min(1, "Ingresa tu contraseña."),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identificador: "", contrasena: "" },
  })
  const login = useMutation({
    mutationFn: (values: FormValues) => api.login(values.identificador, values.contrasena),
    onSuccess: async (result) => {
      await refresh()
      await navigate({ to: result.debe_cambiar_contrasena ? "/cambiar-contrasena" : "/" })
    },
  })

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
        <div className="form-heading">
          <span className="eyebrow">BIENVENIDO</span>
          <h2>Inicia sesión</h2>
          <p>Ingresa con el correo o CI registrado en tu cuenta.</p>
        </div>

        <label className="field-label" htmlFor="identificador">Correo electrónico o CI</label>
        <input
          id="identificador"
          autoComplete="username"
          autoFocus
          className="form-input"
          placeholder="correo@institucion.edu.bo o CI"
          aria-invalid={Boolean(form.formState.errors.identificador)}
          aria-describedby={form.formState.errors.identificador ? "identifier-error" : undefined}
          {...form.register("identificador")}
        />
        {form.formState.errors.identificador && <span id="identifier-error" className="field-error">{form.formState.errors.identificador.message}</span>}

        <label className="field-label" htmlFor="contrasena">Contraseña</label>
        <input
          id="contrasena"
          type="password"
          autoComplete="current-password"
          className="form-input"
          placeholder="Tu contraseña"
          aria-invalid={Boolean(form.formState.errors.contrasena)}
          aria-describedby={form.formState.errors.contrasena ? "password-error" : undefined}
          {...form.register("contrasena")}
        />
        {form.formState.errors.contrasena && <span id="password-error" className="field-error">{form.formState.errors.contrasena.message}</span>}

        {login.error && <p role="alert" className="form-alert">{login.error.message}</p>}
        <button className="primary-button" type="submit" disabled={login.isPending}>
          {login.isPending ? "Verificando…" : "Ingresar"}
          {!login.isPending && <span aria-hidden="true">→</span>}
        </button>
        <p className="login-note">Si no puedes ingresar, comunícate con administración académica.</p>
      </form>
    </AuthLayout>
  )
}
