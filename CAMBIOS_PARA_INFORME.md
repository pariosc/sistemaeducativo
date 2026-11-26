# Cambios para reflejar en el informe

## Actualización del informe y diagramas — 25-11-2026

- Se actualizó el documento de Google Docs con el estado real de la
  implementación, pruebas y limitaciones. Los anexos duplicados se sustituyeron
  por referencias a las fuentes del repositorio; la exportación bajó de 109 a
  40 páginas.
- El diagrama de clases v2 aportado se preserva como referencia histórica,
  pero no representa el modelo actual. Se prepararon tres vistas del modelo de
  implementación y se incluyeron en el informe.
- El diagrama relacional se generó desde PostgreSQL 18 local con migración
  `0014_group_trajectory`: 27 tablas, 140 columnas y 40 claves foráneas.
  Se documentaron siete vistas con fuentes editables y metadatos en
  `docs/diagramas/`.
- Se conservaron las ocho páginas CU00–CU07 del Draw.io original y se retiraron
  las ampliaciones fragmentadas. También se exportaron como ocho SVG y un PDF
  vectorial de ocho páginas. Estas páginas aún no reflejan todos los
  cambios de planificación académica y requieren revisión funcional antes de
  presentarse como cobertura completa de ese módulo.

## Perfil en solo lectura para Docente y Estudiante

- Se confirmó que Docentes y Estudiantes consultan su perfil sin poder editar
  datos personales. La API rechaza la edición aunque se intente enviar la
  solicitud directamente.
- Administración puede corregir CI, nombres, apellidos y teléfono de docentes
  y estudiantes desde gestión de usuarios. El Administrador puede seguir
  actualizando su propio teléfono; el cambio de contraseña continúa habilitado
  para todos los roles.
- Se actualizaron RF07/RF08, HU05, P03/P14 y T08 en el contexto funcional.
- **Secciones del informe a revisar:** permisos de perfil, gestión de usuarios,
  aceptación de HU05 y capturas del perfil por rol.

## Entorno de desarrollo en Windows

- Se documentó el proceso para preparar una computadora Windows nueva:
  instalar Git y clonar el repositorio, habilitar WSL 2, instalar herramientas
  con WinGet, preparar Python 3.14 y dependencias, configurar `.env`, crear el
  administrador inicial y levantar PostgreSQL, API y frontend desde PowerShell.
- La secuencia utiliza Docker Desktop con WSL 2 y conserva los datos locales al
  detener los servicios. Debe verificarse en Windows real antes de afirmar que
  fue probada.
- **Secciones del informe a revisar:** requisitos de software y hardware,
  instalación, configuración y ejecución del entorno de desarrollo.

Bitácora de decisiones e implementación. Antes de la entrega, trasladar los
cambios confirmados al informe académico y verificar que coincidan con el
sistema final. Las propuestas y los pendientes están separados de lo ya
implementado.

## Cambios implementados

### 17-11-2026 — Acceso inicial y contraseña obligatoria

- Se configuró la cuenta principal inicial con identificador `admin`; sus datos
  y contraseña de desarrollo se leen desde variables `INITIAL_ADMIN_*` en el
  archivo local `.env`, excluido del repositorio.
- El alta inicial del administrador principal establece
  `debe_cambiar_contrasena = true`.
- Toda cuenta creada por administración ya recibe una contraseña temporal y la
  marca de cambio obligatorio. El restablecimiento de contraseña también
  activa esa marca.
- Se añadió la migración `0002_force_password_change`, que activa el cambio
  obligatorio para todas las cuentas existentes al desplegarla.
- Mientras la marca esté activa, el backend permite cambiar la contraseña y
  cerrar sesión; bloquea las demás operaciones autenticadas. La interfaz lleva
  a la pantalla de cambio al iniciar sesión y solicita ingresar otra vez tras
  guardar la contraseña nueva.
- El cambio de contraseña revoca las sesiones vigentes de esa cuenta. La clave
  configurada para el bootstrap en `.env` sirve para el primer ingreso; después
  de cambiarla deja de ser la contraseña de acceso.
- La migración se aplicó en la base local; se verificó que todas las cuentas
  existentes quedaron marcadas para cambio obligatorio (1 de 1 cuenta).

### Texto sugerido para el informe

> Por seguridad, el sistema exige que todo usuario cambie su contraseña en el
> primer ingreso y después de un restablecimiento. Esta condición se aplica en
> el servidor para los roles de administrador, docente y estudiante; hasta
> completar el cambio, solo se habilitan las operaciones necesarias para
> cambiar la contraseña o cerrar sesión. Al guardar una nueva contraseña, se
> revocan las sesiones vigentes y el usuario debe autenticarse nuevamente.

**Secciones del informe a revisar:** seguridad, autenticación, gestión de
usuarios, casos de uso de inicio/cambio de contraseña, reglas de negocio,
diagrama de secuencia y capturas de las interfaces correspondientes.

### 17-11-2026 — Longitud mínima de contraseña

- Se redujo de 12 a **8 caracteres** el mínimo para una contraseña nueva, tanto
  en la validación del backend como en la interfaz y en la configuración
  interactiva inicial.
- Se conserva el máximo de 128 caracteres y la política de cambio obligatorio
  para todos los roles.

**Secciones del informe a revisar:** requisitos no funcionales de seguridad,
reglas de validación de credenciales y capturas del formulario de cambio.

## Pendiente de actualización/verificación

- Aplicar `uv run alembic upgrade head` en las demás bases de datos al
  desplegar, para activar la regla sobre las cuentas existentes en esos
  entornos.
- Verificar el flujo con cuentas de los tres roles y actualizar las evidencias
  del informe con capturas reales.
- No incluir contraseñas del `.env` en el informe ni en capturas.

## Fase 2 — Currículo

### 17-11-2026 — Decisiones confirmadas e implementación inicial

- Se confirmó que el código de plan es único globalmente.
- Solo se permite modificar estructuralmente un plan en BORRADOR; un plan
  publicado como VIGENTE se conserva y los cambios posteriores requieren crear
  otro plan. Un plan INACTIVO puede volver a VIGENTE, conservando bloqueada su
  estructura.
- La asignación del plan al estudiante puede corregirse antes de que existan
  inscripciones o notas. Después del primer registro académico no se permite
  cambiarla.
- Se implementaron las entidades Carrera, Materia, PlanEstudio, UnidadPlan,
  MateriaPlan y prerrequisitos; el perfil de estudiante conserva una relación
  opcional al plan asignado.
- El backend ofrece gestión protegida por rol administrador, unicidad de
  códigos, pertenencia de unidades y materias al mismo plan, autorreferencias
  y ciclos de prerrequisitos, eliminación condicionada e inmutabilidad
  estructural fuera de BORRADOR.
- Se añadieron pantallas para gestionar carreras, materias, planes, unidades,
  prerrequisitos y asignar planes a estudiantes.
- PostgreSQL local se actualizó a `0003_curriculum`. TSC, Ruff, configuración
  de mapeadores ORM y disponibilidad local de API/frontend pasaron. La
  regresión del 18-11-2026 añadió cuatro pruebas automatizadas que cubren
  parcialmente T11–T18; los huecos están detallados en `docs/MATRIZ_PRUEBAS.md`.

**Secciones del informe a revisar:** modelo lógico y físico, reglas de negocio,
integridad referencial, restricciones de unicidad, casos de uso CU02, historias
HU08–HU13, pantallas P03–P06, trazabilidad RF11–RF18 y pruebas T11–T18.

**Pendiente:** completar T11–T18 con los casos válidos y rechazados faltantes,
verificar visualmente las pantallas y comprobar el bloqueo de cambio de plan
cuando exista historial académico.

