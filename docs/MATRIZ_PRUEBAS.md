# Matriz de pruebas de regresión

Estado preparado el 18-11-2026 a partir de las pruebas funcionales T01–T43
del contexto del proyecto y la suite automatizada disponible. La suite actual
contiene treinta y cuatro pruebas y aún no representa cobertura completa de
T01–T43.

## Cobertura automatizada observada

| Caso funcional | Prueba automatizada existente | Cobertura observada |
| --- | --- | --- |
| T01 — Registrar usuarios | `test_duplicate_email_or_ci_is_rejected`; `test_common_admin_cannot_create_or_view_administrators` | Parcial: alta, unicidad y límites de administrador común. Faltan validaciones de campos y ciclo completo por rol. |
| T02 — Deshabilitar cuentas | `test_invalid_and_inactive_accounts_cannot_sign_in` | Parcial: una cuenta inactiva no inicia sesión. Falta conservación del historial y permisos para inactivar cuentas administrativas/principal. |
| T03 — Corregir identidad | `test_admin_can_correct_user_identity_without_duplicate_ci` | Edita CI y nombres; rechaza CI duplicado. |
| T04 — Iniciar sesión | `test_login_with_email_and_ci_and_logout_revokes_session`; `test_invalid_and_inactive_accounts_cannot_sign_in` | Parcial: login con CI/correo, credenciales inválidas y cuenta inactiva. |
| T05 — Aplicar permisos | `test_common_admin_cannot_create_or_view_administrators`; `test_student_profile_is_read_only_and_admin_can_update_own_phone` | Parcial: restricciones de administración y perfil de estudiante de solo lectura. |
| T06 — Cerrar sesión | `test_login_with_email_and_ci_and_logout_revokes_session` | Cierra sesión, revoca cookie y rechaza la siguiente consulta autenticada. |
| T07 — Consultar perfil | `test_student_profile_is_read_only_and_admin_can_update_own_phone` | Estudiante autenticada consulta su perfil propio. |
| T08 — Actualizar teléfono | `test_student_profile_is_read_only_and_admin_can_update_own_phone`; `test_admin_can_correct_user_identity_without_duplicate_ci` | Rechaza cambios de perfil para docente y estudiante; permite al administrador editar su teléfono propio y corregir el de las cuentas administradas. |
| T09 — Cambiar contraseña | `test_change_temporary_password_blocks_other_operations_and_revokes_session` | Parcial: cambio temporal, bloqueo previo, revocación de sesión y nuevo login. |
| T10 — Restablecer contraseña | `test_reset_password_revokes_old_sessions_and_forces_change`; `test_change_temporary_password_blocks_other_operations_and_revokes_session` | Parcial: clave temporal, revocación y obligación de cambio. |
| T11 — Gestionar facultades y carreras | `test_career_lifecycle_and_restrictions`; `test_faculty_and_career_inactivation_respect_dependencies`; `test_career_update_allows_keeping_inactive_faculty` | Facultad requerida, relación carrera-facultad, ciclos de vida y bloqueo de eliminación de facultad con carreras. Rechaza crear planes con carrera/facultad inactiva, mover carreras a facultades inactivas y reactivarlas mientras su facultad siga inactiva; permite conservar la facultad inactiva al editar otros datos. |
| T12 — Gestionar planes | `test_plan_units_subjects_prerequisites_and_published_structure`; `test_plan_publication_requires_structure_and_contiguous_semesters`; `test_plan_generation_duplication_and_bulk_subjects` | Código global, publicación e inmutabilidad estructural. Rechaza publicar sin semestres/materias, con numeración no consecutiva o semestres vacíos; permite renumerar y publicar después. Duplicación conserva estructura y prerrequisitos en BORRADOR. |
| T13 — Registrar materias | `test_subject_lifecycle_and_delete_only_when_unreferenced`; `test_plan_units_subjects_prerequisites_and_published_structure`; `test_subject_inactivation_is_blocked_by_vigente_plan` | Alta y código único. El listado informa planes y planes vigentes que usan la materia. |
| T14 — Editar/inactivar materias | `test_subject_lifecycle_and_delete_only_when_unreferenced`; `test_subject_inactivation_is_blocked_by_vigente_plan` | Edición, inactivación y reactivación. Bloquea inactivar una materia incluida en un plan VIGENTE y permite hacerlo tras desactivar el plan. |
| T15 — Eliminar materias | `test_subject_lifecycle_and_delete_only_when_unreferenced` | Rechaza borrado vinculada al plan y permite borrado después de retirarla. |
| T16 — Organizar materias | `test_plan_units_subjects_prerequisites_and_published_structure`; `test_plan_generation_duplication_and_bulk_subjects` | Altas, duplicados, unidad ajena, movimiento y bloqueo estructural. Agrega materias en lote, genera semestres consecutivos y rechaza códigos repetidos o inactivos en la carga masiva. |
| T17 — Prerrequisitos | `test_plan_units_subjects_prerequisites_and_published_structure`; `test_plan_generation_duplication_and_bulk_subjects` | Agrega y retira vínculo; rechaza ciclo. La duplicación reproduce los prerrequisitos entre las materias copiadas. Falta referencia a otro plan. |
| T18 — Asignar plan a estudiante | `test_student_plan_assignment_and_listing`; `test_plan_assignment_rejects_inactive_plan`; `test_offer_enrollment_dashboard_and_schedule_notifications`; `test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period` | Asigna y consulta, incluido un plan BORRADOR; rechaza planes INACTIVOS y cambiarlo después de una inscripción activa. Vincula estudiantes a un grupo de ingreso de su plan. |
| T19 — Registrar periodos | `test_period_dates_and_course_must_fit_period`; `test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period`; `test_modular_sequence_uses_template_holidays_and_period_limit` | Rechaza fecha final anterior a inicio; incorpora carrera y plan por periodo, proyecta dos inicios y asigna plantilla modular al semestre. |
| T20 — Crear paralelos | `test_period_dates_and_course_must_fit_period`; `test_parallel_teacher_schedule_conflict_is_rejected`; `test_planning_room_catalog_and_real_date_conflicts`; `test_schedule_preview_applies_holidays_cancellations_and_reschedules`; `test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period`; `test_modular_sequence_uses_template_holidays_and_period_limit`; `test_room_capacity_limits_schedule_cupo_and_future_reprogramming` | Parcial: fechas, docente, aula, feriados, cancelación y reprogramación; requiere plan incorporado al periodo. La secuencia modular previsualiza 21 clases por materia, excluye feriado, rechaza exceso de semestre y permite A y B del mismo grupo/turno con órdenes inversos y recursos distintos. Impide solapar materias distintas dentro del mismo paralelo. También admite docente pendiente con inscripción cerrada. La vista previa rechaza cupo mayor que los asientos del aula. |
| T21 — Modificar paralelos | `test_course_registration_requires_setup_and_inactivation_closes_it`; `test_parallel_teacher_schedule_conflict_is_rejected`; `test_planning_room_catalog_and_real_date_conflicts`; `test_schedule_preview_applies_holidays_cancellations_and_reschedules`; `test_schedule_update_rejects_new_overlap_for_an_enrolled_student`; `test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period`; `test_modular_sequence_uses_template_holidays_and_period_limit`; `test_room_capacity_limits_schedule_cupo_and_future_reprogramming` | Parcial: estado/apertura, docente, aula, estudiante inscrito, reprogramación y rangos modulares disjuntos. Rechaza cupo mayor que cualquiera de las aulas semanales o sustitutas y reducción de asientos frente a clases futuras. Falta probar concurrencia de recursos en PostgreSQL. |
| T22 — Eliminar paralelos | `test_course_registration_requires_setup_and_inactivation_closes_it` | Elimina paralelo sin inscripciones. Falta bloqueo de borrado con historial. |
| T23 — Abrir/cerrar inscripción | `test_course_registration_requires_setup_and_inactivation_closes_it`; `test_room_capacity_limits_schedule_cupo_and_future_reprogramming`; `test_bulk_registration_is_atomic_and_scoped_to_period`; `test_modular_sequence_uses_template_holidays_and_period_limit` | Rechaza abrir sin horario, aula o docente y permite abrir con aula y cupo compatibles. El lote limita los paralelos al periodo y no aplica aperturas parciales ante un error. Faltan escenarios de concurrencia real. |
| T24 — Consultar oferta | `test_offer_enrollment_dashboard_and_schedule_notifications`; `test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period` | Muestra semestre, prerrequisitos pendientes y disponibilidad del aula; una nota del mismo periodo sigue pendiente para otra materia, mientras en el siguiente periodo se reconoce. Faltan otros escenarios de oferta. |
| T25 — Inscribirse | `test_offer_enrollment_dashboard_and_schedule_notifications`; `test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period` | Inscripción válida, rechazo de duplicado, aula inactiva y prerrequisito del mismo periodo; avance y repetición en uno posterior. Faltan cupo límite y concurrencia. |
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

