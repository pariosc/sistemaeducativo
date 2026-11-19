# Evaluación de calidad del prototipo

Plantilla de trabajo para la evaluación prevista en la Fase 7. No contiene
puntuaciones ni resultados de ejecución. Completarla sobre una versión
identificada del prototipo y conservar evidencias reproducibles.

## Ficha de evaluación

| Dato | Valor |
| --- | --- |
| Versión o commit evaluado | Pendiente de repositorio versionado |
| Fecha | Pendiente |
| Evaluadores | Pendiente de confirmar equipo |
| Sistema operativo y versión | Pendiente |
| Versiones de Python, Node, Bun y PostgreSQL | Pendiente de registrar |
| Navegadores y tamaños de pantalla | Pendiente |
| Configuración y volumen de datos | Pendiente; no incluir datos personales reales |
| Comandos y configuración de arranque | Ver `README.md`; confirmar entorno evaluado |

## Escala acordada para el proyecto

- **1:** incumplimiento demostrado.
- **2:** cumplimiento parcial con fallos relevantes.
- **3:** cumplimiento mayoritario con limitaciones.
- **4:** cumplimiento de los criterios previstos con evidencia.
- **NE:** no evaluado.
- **NA:** no aplicable, con justificación.

Esta escala es una propuesta del equipo y no se atribuye a ISO/IEC 25010.
No puntuar una característica sin registrar la evidencia correspondiente.

## Matriz de verificación

| Requisito | Comprobación prevista | Estado | Evidencia / resultado | Puntuación |
| --- | --- | --- | --- | --- |
| RNF01 — Contraseñas | Inspeccionar una cuenta de prueba y comprobar que la contraseña no se almacena en texto legible y que se verifica con el mecanismo de hash previsto. | NE | Pendiente | NE |
| RNF02 — Control de acceso | Enviar solicitudes directas sin sesión y con un rol/usuario sin relación con el recurso; comprobar rechazo en API. | NE | Pendiente | NE |
| RNF03 — Integridad | Probar referencias inválidas, duplicados, atomicidad y dos inscripciones concurrentes sobre el mismo cupo. | NE | Pendiente | NE |
| RNF04 — Usabilidad | Revisar campos obligatorios, mensajes de error y confirmaciones en alta de usuario, inscripción y calificación. | NE | Pendiente | NE |
| RNF05 — Accesibilidad | Completar inicio de sesión e inscripción con teclado; revisar foco visible y etiquetas accesibles. | NE | Pendiente | NE |
| RNF06 — Manejo de errores | Provocar fallos controlados; revisar mensajes visibles y registros del servidor, confirmando que no exponen contraseñas ni credenciales. | NE | Pendiente | NE |
| RNF07 — Responsive | Revisar paneles y formularios a 1366 px y 360 px; probar desplazamiento horizontal en tablas extensas. | NE | Pendiente | NE |
| RNF08 — Mantenibilidad | Revisar responsabilidades modulares y construir una base vacía aplicando migraciones versionadas. | NE | Pendiente | NE |

## Registro de hallazgos

Por cada hallazgo, registrar identificador, requisito, pasos para reproducir,
resultado esperado, resultado observado, severidad acordada, evidencia y
estado de corrección. No registrar como defecto una hipótesis que todavía no
se haya reproducido.

| ID | RNF / módulo | Pasos y resultado observado | Evidencia | Severidad | Estado |
| --- | --- | --- | --- | --- | --- |
| — | — | Aún no evaluado | — | — | — |

## Evidencias pendientes

- Resultados de T30–T32 y pruebas de regresión de flujos académicos.
- Evidencias de seguridad, integridad y concurrencia para RNF01–RNF03.
- Revisión de interfaz, teclado, foco y tamaños de pantalla para RNF04–RNF07.
- Creación desde cero de la base PostgreSQL mediante migraciones para RNF08.
- Decisión del equipo sobre el entorno final de despliegue. El arranque local
  documentado en `README.md` no constituye una configuración de producción.