## Fase 3 — Periodos y paralelos

### 17-11-2026 — Registro de periodos

- Se implementaron registro y consulta de periodos académicos, con validación
  para rechazar fecha final anterior a la inicial.
- No se agregó edición ni eliminación porque la pantalla P07 especifica
  registro y consulta y no autoriza otras operaciones.
- La tabla `periodos_academicos` quedó en la migración
  `0004_periodos_academicos`.

### 17-11-2026 — Paralelos y calendario

- Se implementan cursos/ofertas como paralelos ligados a materia del plan y
  periodo, con cupo, fechas, docente, estado activo, apertura de inscripción y
  horarios semanales.
- Se validan fechas dentro del periodo, conflictos en fechas reales de clase
  para docentes y estudiantes inscritos, cupo frente a inscripciones activas y
  requisitos antes de abrir la inscripción.
- Las clases recurrentes se calculan sobre intervalo inclusivo. Los feriados
  son comunes al periodo; cada paralelo admite cancelación o reprogramación de
  sesiones. Inactivar cierra inscripción; reactivar la mantiene cerrada.
- Páginas: `/admin/periodos` y `/admin/paralelos`. La migración
  `0005_paralelos_calendario` se aplicó a PostgreSQL local; Alembic reportó esa
  revisión como actual.
- Ruff y compilación TypeScript/Vite aprobaron. La verificación funcional
  automatizada del 18-11 cubre parcialmente T19–T23; T26 se comprueba para los
  tres roles. El bloqueo de borrado con historial y algunos cruces siguen sin
  probarse.

**Secciones del informe a revisar:** modelo físico, RN09–RN11, CU03,
HU14–HU16, pantallas P07–P08, RF19–RF23/RF26 y pruebas T19–T23/T26.

## Fase 4 — Habilitaciones e inscripciones

### 17-11-2026 — Implementación de flujo académico

- Se agregan habilitaciones individuales por estudiante y periodo, administradas
  manualmente con origen y fecha de autorización. No se automatiza el origen
  SISTEMA mientras su regla permanezca pendiente.
- La oferta del estudiante se limita a su plan vigente. La inscripción valida
  cuenta, plan/materia, habilitación, estado y apertura del paralelo, cupo,
  prerrequisitos aprobados (>=51), duplicidad por materia/periodo y cruces de
  horario.
- Se serializa por estudiante y paralelo para impedir duplicidad, sobrecupo y
  inscripciones con horarios incompatibles bajo solicitudes concurrentes. El
  reingreso tras RETIRADA no se habilita mientras siga sin decisión.
- La inscripción y su notificación interna se guardan en una transacción.
  Migración aplicada: `0006_habilitaciones`.
- Páginas: `/admin/habilitaciones` y `/estudiante/oferta`. TSC, Vite, Ruff,
  ORM y comparación de esquema Alembic aprobados. Las pruebas del 18-11 cubren
  parcialmente T24, T25, T31 y T43 con inscripción, duplicado, aviso y
  habilitación activa; faltan casos de cupo, requisitos, cruces y revocación.

**Secciones del informe a revisar:** RN12–RN14, CU04, HU17–HU18/HU29,
P03/P09, RF24–RF25/RF31/RF43, modelo físico y pruebas T24/T25/T31/T43.

## Fase 5 — Calificaciones

### 17-11-2026 — Registro, corrección y consulta

- Se agrega una nota final entera de 0 a 100 por inscripción, protegida con
  restricción de rango y unicidad en base de datos.
- Solo el docente actualmente asignado al paralelo puede registrar o corregir
  notas de sus inscripciones activas. El estudiante autenticado consulta sus
  propias notas por materia, paralelo y periodo.
- La corrección actualiza la fecha de registro. No se implementó cierre
  académico ni bloqueo de cambios posteriores porque su política sigue
  pendiente en RN15/14.8.
- Migración aplicada: `0007_calificaciones`. Páginas: `/docente/calificaciones`
  y `/estudiante/calificaciones`. Pruebas del 18-11 cubren registro, rango,
  duplicidad, corrección y consulta propia (T27–T29); falta probar escritura de
  un docente ajeno.

## Fase 6 — Reportes académicos

### 17-11-2026 — Exportación PDF y Excel

- Se implementan los ocho reportes RF33–RF40 en PDF y XLSX. La generación
  comparte el conjunto de datos y filtros para ambos formatos.
- La API autoriza cada tipo de reporte por rol y valida los filtros. El
  administrador obtiene reportes institucionales permitidos; el docente queda
  limitado a sus paralelos y los estudiantes a sus propios datos.
- Se agregó `/reportes` para seleccionar filtros y descargar el archivo. Los
  formatos se generan en backend sin agregar dependencias externas.
- TSC, compilación Vite, Ruff, configuración ORM y exposición del endpoint en
  OpenAPI aprobaron. La prueba de integración del 18-11 generó los ocho
  reportes en PDF y XLSX con filtros de rol; falta abrirlos en una aplicación
  ofimática y revisar visualmente el formato.

### 23-11-2026 — Vista previa, impresión y filtros ampliados

- A solicitud del usuario, los reportes ahora muestran una vista previa en
  tabla antes de imprimir o exportar. La impresión usa estilos propios para
  conservar únicamente esa tabla y sus encabezados.
- Se agregó `GET /api/v1/reports/{report_code}/preview` con el mismo conjunto
  de datos y autorización que la exportación. `P13` y `RN17` registran la
  decisión; no se crearon reglas académicas ni permisos nuevos.
- Se conservaron los filtros existentes y se agregaron periodo académico,
  estado académico, rango de fechas y carrera/plan en más reportes. El estado
  aplica por reporte: plan en RF33, inscripción en RF34–RF39 y paralelo en
  RF40. Las fechas se interpretan por solapamiento con el periodo en
  RF34–RF39 y con el paralelo en RF40.
- Ruff, compilación Python, typecheck y compilación Vite aprobaron. Las 18
  pruebas pasaron con SQLite en un entorno aislado porque AppLocker bloquea
  `_sqlite3` del Python 3.14 del proyecto en esta máquina. Falta revisión
  visual de la vista previa y de la impresión en navegador.

## Fase 7 — Paneles, avisos e integración

### 17-11-2026 — Panel por rol y notificaciones internas

- Se implementó `/dashboard` como destino posterior al inicio de sesión, con
  indicadores y actividad reciente filtrados por rol. El administrador ve
  información institucional; el docente, sus paralelos; el estudiante, sus
  inscripciones y notas.
- Se implementaron `GET /api/v1/notifications` y
  `PATCH /api/v1/notifications/{notification_id}/read`. El servidor devuelve
  y modifica únicamente avisos del usuario autenticado.
- Se generan avisos internos para el docente asignado y estudiantes con
  inscripción activa cuando se modifica un horario, una excepción de sesión o
  un feriado que afecta sus clases. Se guardan en la misma transacción del
  cambio. Al cambiar un feriado, se omiten paralelos que ya tienen una
  excepción para esa sesión. La inscripción confirmada conserva el aviso ya
  implementado en Fase 4.
- Se añadieron indicadores, accesos rápidos, actividad reciente y listado de
  avisos al panel; queda disponible marcar cada aviso como leído.
- La prueba de integración del 18-11 comprueba el panel para los tres roles,
  el aviso de inscripción, los avisos de cambio de horario al docente y al
  estudiante, y la lectura limitada al destinatario (T30–T32). Faltan casos de
  aislamiento adicionales y revisión visual del panel.
- Se documentó el arranque local en `README.md` y se creó
  `docs/EVALUACION_CALIDAD.md` con los criterios RNF01–RNF08 y campos de
  evidencia, sin asignar puntuaciones no medidas. El backend usa el puerto
  `8100`, igual que el proxy configurado en Vite.