## Ejecución del 23-11-2026

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest app/tests` | 26 aprobadas | SQLite en memoria; incluye 3 unitarias de calendario y pruebas API para recursos, permisos, prevalidación sin persistencia, conflictos de docente/aula/estudiante, feriados, excepciones, bloques y apertura del paralelo. No representa concurrencia PostgreSQL. |
| `ruff check app migrations` | Aprobado | Backend completo. |
| `bun run typecheck` | Aprobado | React/TypeScript. |
| `bun run build` | Aprobado | Vite; persisten dos avisos de anotaciones Zod y el aviso de bundle mayor a 500 kB. Requirió Node 24 disponible en PATH para iniciar esbuild. |
| `alembic heads` | Un head: `0009_planificacion_recursos` | La migración 0009 depende de `0008_facultades`. |
| `alembic upgrade 0008_facultades:head --sql` | SQL PostgreSQL generado | Revisó la migración nueva sin ejecutar cambios. No se aplicó a la base local. |
| PostgreSQL local | Migración y consultas ORM verificadas | Se aplicó `0009_planificacion_recursos` desde `0008_facultades`; `alembic current` confirmó `0009`. Las consultas de catálogo respondieron con 4 aulas existentes y 0 bloques. Las rutas sin sesión respondieron 401 como corresponde. Concurrencia y suite completa sobre PostgreSQL no fueron ejecutadas. |

## Ejecución posterior del 23-11-2026

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest -q` | 28 aprobadas en SQLite y 28 en PostgreSQL | PostgreSQL usó una base temporal aislada, creada solo para la corrida y eliminada al terminar. La prueba nueva se ejecuta en modalidades MODULAR y SEMESTRAL. |
| `ruff check app migrations`; `ruff format --check app migrations` | Aprobados | Backend completo y migraciones. |
| `bun run build` | Aprobado | TypeScript y Vite con Node 24 en PATH; persisten avisos de comentarios Zod y tamaño del bundle. |
| `alembic upgrade head`; `alembic current`; `alembic check` | Aprobados | PostgreSQL local actualizado de `0009` a `0010_aperturas_plan`; Alembic no detectó cambios de esquema pendientes. |
| Revisión visual autenticada | Pendiente | El navegador disponible llegó a `/login` sin una sesión administrativa. |

