# Matriz de pruebas de regresión

Estado preparado el 18-11-2026 a partir de las pruebas funcionales T01–T43
del contexto del proyecto y la suite automatizada disponible. La suite actual
contiene dieciséis pruebas y aún no representa cobertura completa de T01–T43.

## Cobertura automatizada observada

| Caso funcional | Prueba automatizada existente | Cobertura observada |
| --- | --- | --- |
| T01 — Registrar usuarios | `test_duplicate_email_or_ci_is_rejected`; `test_common_admin_cannot_create_or_view_administrators` | Parcial: alta, unicidad y límites de administrador común. Faltan validaciones de campos y ciclo completo por rol. |
| T02 — Deshabilitar cuentas | `test_invalid_and_inactive_accounts_cannot_sign_in` | Parcial: una cuenta inactiva no inicia sesión. Falta conservación del historial y permisos para inactivar cuentas administrativas/principal. |
| T03 — Corregir identidad | `test_admin_can_correct_user_identity_without_duplicate_ci` | Edita CI y nombres; rechaza CI duplicado. |
| T04 — Iniciar sesión | `test_login_with_email_and_ci_and_logout_revokes_session`; `test_invalid_and_inactive_accounts_cannot_sign_in` | Parcial: login con CI/correo, credenciales inválidas y cuenta inactiva. |
| T05 — Aplicar permisos | `test_common_admin_cannot_create_or_view_administrators`; `test_profile_only_updates_own_phone_and_student_cannot_list_users` | Parcial: restricciones de administración y lista de usuarios. |
| T06 — Cerrar sesión | `test_login_with_email_and_ci_and_logout_revokes_session` | Cierra sesión, revoca cookie y rechaza la siguiente consulta autenticada. |
| T07 — Consultar perfil | `test_profile_only_updates_own_phone_and_student_cannot_list_users` | Estudiante autenticada consulta su perfil propio. |
| T08 — Actualizar teléfono | `test_profile_only_updates_own_phone_and_student_cannot_list_users` | Actualiza teléfono propio e ignora CI enviado en el mismo payload. |
| T09 — Cambiar contraseña | `test_change_temporary_password_blocks_other_operations_and_revokes_session` | Parcial: cambio temporal, bloqueo previo, revocación de sesión y nuevo login. |
| T10 — Restablecer contraseña | `test_reset_password_revokes_old_sessions_and_forces_change`; `test_change_temporary_password_blocks_other_operations_and_revokes_session` | Parcial: clave temporal, revocación y obligación de cambio. |
| T11 — Gestionar facultades y carreras | `test_career_lifecycle_and_restrictions` | Parcial: facultad requerida, relación carrera-facultad, ciclos de vida y bloqueo de eliminación de facultad con carreras. |
| T12 — Gestionar planes | `test_plan_units_subjects_prerequisites_and_published_structure` | Parcial: código global, publicación e inmutabilidad estructural. Faltan transiciones y borrado condicionado. |
| T13 — Registrar materias | `test_subject_lifecycle_and_delete_only_when_unreferenced`; `test_plan_units_subjects_prerequisites_and_published_structure` | Parcial: alta y código único. |
| T14 — Editar/inactivar materias | `test_subject_lifecycle_and_delete_only_when_unreferenced` | Edición, inactivación y reactivación. |
| T15 — Eliminar materias | `test_subject_lifecycle_and_delete_only_when_unreferenced` | Rechaza borrado vinculada al plan y permite borrado después de retirarla. |
| T16 — Organizar materias | `test_plan_units_subjects_prerequisites_and_published_structure` | Parcial: altas, duplicados, unidad ajena, movimiento y bloqueo estructural. |
| T17 — Prerrequisitos | `test_plan_units_subjects_prerequisites_and_published_structure` | Agrega y retira vínculo; rechaza ciclo. Falta referencia a otro plan. |
| T18 — Asignar plan a estudiante | `test_student_plan_assignment_and_listing`; `test_offer_enrollment_dashboard_and_schedule_notifications` | Asigna y consulta; rechaza cambiarlo después de una inscripción activa. |
| T19 — Registrar periodos | `test_period_dates_and_course_must_fit_period` | Rechaza fecha final anterior a inicio. |
| T20 — Crear paralelos | `test_period_dates_and_course_must_fit_period`; `test_parallel_teacher_schedule_conflict_is_rejected` | Parcial: fecha fuera del periodo y cruce de docente. |
| T21 — Modificar paralelos | `test_course_registration_requires_setup_and_inactivation_closes_it`; `test_parallel_teacher_schedule_conflict_is_rejected` | Parcial: inactivación/cierre, reactivación sin reapertura y rechazo de cruce docente. |
| T22 — Eliminar paralelos | `test_course_registration_requires_setup_and_inactivation_closes_it` | Elimina paralelo sin inscripciones. Falta bloqueo de borrado con historial. |
| T23 — Abrir/cerrar inscripción | `test_course_registration_requires_setup_and_inactivation_closes_it` | Rechaza abrir sin horario y permite abrir cuando la configuración es válida; falta probar todas las precondiciones. |
| T24 — Consultar oferta | `test_offer_enrollment_dashboard_and_schedule_notifications` | Parcial: el código ahora muestra semestre y prerrequisitos pendientes y deshabilita la acción; falta cobertura funcional específica de estos comportamientos. |
| T25 — Inscribirse | `test_offer_enrollment_dashboard_and_schedule_notifications` | Parcial: inscripción válida y rechazo de duplicado; la regla de prerrequisitos está implementada en backend, pero falta probar su rechazo, adelanto con requisitos aprobados, repetición, cupo, cruces y concurrencia. |
| T26 — Consultar paralelos | `test_offer_enrollment_dashboard_and_schedule_notifications` | Admin, estudiante y docente consultan cursos según su relación. |
| T27 — Registrar calificación | `test_offer_enrollment_dashboard_and_schedule_notifications` | Docente asignado registra 51; rechaza nota 101. |
| T28 — Corregir calificación | `test_offer_enrollment_dashboard_and_schedule_notifications` | Rechaza duplicar el registro y permite corregir a 50. Falta probar docente ajeno. |
| T29 — Consultar calificación propia | `test_offer_enrollment_dashboard_and_schedule_notifications` | Estudiante consulta su propia nota. |
| T30 — Consultar panel | `test_offer_enrollment_dashboard_and_schedule_notifications` | Comprueba rol para los tres perfiles y el indicador de inscripciones del estudiante; falta cobertura de actividad y aislamiento de datos detallado. |
| T31 — Notificar inscripción | `test_offer_enrollment_dashboard_and_schedule_notifications` | Confirma aviso INSCRIPCION al estudiante después de inscribir. |
| T32 — Notificar cambio de horario | `test_offer_enrollment_dashboard_and_schedule_notifications` | Comprueba avisos CAMBIO_HORARIO al docente y estudiante; incluye lectura propia y rechazo de lectura ajena. |
| T33 — Materias por carrera/plan | `test_offer_enrollment_dashboard_and_schedule_notifications` | Admin exporta PDF y XLSX con filtros de carrera y plan. |
| T34 — Notas de estudiante | `test_offer_enrollment_dashboard_and_schedule_notifications` | Admin exporta PDF y XLSX para el estudiante seleccionado. |
| T35 — Notas de paralelo | `test_offer_enrollment_dashboard_and_schedule_notifications` | Admin exporta PDF y XLSX para el paralelo. |
| T36 — Historial propio | `test_offer_enrollment_dashboard_and_schedule_notifications` | Estudiante exporta PDF y XLSX de su historial. |
| T37 — Notas propias | `test_offer_enrollment_dashboard_and_schedule_notifications` | Estudiante exporta PDF y XLSX de sus notas. |
| T38 — Inscritos por paralelo | `test_offer_enrollment_dashboard_and_schedule_notifications` | Admin exporta PDF y XLSX del paralelo. |
| T39 — Materias inscritas | `test_offer_enrollment_dashboard_and_schedule_notifications` | Estudiante exporta PDF y XLSX de materias propias. |
| T40 — Materias del docente | `test_offer_enrollment_dashboard_and_schedule_notifications` | Admin exporta PDF y XLSX con docente seleccionado. |
| T41 — Configurar principal | `test_installation_allows_only_one_initial_principal` | Crea el principal con cambio obligatorio y rechaza crear un segundo. |
| T42 — Gestionar administradores | `test_common_admin_cannot_create_or_view_administrators` | Parcial: un administrador común no puede crear ni consultar administradores. |
| T43 — Habilitar estudiantes | `test_offer_enrollment_dashboard_and_schedule_notifications` | Crea y revoca habilitación; verifica ambos estados. Falta comprobar origen y fecha. |