- Ruff y compilación TypeScript/Vite aprobaron. OpenAPI expone las tres rutas
  nuevas. T30–T32 tienen cobertura automatizada parcial; RNF01–RNF08 y las
  evidencias de defensa/despliegue siguen pendientes.

**Secciones del informe a revisar:** RF30–RF32, RN16, HU22–HU23, P02, flujos
de consulta/lectura de avisos y pruebas T30–T32. Registrar también las
notificaciones ocasionadas por feriados y excepciones de calendario.

## Regresión — 18-11-2026

- Se ordenó la cobertura automatizada frente a los casos T01–T43 en
  `docs/MATRIZ_PRUEBAS.md`. La suite contiene diez pruebas de acceso,
  cuatro de currículo y cuatro de integración para calendario, inscripción,
  notas, panel, avisos y reportes. T41 también tiene una prueba específica de
  unicidad del administrador principal.
- La primera ejecución obtuvo 2 aprobadas y 6 fallidas porque el fixture del
  administrador principal conservaba el cambio obligatorio de contraseña y
  bloqueaba las operaciones administrativas que esas pruebas necesitaban.
  Se ajustó el fixture para representar una cuenta principal ya incorporada al
  sistema; la segunda ejecución aprobó 8/8. Luego se añadieron pruebas por
  módulo y la suite completa aprobó 18/18 tanto con SQLite como con PostgreSQL.
  PostgreSQL usó una base aislada de pruebas; las tablas se crean y eliminan
  desde el fixture. Las pruebas de cuentas temporales mantienen cobertura de
  cambio obligatorio.
- Las pruebas de calendario detectaron que la reflexión de la tabla de
  inscripciones durante una transacción SQLite con `StaticPool` podía revertir
  el curso creado. Se reemplazó esa consulta dinámica por consultas ORM de
  `Inscripcion`; las pruebas de creación, cruces e inscripción pasan. La
  integración también confirma el bloqueo de cambio de plan con historial y
  la revocación de habilitación (T18/T43).
- `ruff check app migrations`, `ruff format --check app migrations` y
  `npm run build` aprobaron. Vite dejó advertencias de comentarios de Zod y
  tamaño de bundle (521.62 kB sin comprimir).
- `alembic heads/history` confirma una cadena única hasta `0007_calificaciones`.
  En PostgreSQL principal, `alembic current` reportó `0007_calificaciones` y
  `alembic check` no detectó operaciones pendientes; estos comandos no
  modificaron el esquema.
- Quedan escenarios de T01–T43 sin cubrir, RNF01–RNF08, revisión manual de
  interfaz/PDF/XLSX y despliegue de entrega; compilación y lint no sustituyen
  esos resultados.

## Cambio de alcance de currículo — Facultad

- Se confirmó que cada carrera pertenece a una sola facultad. Se amplió RF11
  sin crear códigos nuevos: el administrador gestiona el catálogo de facultades
  y carreras; una facultad con carreras no puede eliminarse. El modelo v8 y la
  pantalla P04 ya reflejan la asociación.
- La implementación agrega `facultades`, `carreras.facultad_id`, API y pantallas
  administrativas. La migración `0008_facultades` asigna a las carreras ya
  existentes la facultad de transición “Facultad pendiente de asignación” para
  preservar datos y hacer obligatoria la relación; el administrador puede
  reasignarlas posteriormente.
- La migración se aplicó a PostgreSQL aislado de pruebas y la suite completa
  aprobó 18/18 en PostgreSQL; 18/18 también en SQLite. Ruff y compilación
  TypeScript/Vite aprobaron. La base PostgreSQL principal aún no tiene aplicada
  `0008_facultades`: la revisión automática bloqueó ese cambio de esquema y
  datos al requerir autorización explícita. Aplicar `alembic upgrade head`
  después de obtenerla.
- **Secciones del informe a revisar:** RF11, HU08, RN04, modelo de dominio,
  modelo físico, asociación Facultad–Carrera y P04. Incorporar Facultad en los
  diagramas editables y capturas de la interfaz.

## Navegación y códigos visibles — interfaz

- Se reemplazó la navegación horizontal por una barra lateral compartida por
  Administrador, Docente y Estudiante. Las opciones están agrupadas por área,
  se despliegan por grupo y resaltan la pantalla activa; el menú se adapta a
  pantallas pequeñas.
- Se confirmó que los códigos de facultad, carrera, materia y plan se ingresan
  manualmente conforme a la práctica institucional. No se autogeneran; se
  conservan la conversión a mayúsculas y las validaciones de duplicados
  implementadas. El código de plan tiene unicidad global confirmada.
- **Secciones del informe a revisar:** descripción de navegación, capturas de
  pantallas con la barra lateral y registro manual de códigos institucionales.

## Aclaración del plan modular — progresión semestral

- Se confirmó que tanto los planes MODULARES como los SEMESTRALES se organizan
  en semestres. La modalidad SEMESTRAL cursa las materias del semestre en
  conjunto; la modalidad MODULAR las distribuye en bloques mensuales, sin
  cambiar el semestre al que pertenece cada materia.
- Se corrigió esta distinción en RN06, RN07, RF16, HU11, P05 y T16 del contexto.
  La base de datos no necesita una nueva estructura para esta aclaración: cada
  materia ya se asocia a una unidad del plan.
- El sistema actual valida el prerrequisito aprobado, pero no registra el
  semestre como restricción temporal de inscripción. Se confirmó que no debe
  existir esa barrera: puede retomar materias reprobadas o adelantar materias de
  cualquier semestre si se ofrecen y cumple los prerrequisitos y demás
  condiciones de inscripción.
- La administración del plan se reorganizó en secciones de Semestres, Materias
  y Prerrequisitos; asignar estudiantes quedó separado. En ambos tipos de plan
  la interfaz habla de semestres y explica el ritmo modular o semestral.
- La API de oferta ahora incluye el semestre de la materia y los prerrequisitos
  pendientes. La pantalla los muestra y deshabilita el botón de inscripción
  cuando faltan aprobaciones; el backend mantiene la validación autoritativa y
  requiere habilitación individual activa para el periodo.
- La nota mínima continúa fija en 51. No hay una configuración para cambiarla
  desde la interfaz; se usa en el backend, panel y vista de calificaciones. Si
  se quiere permitir otro umbral, antes debe definirse quién puede cambiarlo y
  si el cambio afecta solo evaluaciones futuras o también notas históricas.
- Ruff y `tsc -b`/Vite build aprobaron. Las pruebas funcionales T24/T25 de
  presentación y bloqueo por prerrequisitos no se ejecutaron en esta actualización.
- **Secciones del informe a revisar:** modalidades del plan, organización de
  materias por semestre, progresión modular y restricciones de inscripción.

## Planificación de semestre académico — oferta y habilitaciones

- Se aclaró que `PeriodoAcademico` representa el ciclo semestral de oferta e
  inscripción común a planes MODULARES y SEMESTRALES. El semestre curricular de
  `UnidadPlan` sigue siendo una posición dentro del plan y no se fusiona con el
  periodo real. Un estudiante puede cursar materias de distintos semestres
  curriculares durante el mismo periodo.
- Los bloques mensuales de modalidad MODULAR se delimitan por las fechas de cada
  paralelo dentro del periodo semestral. No se añadió una entidad de módulo/mes.
- La navegación administrativa ahora agrupa las acciones bajo “Planificación
  académica”. La pantalla de planificación explica la secuencia, permite saltar
  de cada semestre a su oferta y habilitaciones, y conserva el mismo periodo al
  navegar entre esas pantallas. La lista de paralelos se filtra por el semestre
  seleccionado.
