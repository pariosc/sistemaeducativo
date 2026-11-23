import { z } from "zod"

export const ciSchema = z
  .string()
  .trim()
  .min(3, "El CI debe tener al menos 3 caracteres.")
  .max(32, "El CI no puede superar los 32 caracteres.")
  .regex(/^[A-Za-z0-9-]+$/, "El CI solo admite letras, números y guiones.")

export const phoneSchema = z
  .string()
  .trim()
  .min(5, "El teléfono debe tener al menos 5 caracteres.")
  .max(40, "El teléfono no puede superar los 40 caracteres.")
  .regex(/^[0-9+() ./-]+$/, "El teléfono solo admite números, espacios y los signos + ( ) . / -.")

export const personNameSchema = z
  .string()
  .trim()
  .min(1, "Este campo es obligatorio.")
  .max(120, "No puede superar los 120 caracteres.")
  .regex(/^[\p{L}][\p{L}\s'-]*$/u, "Use solo letras, espacios, apóstrofos y guiones.")

export const codeSchema = z
  .string()
  .trim()
  .min(1, "El código es obligatorio.")
  .max(32, "El código no puede superar los 32 caracteres.")
  .regex(/^[A-Za-z0-9._-]+$/, "El código solo admite letras, números, punto, guion y guion bajo.")

export const labelSchema = z
  .string()
  .trim()
  .min(1, "Este campo es obligatorio.")
  .max(160, "No puede superar los 160 caracteres.")

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, "La descripción es obligatoria.")
  .max(500, "La descripción no puede superar los 500 caracteres.")

export const passwordSchema = z
  .string()
  .min(8, "Use al menos 8 caracteres.")
  .max(128, "Use hasta 128 caracteres.")

export const emailSchema = z
  .string()
  .trim()
  .min(1, "El correo es obligatorio.")
  .max(254, "El correo no puede superar los 254 caracteres.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Ingresa un correo electrónico válido.")

export const identifierSchema = z.string().trim().min(1, "Ingresa tu correo o CI.").refine(
  (value) => emailSchema.safeParse(value).success || ciSchema.safeParse(value).success,
  "Ingresa un correo válido o un CI de 3 a 32 caracteres.",
)

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona una fecha válida.")

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use el formato HH:MM.")

export const positiveIntSchema = z
  .number({ message: "Ingresa un número entero." })
  .int("Debe ser un número entero.")
  .positive("Debe ser mayor que cero.")

export const gradeSchema = z
  .number({ message: "Ingresa una nota." })
  .int("La nota debe ser un entero.")
  .min(0, "La nota mínima es 0.")
  .max(100, "La nota máxima es 100.")

export function messageOf(schema: z.ZodTypeAny, value: unknown): string | null {
  const result = schema.safeParse(value)
  if (result.success) return null
  return result.error.issues[0]?.message ?? "Revisa este campo."
}