La suite también incluye `test_wrong_origin_is_rejected`, que comprueba el
rechazo de un origen no autorizado y no corresponde a un T específico.

## Ejecución del 18-11-2026

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest` | 18 aprobadas en SQLite y 18 en PostgreSQL | PostgreSQL usa la base aislada `academico_pruebas_20261118`; sus tablas se crean y eliminan por prueba. No cubre todos los casos negativos/concurrentes. |
| `ruff check app migrations` | Aprobado | Backend. |
| `ruff format --check app migrations` | Aprobado | Se aplicó el formato Ruff a `notifications/api/routes.py`. |
| `npm run build` | Aprobado | `tsc -b` y Vite. Vite informó comentarios de Zod no interpretables y bundle JS de 521.62 kB; la compilación terminó. |
| `alembic heads/history` | Un único head: `0007_calificaciones` | La cadena contiene `0001`–`0007`. |
| `alembic current/check` | `0007_calificaciones`; sin operaciones nuevas | Verificado en PostgreSQL principal. No se modificó su esquema. |

La primera ejecución de pytest falló seis casos porque el fixture creaba al
administrador principal con cambio obligatorio de contraseña, por lo que las
pruebas de administración recibían 403 antes de probar su comportamiento.
Se ajustó el fixture para representar un principal ya incorporado al sistema.
Después se añadieron pruebas para corrección de identidad, currículo,
calendario, inscripción, notas, panel, avisos, único administrador principal y
exportación de los ocho reportes en PDF/XLSX. La suite completa pasó 18/18 en
SQLite y en PostgreSQL. Los flujos de cuentas temporales mantienen cobertura de
cambio obligatorio.

## Pendientes de regresión

- Completar los escenarios restantes de T01–T43, incluidos permisos,
  transacciones, concurrencia de cupos, calendario/feriados, límites de notas,
  dashboard y aislamiento por rol.
- Completar huecos de T01–T10 y T42 según el nivel de evidencia exigido.
- Registrar resultados manuales para vistas, teclado, foco, pantallas de 1366 y
  360 píxeles, y revisión visual de PDF/XLSX.
- Completar escenarios negativos y concurrentes que figuran como parciales en
  esta matriz.
- No marcar una prueba como aprobada solo por compilación, Ruff o exposición
  de rutas OpenAPI.