- Las habilitaciones continúan siendo individuales y separadas de abrir las
  inscripciones de los paralelos. El registro y publicación de notas sigue el
  flujo actual del docente; el visto bueno administrativo permanece pendiente
  de decisión y no se implementó.
- **Secciones del informe a revisar:** RN09, HU14, P07, modelo conceptual,
  navegación y capturas de planificación, oferta y habilitaciones.

## Arranque local con Make

- Se añadió un `Makefile` con `make setup`, `make principal` y `make dev` para
  preparar dependencias, crear una vez el administrador inicial y levantar
  PostgreSQL, migraciones, API y frontend con un comando.
- `make dev` cierra los procesos de backend/frontend y detiene PostgreSQL con
  `docker compose down` al presionar Ctrl+C, sin borrar el volumen local. La
  contraseña de administrador sigue configurándose en `.env`, excluido de Git.
- Ruff, sintaxis Python y `make -n` aprobaron. No se levantaron los servicios ni
  se ejecutaron pruebas funcionales en esta actualización.
- **Secciones del informe a revisar:** ejecución local y reproducibilidad del
  entorno de desarrollo.

## Validación de datos, usabilidad y tema visual — 22-11-2026

- Se añadió un módulo compartido de validación en el frontend con reglas para
  CI, teléfono, nombres, códigos, correo, contraseñas, fechas, horas, notas y
  números positivos. Los mensajes son específicos y están en español.
- El cliente de API convierte errores HTTP en mensajes legibles: 401 indica
  sesión expirada o credenciales inválidas, 403 indica falta de permisos y 422
  muestra el campo devuelto por el backend cuando está disponible. Esto también
  aplica a la descarga de reportes.
- Se reforzaron los formularios de acceso, cambio de contraseña, perfil,
  usuarios, catálogos, planes, semestres, paralelos, horarios, excepciones,
  oferta del estudiante, calificaciones y reportes. Las selecciones vacías ya
  no se preseleccionan silenciosamente en reportes y se pide confirmación antes
  de inscribirse o corregir una nota.
- Se implementó alternancia de tema claro/oscuro con icono sol/luna. El botón
  muestra la acción siguiente: «Modo claro» cuando está activo el oscuro y
  «Modo oscuro» cuando está activo el claro. La preferencia se guarda en el
  navegador, se aplica antes del primer render y el botón está disponible en
  login, cambio de contraseña y navegación principal.
- Se mantienen las reglas académicas y autorizaciones del backend. Las
  validaciones del frontend son una ayuda; el servidor sigue siendo la fuente
  autoritativa.
- Verificación ejecutada: `uv run ruff check app migrations` aprobó, `uv run
  pytest` aprobó 18/18, `bun run typecheck` y `bun run build` aprobaron, y los
  endpoints `/api/health` y `/` respondieron HTTP 200 después de reiniciar API
  y PostgreSQL. Vite conserva los avisos conocidos de Zod y tamaño de bundle.
- **Secciones del informe a revisar:** RNF de usabilidad y seguridad,
  validaciones por pantalla, manejo de errores, accesibilidad de mensajes,
  capturas con tema claro y oscuro, y registro de pruebas de regresión.

## Planificación de aulas, turnos y horario semanal — 23-11-2026

- P08 incorpora una vista semanal conjunta de paralelos por semestre, con
  acceso al detalle para administrar asignación y horario. Las fechas de cada
  paralelo se conservan para modalidad semestral y modular.
- Se incorpora un catálogo de aulas por código sencillo y franjas configurables
  para Madrugada, Mañana, Tarde y Noche. Las franjas son plantillas: se copian
  al horario y sus cambios no alteran lo ya guardado.
- La API rechaza aulas inactivas o inexistentes y cruces de aula en una fecha de
  clase real, considerando feriados y excepciones. También valida docente e
  inscripciones. El formulario consulta una prevalidación al cambiar la franja y
  muestra conflictos antes del envío; al guardar, el servidor vuelve a validar
  como autoridad final.
- La configuración se ubica en `/admin/planificacion-config`. Habilitación
  individual y apertura de inscripción permanecen como controles separados.
- Se añadieron pruebas unitarias de fechas inclusivas, feriados, cancelación,
  reprogramación y límites de superposición; pruebas de API para catálogo,
  permisos, horas inválidas, prevalidación sin persistencia, cruces de aula,
  docente y estudiante inscrito, bloques modulares disjuntos, la independencia
  entre plantillas y horarios guardados, y el flujo de apertura.
- Verificación ejecutada el 23-11-2026: 26 pruebas backend aprobaron en
  SQLite; Ruff, TypeScript y build Vite aprobaron. La base PostgreSQL local no
  estaba accesible durante esa primera ejecución; posteriormente se detectó que
  estaba en `0008_facultades`, se aplicó `0009_planificacion_recursos` y
  Alembic confirmó `0009`. Las consultas ORM reales devolvieron las aulas
  heredadas y la lista de bloques; las pruebas concurrentes de PostgreSQL siguen
  pendientes.
- **Secciones del informe a revisar:** RN09/RN11, modelo físico, CU03, P08,
  decisiones registradas en 14.7 y cobertura T20/T21.

## Decisión de flujo centrado en el plan — 23-11-2026

- Se confirmó que las carreras se incorporarán explícitamente al periodo y que
  una carrera podrá trabajar con varios planes VIGENTES en el mismo semestre.
- La planificación muestra automáticamente las materias de cada plan,
  agrupadas por semestre curricular; el administrador decidirá qué ofertar.
  No ofertar una materia en un periodo no altera el catálogo global ni la
  estructura publicada del plan.
- La modalidad SEMESTRAL programará las materias elegidas dentro del semestre
  académico común; la MODULAR las distribuirá en tramos mensuales del mismo
  periodo. Quedan por definir los límites de los tramos y el retiro de ofertas
  con inscripciones o notas. La implementación se resume en la sección siguiente.
- Se agregó al diseño de la próxima planificación una propuesta de materias
  para el nuevo semestre basada en el plan y el avance registrado de sus
  estudiantes: continuidad, repetición y resultados aún sin nota. La decisión
  de abrir paralelos sigue siendo administrativa. El cálculo y el momento de
  corte de resultados con visto bueno administrativo están pendientes. La
  implementación actual se resume en la sección siguiente.
- Se confirmó para ambas modalidades que una materia dependiente solo podrá
  cursarse en un periodo académico posterior al de la aprobación de su
  prerrequisito; tampoco se repite una materia reprobada en el mismo periodo.
  Se proyectará la secuencia de semestres del plan desde cada inicio de
  estudiantes, según su duración (nueve es solo un ejemplo). Registrar esas
  aperturas como grupos de ingreso, la comprobación del periodo de la nota y la
  proyección se implementaron como se resume en la sección siguiente.
- **Secciones del informe a revisar:** RN06/RN09, P07/P08, modelo físico y
  trazabilidad de RF19–RF23.

## Implementación de planificación por plan e ingresos — 23-11-2026

- La migración `0010_aperturas_plan` agrega las relaciones explícitas
  periodo–carrera y periodo–plan, más los grupos de ingreso de cada versión del
  plan. Una misma versión admite grupos iniciados en diferentes periodos. Cada
  estudiante puede vincularse a un grupo de su plan. Las ofertas ya existentes
  se incorporan a las nuevas relaciones durante la migración; la asignación de
  grupo de estudiantes existentes se realiza desde la interfaz.
- La pantalla del semestre permite filtrar carreras por facultad, incorporarlas
  junto con sus planes VIGENTES,
  iniciar un grupo y ver la proyección hasta el último semestre curricular del
  plan. Los periodos aún no creados aparecen como pendientes de programar.
  Abrir una materia requiere una elección administrativa; el sistema no crea
  paralelos automáticamente.