Tras ajustar la sugerencia para que un grupo sin estudiantes aptos no marque
materias como recomendadas y verificar la asignación conjunta de plan y grupo,
se repitieron las 28 pruebas SQLite y las 2 variantes MODULAR/SEMESTRAL de
`test_plan_can_start_multiple_groups_and_prerequisites_wait_for_next_period`
en una nueva base PostgreSQL temporal. También aprobaron Ruff, el formato y
la compilación TypeScript/Vite.

## Ejecución del 24-11-2026 — capacidad de aulas

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest -q` | 36 aprobadas | SQLite en memoria. Incluye cupo contra aulas semanales y sustitutas, apertura con aula, reducción de capacidad y oferta estudiantil. |
| Pruebas de paralelos y secuencia modular | 11 aprobadas | PostgreSQL aislado; se creó la base de pruebas, se aplicó Alembic hasta `0013_room_capacity` y se eliminó la base después. |
| `ruff check app migrations`; `ruff format --check app migrations` | Aprobados | Backend y migraciones. |
| `bun run build` | Aprobado | TypeScript y Vite; persisten los avisos de Zod y tamaño del paquete. |
| `alembic check`; `alembic current` | Aprobados | PostgreSQL local en `0013_room_capacity` sin diferencias ORM pendientes. |
| Revisión visual autenticada y concurrencia de capacidad | Pendientes | Las comprobaciones de servidor y build aprobaron; falta recorrer el formulario con sesión y probar dos transacciones simultáneas. |

## Ejecución del 24-11-2026 — vista conjunta y calendario fechado

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest -q` | 37 aprobadas | SQLite en memoria; incluye resumen de materias, sesión semanal real, reprogramación, feriado y rutas sin autenticación. |
| Prueba nueva de integración | Aprobada | PostgreSQL en base temporal aislada creada y eliminada para la ejecución. |
| `ruff check app migrations`; `ruff format --check app migrations` | Aprobados | Backend completo y migraciones. |
| `bun run build` | Aprobado | TypeScript y Vite; persisten avisos de Zod y tamaño del paquete. |
| Revisión visual autenticada | Pendiente | Falta recorrer la tabla, calendario y detalle lateral en tamaños de escritorio y móvil. |

