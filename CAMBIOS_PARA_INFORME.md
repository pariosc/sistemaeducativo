# Cambios para reflejar en el informe

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
  **no se aplicó a la base principal** y requiere autorización explícita antes
  de ejecutar `alembic upgrade head`.
- Verificación ejecutada: 34 pruebas backend aprobaron en SQLite, entre ellas
  publicación con estructura incompleta, renumeración, duplicación, carga
  masiva, inactivación de materia en plan vigente y rechazo de asignación a
  plan inactivo. Ruff aprobó `app` y `migrations`; `tsc -b` y el build de Vite
  aprobaron con los avisos preexistentes de Zod y tamaño de bundle. No se
  realizó revisión visual autenticada ni prueba de concurrencia en PostgreSQL.
- **Secciones del informe a revisar:** RN04–RN08, RF11–RF18, HU08–HU13,
  P04–P06, T11–T18, modelo físico (índice de materias del plan) y capturas de
  facultades, carreras, materias y planes.