- La oferta muestra las materias agrupadas por semestre curricular y, para
  estudiantes activos del plan, los conteos de aptos, repetidores, bloqueados,
  aprobados y sin nota. Solo se toman resultados de periodos terminados antes
  de comenzar el semestre objetivo. La sugerencia destaca materias del
  semestre nominal de estudiantes aptos o con repetidores aptos. Si se adopta el
  visto bueno administrativo de notas, habrá que revisar ese criterio.
- El calendario semanal permanece visible al abrir el detalle de un paralelo
  en un panel de la misma página. Puede filtrarse por facultad, carrera, plan,
  docente y aula. Al editar docente o fechas, la API previsualiza los cruces
  sin persistir el borrador. La modalidad MODULAR exige que el administrador
  indique las fechas de su tramo; SEMESTRAL sugiere el periodo completo.
- La API de inscripción y la oferta del estudiante consideran aprobado un
  prerrequisito solo cuando la nota proviene de un periodo terminado antes del
  inicio del periodo objetivo. Aprobar en enero no habilita la dependiente en
  otro módulo del mismo semestre. Una materia reprobada solo se repite en un
  semestre académico posterior si vuelve a ofertarse.
- Verificación: 28 pruebas aprobaron tanto en SQLite como en una base
  PostgreSQL temporal, incluidas ambas modalidades, repetición, avance,
  proyección de grupos y vista previa de conflictos sin persistencia. Ruff,
  formato y compilación TypeScript/Vite aprobaron. La base PostgreSQL local
  quedó en `0010_aperturas_plan`; `alembic check` no detectó diferencias de
  esquema. Falta revisión visual administrativa autenticada y pruebas de
  concurrencia sobre recursos.
- Después de exigir estudiantes aptos para destacar una materia, agregar el
  filtro explícito por facultad y permitir asignar plan y grupo juntos,
  volvieron a pasar las 28 pruebas SQLite, las 2 pruebas de progresión en
  PostgreSQL temporal, Ruff y la compilación TypeScript/Vite.
- **Secciones del informe a revisar:** RN06–RN09/RN13, RF18–RF25, HU13–HU18,
  P07/P08/P09, modelo físico, migraciones y casos T18–T25.

## Integración con cambios del equipo — 24-11-2026

- Se incorporaron cuatro commits remotos a `main` y se reaplicó el trabajo
  local de planificación académica. En los conflictos de interfaz se conservó
  el nuevo diseño compartido y la regla de perfil de solo lectura para docentes
  y estudiantes. Administración mantiene la corrección de teléfono.
- La salida de paralelos incluye los campos de carrera y plan usados por los
  reportes del equipo y el identificador de facultad usado por el calendario.
  Se cambió la dependencia de filtros de reportes a una función asíncrona
  porque la prueba de integración quedaba esperando en la primera consulta de
  exportación. Con el ajuste, aprobaron 28 pruebas backend, Ruff y la
  compilación TypeScript/Vite. Falta revisión visual autenticada.

## Currículo — integridad, validaciones y usabilidad — 24-11-2026

- Se reforzó la publicación de planes: no se permite publicar ni reactivar un
  plan sin semestres con materias, con numeración no consecutiva desde 1, con
  semestres vacíos o con carrera, facultad o materias inactivas. El backend
  devuelve diagnósticos tipados (errores y advertencias) y la interfaz los
  muestra antes de intentar el cambio de estado.
- Un prerrequisito ubicado en el mismo semestre o en uno posterior se informa
  como advertencia y no bloquea la publicación. Se conserva la regla confirmada
  de que el semestre curricular no limita retomar materias pendientes ni
  adelantar materias posteriores.
- Una materia incorporada a un plan VIGENTE no puede inactivarse mientras ese
  plan siga vigente; el mensaje indica desactivar el plan o preparar una nueva
  versión sin la materia. La regla es coherente con la inactivación de carreras
  y facultades.
- Una carrera puede conservar su facultad inactiva al editar otros datos, pero
  no puede moverse a una facultad inactiva ni reactivarse mientras su facultad
  siga inactiva. Se rechaza crear planes para carreras o facultades inactivas.
- La asignación de plan admite BORRADOR o VIGENTE con carrera y facultad
  activas; un plan INACTIVO no admite nuevas asignaciones. El cambio sigue
  bloqueado cuando el estudiante ya tiene inscripciones.
- Se añadieron herramientas de trabajo: duplicación de un plan con semestres,
  materias y prerrequisitos en un nuevo BORRADOR; generación de varios
  semestres consecutivos; renumeración 1..N; carga masiva de materias con
  búsqueda, selección múltiple y aviso de materias compartidas; y detección de
  candidatos a prerrequisito que evita ciclos y muestra si la materia está en un
  semestre posterior.
- El catálogo muestra uso por materia (planes, planes vigentes, carreras y
  ofertas), filtros por texto y estado, y deshabilita acciones destructivas con
  el motivo visible. La malla curricular resalta relaciones, materias inactivas
  y observaciones, y permite mover materias arrastrando o desde el detalle.
- Se agregaron los endpoints `POST /plans/{id}/duplicate`,
  `POST /plans/{id}/units/generate`, `POST /plans/{id}/units/renumber` y
  `POST /plans/{id}/subjects/bulk`. La migración
  `0011_curriculum_integrity` agrega un índice sobre `materias_plan.materia_id`;
  se aplicó posteriormente a la base PostgreSQL local al incorporar la
  actualización del equipo con autorización del usuario.
- Verificación ejecutada: 34 pruebas backend aprobaron en SQLite, entre ellas
  publicación con estructura incompleta, renumeración, duplicación, carga
  masiva, inactivación de materia en plan vigente y rechazo de asignación a
  plan inactivo. Ruff aprobó `app` y `migrations`; `tsc -b` y el build de Vite
  aprobaron con los avisos preexistentes de Zod y tamaño de bundle. No se
  realizó revisión visual autenticada ni prueba de concurrencia en PostgreSQL.
- **Secciones del informe a revisar:** RN04–RN08, RF11–RF18, HU08–HU13,
  P04–P06, T11–T18, modelo físico (índice de materias del plan) y capturas de
  facultades, carreras, materias y planes.

## Planificación modular secuencial — 24-11-2026

- Se incorporó la actualización de currículo del equipo (`5dd16bc`) y se
  conservaron los cambios locales de documentación. Las dependencias estaban
  al día; se aplicaron `0011_curriculum_integrity` y luego
  `0012_modular_planning` a PostgreSQL local con respaldos previos.
- La migración `0012` agrega `plantillas_modulares`, la referencia de plantilla
  en `periodos_academicos`, una franja modular predeterminada por turno y los
  campos de grupo de ingreso, turno, plantilla y objetivo de clases en `cursos`.
  Los paralelos anteriores conservan sus campos nuevos en NULL; no se alteran
  fechas ni horarios históricos.
- «Aulas y turnos» permite crear plantillas nombradas con clases por módulo y
  duración. El semestre selecciona una; la plantilla asignada se protege de
  cambios estructurales. En «Oferta y paralelos» el administrador elige un plan
  MODULAR, grupo de ingreso, turno y materias en secuencia, asignando docente,
  aula, cupo y código de paralelo. La vista previa calcula fechas efectivas de
  lunes a viernes, omite feriados del periodo y muestra si toda la secuencia
  cabe dentro del semestre. El guardado de la secuencia es transaccional.