## Ejecución del 24-11-2026 — disponibilidad de recursos

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest -q` | 38 aprobadas | SQLite en memoria; se agregó disponibilidad entre periodos superpuestos, reprogramación, feriado y acceso sin sesión. |
| Dos pruebas de calendario y disponibilidad | Aprobadas | PostgreSQL en base temporal aislada, eliminada al terminar. |
| `bun run test` | 2 aprobadas | Franjas adyacentes sin cruce y franjas superpuestas con horarios serializados por la API. |
| `ruff check app migrations`; `ruff format --check app migrations`; `bun run build` | Aprobados | Backend, TypeScript y Vite. Persisten avisos de Zod y tamaño del paquete. |
| Asignación desde el panel y revisión visual autenticada | Pendientes | El backend valida escrituras; falta recorrer acciones y tamaños de pantalla con sesión administrativa. |

## Ejecución del 24-11-2026 — programación modular conjunta

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest -q` | 39 aprobadas | SQLite; nuevo caso de lote entre dos carreras, conflictos de docente y aula, fin fuera del semestre, atomicidad y permisos. |
| `test_modular_batch.py` | Aprobada | PostgreSQL en base temporal aislada, eliminada después. |
| `bun run test`; `bun run build` | 2 pruebas y compilación aprobadas | TypeScript/Vite; se mantienen los avisos de Zod y paquete grande. |
| `ruff check app migrations`; `ruff format --check app migrations` | Aprobados | Backend completo. |
| Revisión visual del lote y acciones del panel de disponibilidad | Pendiente | El intento de acceso con la credencial inicial configurada en el `.env` local devolvió 401; no se mostró ni registró la contraseña. Falta una sesión administrativa vigente para recorrer el flujo. |

## Ejecución del 25-11-2026 — conteo y calendario por horas

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `bun test` | 6 aprobadas | Incluye regresión: doce materias A/B del mismo grupo cuentan como dos paralelos. |
| `tsc -b`; compilación Vite | Aprobados | La grilla y ambos editores modulares compilaron; persisten avisos de Zod y tamaño de paquete. |
| Revisión visual autenticada | Aprobada para 2027-2 | Resumen 2 paralelos/12 materias; filtro B con seis materias; grilla semanal y agenda en cabecera. No se guardaron cambios académicos. |


## Ejecución del 25-11-2026 — agenda y bloqueo anticipado

| Verificación | Resultado | Entorno / observación |
| --- | --- | --- |
| `pytest -q` | 42 aprobadas | SQLite en memoria; el caso de disponibilidad por rango verifica periodos superpuestos, feriado, reprogramación, datos de materia/docente y acceso sin sesión. |
| `bun test` | 5 aprobadas | Fechas modulares, feriado, secuencias A/B, choques de aula/docente y capacidad. |
| `ruff check` de archivos modificados; `tsc -b`; compilación Vite | Aprobados | Vite mantiene avisos existentes de Zod y tamaño del paquete. |
| Revisión visual autenticada | Aprobada para el flujo A/B | En 2027-2, docente y AULA D-01 aparecen ocupados; la agenda muestra las clases de A, AULA D-02 queda libre y la vista previa de B pasa con cupo 12. No se guardó el borrador. |
| Disponibilidad por rango en PostgreSQL y revisión de teclado/móvil | Pendientes | La prueba de la nueva consulta se ejecutó solo con SQLite; falta verificar carga y presentación en otros tamaños. |

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