- El backend impide solapar materias distintas del mismo grupo, turno e
  identificador de paralelo (criterio precisado el 25-11-2026), y
  conserva las comprobaciones de cruces reales de docentes, aulas y estudiantes.
  El grupo del paralelo orienta la planificación; no restringe la inscripción
  de otros estudiantes elegibles. Para semestres con plantilla, los paralelos
  modulares se crean desde esta secuencia; semestres anteriores sin plantilla
  conservan el flujo previo. Cada paralelo muestra clases efectivas frente al
  objetivo, de modo que un feriado añadido después queda visible como déficit.
- Verificación real: 35 pruebas backend en SQLite y la prueba modular en una
  base PostgreSQL aislada aprobadas; Ruff, formato, compilación TypeScript/Vite
  y `alembic check` en PostgreSQL local aprobaron. La migración `0012` quedó
  aplicada. Persisten avisos de Zod y tamaño del paquete en Vite; falta una
  revisión visual autenticada y prueba de concurrencia de dos programaciones
  simultáneas para el mismo grupo/turno/paralelo.
- **Informe:** actualizar RN09–RN11, RF19–RF23, HU14–HU16, P07/P08, modelo
  físico, migración `0012`, diagrama de secuencia de planificación, casos T19–T21
  y capturas de plantillas, configuración del semestre y vista previa modular.

## Capacidad de aulas y cupo académico — 24-11-2026

- Se aplicó `0013_room_capacity` a PostgreSQL local con respaldo previo. El
  campo `aulas.capacidad` es positivo; queda NULL para aulas antiguas porque el
  sistema desconoce sus asientos reales. Las aulas nuevas requieren capacidad.
- «Aulas y turnos» permite consultar y editar los asientos. La programación
  modular y los horarios semestrales comparan el cupo del paralelo con todas
  las aulas asignadas; la vista previa avisa antes de guardar. Una
  reprogramación también comprueba la capacidad del aula sustituta. La
  reducción de capacidad se rechaza si un paralelo activo con cupo mayor aún
  tiene clases reales allí, considerando feriados y excepciones.
- Abrir inscripciones exige un aula en cada horario y cupo compatible. El
  servidor vuelve a comprobarlo al inscribir y la oferta estudiantil desactiva
  la acción si el aula no está lista. Esto protege también los paralelos
  abiertos antes de la migración. No se cambiaron de forma automática sus
  estados ni sus cupos.
- Verificación: 36 pruebas backend en SQLite; pruebas de paralelos y secuencia
  modular en PostgreSQL aislado; Ruff, compilación TypeScript/Vite y
  `alembic check` aprobados. En la base local, las cuatro aulas existentes
  permanecen sin capacidad y cuatro paralelos abiertos dependen de ellas.
  Antes de nuevas inscripciones, registrar la capacidad real de cada aula.
  Falta revisión visual con sesión autenticada.
- **Informe:** actualizar RN09–RN11, RF20–RF23, HU15–HU16, P08, modelo físico,
  migración `0013`, casos T20–T25 y capturas del catálogo, aviso de capacidad
  y oferta estudiantil.

## Vista conjunta de oferta y calendario fechado — 24-11-2026

- «Oferta y paralelos» presenta las materias de todos los planes incorporados
  al semestre en una tabla filtrable por facultad, carrera, plan y semestre
  curricular. Incluye aptos, repetidores, bloqueados y número de paralelos.
  Los encabezados ordenan la tabla y se pagina en grupos de 25 filas.
- Desde la fila se abre el diálogo de creación de un paralelo SEMESTRAL o el
  editor de secuencia MODULAR del plan, en la misma página. Los paralelos
  existentes se consultan en una tabla compacta con una acción de gestión.
- El calendario administrativo muestra una semana con fechas reales de clase.
  El servidor omite sesiones canceladas y feriados, y ubica las reprogramadas
  en su nueva fecha. Se conservan los filtros por facultad, carrera, plan,
  docente y aula y el detalle lateral del paralelo.
- Se agregaron `GET /api/v1/admin/periods/{id}/planning/overview` y
  `GET /api/v1/admin/periods/{id}/calendar?week_start=AAAA-MM-DD`, ambos
  limitados a Administrador. No se modificó el esquema ni se añadieron
  permisos académicos.
- Verificación: 37 pruebas backend aprobadas en SQLite; la prueba de resumen,
  fechas, reprogramación, feriado y acceso sin sesión aprobó también en una
  base PostgreSQL aislada. Ruff y compilación TypeScript/Vite aprobados. Falta
  revisión visual con sesión administrativa.
- **Informe:** actualizar P08, RF19–RF23, HU14–HU16, el flujo de preparación
  de la oferta y las capturas de la tabla conjunta y calendario.

## Consulta de disponibilidad de docentes y aulas — 24-11-2026

- El calendario de «Oferta y paralelos» abre un panel lateral para consultar
  una fecha y franja. Muestra docentes y aulas libres u ocupados, las clases
  que los ocupan, la capacidad física y la compatibilidad con el cupo del
  paralelo. Acepta una franja de turno o horas manuales, búsqueda y filtro de
  recursos disponibles.
- La nueva ruta administrativa
  `GET /api/v1/admin/planning/availability?date=AAAA-MM-DD` devuelve clases
  efectivas de **todos** los periodos que coinciden en la fecha, incluidas
  otras carreras. Respeta feriados, cancelaciones y reprogramaciones. El panel
  no usa solo la coincidencia del día semanal.
- Con un paralelo seleccionado, el administrador puede asignar un docente,
  cambiar el aula de una franja semanal existente o preparar una nueva franja
  con aula. La consulta describe una fecha; al guardar, el servidor valida la
  serie completa de clases y puede rechazar la asignación si hay un cruce en
  otro día. Se conserva el control de capacidad y cupo.
- La prueba nueva cubre periodos superpuestos, reprogramación, feriado y acceso
  sin sesión. Verificación: 38 pruebas backend en SQLite; dos pruebas del flujo
  en PostgreSQL aislado; dos pruebas unitarias Bun de franjas adyacentes y
  superpuestas; Ruff y build TypeScript/Vite aprobados. No hubo migración.
- **Informe:** actualizar P08 y el flujo de planificación, agregar captura
  del panel de disponibilidad y distinguir consulta puntual de validación de
  toda la serie. La revisión visual autenticada sigue pendiente.

## Programación modular conjunta de varias carreras — 24-11-2026

- «Oferta y paralelos» incorpora el modo «Varias carreras» junto al modo
  individual. El administrador marca los planes modulares participantes y,
  dentro de cada uno, el grupo de ingreso, turno, fecha inicial, materias y
  orden, paralelo, clases, cupo, docente y aula. Una búsqueda ayuda a localizar
  facultad, carrera o plan; «Seleccionar sugeridas» usa la propuesta académica
  sin guardar automáticamente ninguna materia.
- La vista previa reúne las fechas de todos los planes seleccionados y valida
  cruces entre docentes y aulas, incluso entre carreras. Si una secuencia no
  cabe en el semestre, indica el problema y no habilita el guardado.
- Se agregaron las rutas administrativas
  `POST /api/v1/admin/periods/{id}/modular/batch/preview` y
  `POST /api/v1/admin/periods/{id}/modular/batch/courses`. El guardado usa una
  transacción: ante un cruce o un plan fuera de fechas no crea parcialmente los
  paralelos. Reutiliza grupo/turno, plantilla, feriados, capacidad y permisos
  existentes; no hubo migración.
- Verificación: 39 pruebas backend en SQLite; prueba específica del lote en
  PostgreSQL aislado; dos pruebas unitarias Bun; Ruff y build TypeScript/Vite
  aprobados. La prueba del lote cubre conflicto por docente, conflicto por
  aula, fin fuera del semestre, ausencia de persistencia parcial, guardado
  correcto y acceso sin sesión.
- **Informe:** actualizar P08, RF19–RF23 y HU14–HU16 con el nuevo flujo y
  capturas del editor conjunto. Falta revisión visual autenticada y probar
  manualmente la interacción completa del formulario.

## Organización de la página de semestre — 25-11-2026

- La lista de semestres conserva sus tarjetas y agrega un filtro por estado:
  todos, en curso, próximos y finalizados. Es un filtro local, sin cambios en
  los datos.
- El detalle muestra primero la incorporación guiada de facultad, carrera y
  plan vigente. La plantilla modular pasa a un desplegable con la plantilla
  asignada visible en el resumen y controles explícitos al abrirlo.
- Los accesos a calendario, oferta y habilitaciones se condensan en una lista
  de estado. El único botón para agregar feriados queda en el calendario. Los
  enlaces para planificar materias se presentan como botones.
- No se agregó eliminación de semestres: P07 no la contempla. Se requiere una
  decisión funcional sobre historial y dependencias antes de diseñarla.
- Verificación: compilación TypeScript/Vite, dos pruebas unitarias Bun y
  revisión visual autenticada del detalle 2027-2. No se guardaron cambios
  académicos durante la revisión de interfaz.

## Tabla y corrección de grupos en el semestre — 25-11-2026

- Se retiró la lista «Estado del semestre» porque duplicaba la navegación
  superior. El calendario de feriados permanece al final del detalle.
- Las carreras, planes y grupos se muestran en una tabla compacta, con filtros
  por facultad, carrera y mes de inicio del grupo, y orden por carrera,
  facultad, semestre previsto o fecha de inicio. Cada fila permite abrir la
  secuencia y la asignación de estudiantes cuando corresponde.
- Se muestran acciones para quitar una carrera sin planes y un plan sin
  grupos. Se añadió «Deshacer inicio» de un grupo creado en el semestre solo
  cuando no tiene estudiantes ni paralelos. La API valida estas condiciones
  antes de eliminar el grupo y conserva los datos con dependencias.
- Verificación: 40 pruebas backend aprobadas, dos pruebas unitarias frontend,
  compilación TypeScript/Vite y revisión visual autenticada de la tabla. No se
  modificaron datos académicos durante la revisión visual.

## Enlace de plan a oferta — 25-11-2026

- El botón «Planificar» de la tabla del semestre ahora abre «Oferta y
  paralelos» con el plan correspondiente seleccionado. El filtro de la tabla de
  materias y el filtro de paralelos toman `plan_id` de la URL; el administrador
  puede cambiarlos después.
- Verificación: compilación TypeScript/Vite y revisión autenticada del plan de
  Psicología en 2027-2; la oferta mostró únicamente sus 12 materias.
- Sigue pendiente rediseñar el paso de «Programar secuencia»: actualmente abre
  el editor conjunto de planes aunque se pulse desde una materia individual.

## Oferta por grupo y semestre — 25-11-2026

- «Planificar» desde la fila de un grupo conserva también su identificador.
  Oferta muestra las materias de su semestre proyectado; existe una opción para
  consultar materias de semestres anteriores. Sin un grupo elegido, la vista
  inicial muestra materias con grupos previstos y permite consultar el plan
  completo por separado.
- Los editores modulares muestran únicamente materias del semestre proyectado
  o anteriores para el grupo elegido. La previsualización y guardado en backend
  rechazan una materia de un semestre futuro para ese grupo.
- La etiqueta «Prevista por grupo» distingue la propuesta curricular de la
  demanda de estudiantes. En el editor conjunto, «Seleccionar previstas» marca
  materias del semestre del grupo y anteriores con repetidores.
- Verificación: compilación frontend, Ruff y prueba del planificador modular
  con rechazo de materia futura. En la interfaz autenticada, el grupo de
  Psicología de 2027-2 mostró seis materias de semestre 1 en Oferta y en el
  editor modular.
- Auditoría pendiente: el grupo no tiene nombre propio y la proyección actual
  es dinámica; periodos superpuestos pueden alterar el semestre calculado.

## Identidad y trayectoria de grupos — 25-11-2026

- Se confirmó un grupo de ingreso por carrera y semestre académico, asociado
  a una versión del plan. Puede organizarse en varios paralelos. El código
  visible se genera a partir de carrera y periodo y se conserva después.
- La migración `0014_group_trajectory` guarda los semestres curriculares del
  grupo y su periodo asignado. La asignación omite periodos solapados; crear
  nuevos periodos completa espacios vacíos sin reordenar los ya guardados.
  También incorpora los grupos existentes sin borrar estudiantes o paralelos.
- La tabla de planificación muestra el código y la trayectoria, y revisa los
  datos antes de iniciar el grupo. La API y la base impiden duplicar un grupo
  de la carrera en el mismo semestre aunque se use otro plan.
- Verificación: 40 pruebas backend, incluidas unicidad y trayectoria tras crear
  un periodo solapado; Ruff y compilación TypeScript/Vite aprobados. La
  migración y `alembic check` aprobaron en una copia temporal PostgreSQL; en
  la base local se preservaron dos grupos y se crearon cuatro espacios de
  trayectoria. La revisión visual autenticada mostró el código, los espacios
  de semestre y la confirmación previa a iniciar otro grupo, sin crear datos.

## Horario del turno en secuencia modular — 25-11-2026

- Se detectó que la plantilla modular de tres horas estaba asignada, pero no
  existía ningún horario predeterminado de turno. La secuencia requería esa
  configuración y la interfaz no explicaba claramente la dependencia.
- Los editores individual y conjunto ahora definen «franja» como la hora de
  inicio y fin de cada clase. Permiten escoger una franja compatible existente
  o indicar la hora de inicio; el sistema propone la hora final según la
  duración de la plantilla y guarda el turno sin abandonar el borrador.
- Se aclaró el error del servidor y se corrigió el cambio de franja
  predeterminada cuando otra ya tenía esa condición.
- Verificación: 41 pruebas backend, promoción de una franja en PostgreSQL
  aislado, Ruff, compilación TypeScript/Vite y revisión visual autenticada.
  Al introducir 08:00, la pantalla propuso
  11:00 para la plantilla de tres horas. No se guardó un horario en la base
  local porque el administrador debe elegir la hora real del turno.

## Acciones directas y secuencias con docente pendiente — 25-11-2026

- La tabla del semestre muestra «Quitar carrera», «Quitar plan» y «Deshacer
  grupo». Si existen grupos, estudiantes, paralelos u otra dependencia que
  impida retirar un registro, la acción aparece deshabilitada con su motivo;
  el servidor conserva la validación definitiva.
- «Programar secuencia» se presenta como botón y abre el editor modular con la
  materia elegida, el plan y el grupo correspondientes. Se pueden añadir las
  demás materias previstas desde el mismo editor.
- La secuencia modular admite docente pendiente. Aula y cupo permanecen
  obligatorios para verificar capacidad y cruces; los paralelos creados sin
  docente guardan la inscripción cerrada. El docente se asigna más tarde desde
  el detalle del paralelo; abrir inscripciones exige que ya esté asignado.
- «Oferta programada» muestra abrir/cerrar inscripción por paralelo y para una
  selección de filas. El cambio masivo valida todos los paralelos y confirma
  la operación en una transacción. «Ver» despliega el detalle en la tabla y
  «Otro paralelo» prepara otro paralelo de la misma materia sin crear un
  segundo grupo de ingreso.
- Verificación: 42 pruebas backend y Ruff aprobados; TypeScript y Vite
  compilaron. Dos casos críticos pasaron también en PostgreSQL temporal:
  apertura/cierre masivo atómico y secuencia modular con docente pendiente y
  otro paralelo de la misma materia. La interfaz autenticada mostró los
  botones de retiro con sus estados, la materia preseleccionada en el editor,
  el docente «Asignar después» y el detalle expandido en la tabla. No se
  crearon ni modificaron datos académicos durante esa revisión visual.

## Diagnóstico al guardar secuencias — 25-11-2026

- Los editores modulares individual y conjunto muestran junto al botón las
  condiciones faltantes o el error de la vista previa. Cuando la comprobación
  sigue en curso, lo indican en ese mismo lugar. El botón inactivo usa estilo
  gris y ahora dice «Guardar secuencia (N materias)».
- Los mensajes de cruce del servidor indican materia, paralelo, fecha y hora;
  para aulas sugieren elegir otra aula, turno o fecha. La comprobación sigue
  ejecutándose en el servidor antes de guardar.
- Se reprodujo en la interfaz el caso de Psicología 2027-2: seis materias B en
  AULA D-01 se cruzan el 1 de junio con el paralelo A. El aviso aparece junto
  al botón; con AULA D-02 para esas materias, la vista previa permite guardar.
  No se confirmó el guardado ni se alteraron datos académicos en la revisión.
- Ruff, la prueba del flujo modular y la compilación TypeScript/Vite aprobaron.
  La agenda semanal de aulas solicitada se registró como propuesta en
  `PENDIENTES_PARA_DECIDIR.md`.

## Cruce entre materias de un grupo — 25-11-2026

- La validación del mismo grupo y turno empezó a informar qué materias y
  fechas se superponen. La revisión posterior detectó que comparaba también
  paralelos diferentes A y B, lo cual era incorrecto para este proyecto. La
  regla quedó corregida en la sección siguiente.
- Se documentó un plan para mostrar docentes y aulas ocupados como opciones
  deshabilitadas, con el motivo, y abrir una agenda semanal de aulas desde
  cada materia. La disponibilidad deberá evaluarse para todas las clases del
  módulo, no solo para una fecha visible. Esta interfaz aún no está creada.
- La prueba modular del mensaje y Ruff aprobaron. No se modificaron datos
  académicos durante la revisión.

## Secuencias modulares independientes por paralelo — 25-11-2026

- Se corrigió el alcance de la restricción secuencial: solo compara materias
  distintas del mismo grupo de ingreso, turno e identificador de paralelo.
  A y B pueden programar materias en diferente orden y con fechas
  coincidentes. La disponibilidad de docente, aula y estudiantes inscritos
  continúa verificándose globalmente por fechas y horas reales.
- En el ejemplo de Psicología, invertir Estadística y Desarrollo en B ya no
  provoca el error de grupo frente a A. Si ambos usan AULA D-01 en las mismas
  horas, la vista previa informa el cruce de aula; AULA D-02 permite mantener
  ambos paralelos a la vez cuando está libre.
- El editor «Usar siguiente fecha» toma el último módulo del paralelo que se
  está preparando, sin arrastrar la fecha final de A al preparar B.
- La prueba modular crea A y B con orden inverso, docentes y aulas distintos;
  pasó en SQLite y PostgreSQL temporal. Ruff y la compilación TypeScript/Vite
  aprobaron. No se añadió migración ni se alteraron datos académicos locales.

## Plan ajustado de disponibilidad y agenda — 25-11-2026

- Se precisó en `PENDIENTES_PARA_DECIDIR.md` el flujo propuesto: seleccionar
  primero grupo, paralelo, turno y fecha; calcular fechas de cada materia;
  mostrar docentes y aulas disponibles o bloqueados para la serie completa de
  clases; abrir una agenda semanal desde el aula de cada materia.
- El plan distingue el choque de dos materias del mismo paralelo del choque
  real de docente o aula entre paralelos A y B. Propone conservar visibles las
  opciones ocupadas como deshabilitadas, con causa y primera fecha de cruce.
  El modal mostrará una semana de siete días y un estado de disponibilidad
  para todo el módulo. La consulta anticipada y la agenda aún no se han
  implementado; la validación final del servidor sigue vigente.

## Disponibilidad anticipada y agenda de aulas — 25-11-2026

- Se agregó una consulta administrativa por rango que devuelve clases reales
  de todos los periodos superpuestos, con materia, docente, paralelo y
  vigencia. Aplica feriados, cancelaciones y reprogramaciones.
- Los editores modulares calculan las fechas de cada materia antes de elegir
  docente o aula. El identificador de paralelo se fija en la cabecera de cada
  secuencia; A y B pueden seguir órdenes independientes. Las opciones ocupadas,
  inactivas o sin capacidad se ven deshabilitadas con el motivo. El docente
  sigue pudiendo quedar pendiente.
- «Ver agenda» abre un modal con siete días y horario 06:00–22:00, muestra
  ocupaciones y feriados, y permite seleccionar un aula solo cuando está
  disponible para todas las clases del módulo. El servidor vuelve a validar
  la secuencia al guardarla.
- Se aprobaron la prueba de disponibilidad con periodos superpuestos,
  reprogramación y feriado; las pruebas modulares del backend; cinco pruebas
  del frontend y la compilación TypeScript/Vite. La revisión autenticada en
  2027-2 mostró docente y AULA D-01 bloqueados para B, AULA D-02 libre, agenda
  de siete días y vista previa habilitada con cupo 12. No se guardó un
  paralelo durante esa revisión.

## Conteo de paralelos y calendario por horas — 25-11-2026

- Se distinguió el paralelo del curso de una materia: las doce materias
  programadas de Psicología 2027-2 pertenecen a dos paralelos activos, A y B.
  El resumen muestra ambos números y la tabla se presenta como materias
  programadas en paralelos.
- Se agregó filtro por identificador de paralelo A/B a «Oferta programada» y
  «Calendario». Los filtros de estado de la tabla no ocultan clases del
  calendario; este usa sus filtros académicos y de recursos.
- El calendario semanal ahora es una grilla horaria de lunes a domingo,
  07:00–22:00 como mínimo, ampliable ante clases fuera de ese horario. Los
  bloques muestran materia, paralelo, carrera, aula y docente; los horarios
  simultáneos se colocan en columnas sin ocultarse.
- «Ver agenda de aulas» se movió de cada fila a la cabecera de asignaciones.
  El administrador selecciona la materia allí y abre su agenda.
- Seis pruebas frontend y compilación TypeScript/Vite aprobaron. En navegador
  se comprobó el resumen 2 paralelos/12 materias, el filtro B con seis filas,
  la grilla semanal y el botón de agenda en la cabecera. No se modificaron
  datos académicos durante esa revisión.

## Informe y diagramas de presentación — 25-11-2026

- Se actualizó el informe en Google Docs con el estado real del proyecto,
  decisiones académicas y verificaciones documentadas. Se retiraron las
  ampliaciones fragmentadas de casos de uso y se ajustó el índice. La última
  exportación PDF debe comprobarse tras sustituir las figuras finales; el
  objetivo es un máximo de 50 páginas.
- El archivo de clases v2 aportado se conservó como referencia histórica. Se
  prepararon tres vistas de clases actuales desde los modelos SQLAlchemy.
- Se obtuvo el esquema relacional mediante lectura de PostgreSQL 18 local en
  la migración `0014_group_trajectory`: 27 tablas, 140 columnas y 40 claves
  foráneas. Siete vistas ERD cubren todas las tablas; las fuentes JSON no
  contienen filas de usuarios ni secretos.
- Se actualizó la fuente Draw.io de CU00–CU03 para reflejar facultades,
  grupos de ingreso y programación de la oferta; CU01 ya no presenta edición
  de teléfono por el usuario. Los ocho diagramas se exportaron completos a
  SVG, PNG y PDF. La secuencia modular detallada se explica en el capítulo 7.
- Los archivos editables y exportados están en `docs/diagramas/`. Son cambios
  locales pendientes de incorporación al repositorio compartido mediante Git.
