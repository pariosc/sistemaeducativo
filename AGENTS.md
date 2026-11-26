# Guía de desarrollo — Sistema Web de Gestión Académica

Estas instrucciones aplican a todo el repositorio. El documento funcional
canónico es `CONTEXTO_COMPLETO_PROGRAMACION_IV.md`; ante cambios, conservar los
códigos RF01–RF43, RNF01–RNF08, HU01–HU29 y P01–P14 y registrar las decisiones
confirmadas en ese contexto.

## Alcance y vocabulario

- El sistema cubre exclusivamente procesos académicos. No agregar cobros,
  pagos ni facturación.
- Mantener Administrador, Docente y Estudiante como únicos roles académicos.
  El administrador principal es un Administrador con privilegios especiales.
- Usar **Paralelo** en la interfaz. Mantener **Curso** como denominación del
  modelo de dominio para una oferta de materia en un periodo.
- Conservar el modelo v8 y las funciones aprobadas. No inventar reglas,
  permisos, endpoints, pantallas, actividades ni resultados de pruebas.
- Distinguir decisiones funcionales confirmadas de propuestas técnicas y
  asuntos pendientes. No resolver silenciosamente pendientes que cambien el
  comportamiento académico o los permisos.

## Arquitectura

Aplicación cliente-servidor con React y TypeScript, Python/FastAPI y PostgreSQL.
Se propone un monolito modular con frontend y backend separados; no crear
microservicios para este alcance.

La estructura sigue MVC adaptado a una API web:

- **Modelo:** dominio y reglas académicas. La persistencia se encapsula en
  repositorios.
- **Controlador:** rutas FastAPI; validan solicitudes, resuelven identidad y
  delegan a servicios. No concentrar reglas complejas en controladores.
- **Vista:** pantallas y componentes React. La respuesta JSON de la API es la
  salida presentada por la vista.
- **Servicios de aplicación:** coordinan casos de uso, reglas de negocio y
  autorización.
- **Base de datos:** PostgreSQL protege integridad mediante relaciones,
  restricciones y transacciones según el diseño físico aprobado.

Las reglas críticas y los permisos se validan en backend en cada operación,
incluidas consultas, escrituras y exportaciones. La interfaz puede ocultar
acciones como ayuda de uso, pero no sustituye la autorización del servidor.

### Estructura prevista

- `frontend/src/app/`: arranque y navegación.
- `frontend/src/features/`: interfaz organizada por función académica.
- `frontend/src/shared/`: componentes y utilidades compartidas.
- `frontend/src/api/`: cliente de API y contratos tipados.
- `backend/app/api/`: rutas y dependencias comunes.
- `backend/app/core/`: configuración y seguridad compartidas.
- `backend/app/db/`: persistencia y modelos físicos.
- `backend/app/modules/`: módulos de dominio; cada uno puede contener
  `models/`, `schemas/`, `repositories/`, `services/` y `api/`.
- `docs/fuentes/` y `docs/diagramas/`: documentación y fuentes editables.

## Decisiones técnicas

Confirmadas para la Fase 1: React con TypeScript, Vite, Python/FastAPI,
PostgreSQL en Docker Compose, SQLAlchemy, Alembic, Bun, sesiones revocables en
servidor, login por correo o CI y cuenta principal inicial mediante comando
CLI de un solo uso configurado desde variables de entorno. La contraseña temporal se genera aleatoriamente y se
muestra una sola vez al administrador autorizado. La vista de acceso adapta el
login del template Full Stack FastAPI; se mantiene su aviso de licencia MIT.

El resto de las propuestas aún pendientes son generación PDF/Excel,
despliegue, y selección/aplicación futura de Repository y Strategy. No adoptar
el flujo JWT/localStorage del template.

Decisiones funcionales confirmadas para currículo (Fase 2): cada carrera pertenece a una sola facultad; las facultades se gestionan como catálogo y no pueden eliminarse mientras tengan carreras asociadas. El código de plan
es único en todo el sistema; solo se modifica la estructura de un plan en
BORRADOR y se crea otro plan para cambios posteriores a su publicación; la
asignación de plan a un estudiante se corrige solo mientras no existan
inscripciones ni notas.

Decisiones confirmadas para la planificación centrada en el plan: el periodo
académico permanece como ciclo semestral común; el administrador incorpora
explícitamente las carreras participantes y puede programar varios planes
VIGENTES de una misma carrera. El sistema muestra las materias de cada plan,
agrupadas por semestre curricular, para decidir cuáles se ofertan en el
periodo. No ofertar una materia en un periodo no inactiva la materia del
catálogo ni modifica el plan publicado. En modalidad SEMESTRAL la programación
de las materias elegidas abarca el semestre académico; en MODULAR se distribuye
en tramos mensuales dentro del mismo periodo. Siguen pendientes los límites
exactos de esos tramos y la política para retirar una oferta con historial.

Al preparar el siguiente periodo, la planificación debe mostrar las materias
de los planes seleccionados junto con el avance académico de sus estudiantes:
continuidad posible, materias reprobadas que podrían repetirse y requisitos
pendientes. Es una ayuda para decidir la oferta, no una apertura automática de
paralelos ni una habilitación individual. El cálculo exacto de la demanda y el
momento en que una nota será oficial si se añade aprobación administrativa
siguen pendientes de revisión institucional. La implementación actual cuenta
estudiantes activos con el plan asignado y resultados de periodos terminados
antes del inicio del periodo objetivo; muestra aptos, repetidores, bloqueados,
aprobados y casos sin nota. Señala como sugeridas solo materias con estudiantes
aptos que estén en su semestre nominal o puedan repetirlas.

Decisión confirmada para ambas modalidades: aprobar un prerrequisito durante
un periodo académico no habilita su materia dependiente en otro bloque de ese
mismo periodo. Una materia reprobada tampoco se repite dentro del mismo periodo;
podrá cursarse en uno posterior si se oferta y se cumplen las condiciones de
inscripción. La duración prevista de una carrera deriva de los semestres de su
plan (nueve en el ejemplo, no un valor fijo). Una misma versión del plan puede
recibir varios grupos de ingreso en distintos periodos; cada estudiante con
ese plan se asigna a un grupo para proyectar su semestre nominal. Publicar
otra versión del plan es una operación distinta.

## Reglas funcionales que deben preservarse

- Cada inscripción requiere una habilitación individual activa para el periodo
  y que el paralelo tenga inscripciones abiertas; son condiciones distintas.
- El semestre ubica una materia dentro del plan, pero no bloquea cursar materias
  pendientes de semestres anteriores ni adelantar materias posteriores. La
  elegibilidad académica depende de aprobar todos los prerrequisitos con nota
  final >= 51 en un periodo académico anterior al de la inscripción; la oferta
  debe comunicar los requisitos pendientes y no habilitar la acción de
  inscripción hasta cumplirlos. Una materia reprobada solo puede repetirse en
  un periodo posterior y si vuelve a ofertarse.
- Para Fase 3, las sesiones semanales son inclusivas en las fechas del paralelo,
  excluyen feriados del periodo y consideran cancelaciones y reprogramaciones.
  Inactivar un paralelo cierra su inscripción; reactivarlo no la abre. No se
  reduce el cupo por debajo de inscripciones activas.
- La nota final es un entero entre 0 y 100; se aprueba desde 51 y hay una sola
  nota final por inscripción. Solo el docente asignado la registra o corrige.
- Los cruces de horario consideran fechas reales de clase y superposición de
  horas. Una clase puede comenzar cuando termina otra.
- Los permisos dependen del rol y de la relación del usuario con el registro.
  El administrador consulta notas mediante reportes y no las modifica.
- Inactivar conserva historial; la eliminación física depende de que no haya
  registros dependientes.
- Los ocho reportes deben ofrecer PDF y Excel con los mismos límites de
  autorización.
- No implementar automatización de habilitaciones, recuperación del principal,
  cierre de notas o cambios de plan con historial hasta que se definan sus
  reglas pendientes.
- Todos los usuarios (Administrador, Docente y Estudiante) deben cambiar la
  contraseña en su primer ingreso y después de un restablecimiento. La
  condición se aplica en servidor y solo permite cambiar la contraseña o cerrar
  sesión mientras esté activa. Registrar las consecuencias para el informe en
  `CAMBIOS_PARA_INFORME.md`.
- Docentes y Estudiantes pueden consultar su perfil, pero no editar datos
  personales propios. La API debe rechazar esas actualizaciones; las
  correcciones permitidas las realiza un Administrador desde gestión de usuarios.
  El Administrador puede actualizar su propio teléfono. El cambio de contraseña
  sigue disponible para los tres roles.
- La ficha de usuario incluye dirección y fecha de nacimiento; título y
  especialidad solo para Docentes; carrera, plan y grupo de ingreso solo para
  Estudiantes. Administración busca y consulta el detalle de esas fichas. El
  backend valida los campos por rol, la correspondencia plan/grupo y la
  conservación del historial de inscripciones. Esta ampliación no permite
  edición propia ni cambia los permisos existentes.

## Fases de desarrollo

El estado inicial es análisis, diseño y planificación. Una fase no se considera
terminada hasta revisar sus criterios y registrar resultados reales. Las
pruebas listadas son previstas, no resultados existentes.

| Fase | Alcance | Dependencias | Criterio de salida |
| --- | --- | --- | --- |
| **0. Preparación y diseño físico** | Revisar RF, permisos, modelo v8 y decisiones pendientes; diseñar tablas, relaciones, índices, restricciones y estrategia transaccional. | Ninguna. | Requisitos trazados; decisiones para fase 1 documentadas; diseño físico revisado y repositorio preparado. |
| **1. Acceso y usuarios** | RF01–RF10, RF41–RF42: sesión, perfil, usuarios, privilegio principal y configuración inicial segura. | Fase 0; definir sesión, almacenamiento de contraseñas y recuperación/configuración del principal. | Acceso y administración con permisos del backend; principal único y cambio obligatorio de contraseña temporal. |
| **2. Currículo** | RF11–RF18: carreras, materias, planes, unidades, prerrequisitos y asignación de plan. | Fase 1; precisar edición de planes en uso. | Integridad, unicidad, prevención de ciclos y conservación del historial. |
| **3. Periodos y paralelos** | RF19–RF23 y consultas RF26: periodos, oferta, cupos, horarios y apertura. | Fases 1–2; definir fechas y representación de horarios. | Fechas y cruces validados; estado activo separado de inscripciones abiertas. |
| **4. Habilitaciones e inscripciones** | RF24–RF25, RF43 y aviso RF31. | Fases 1–3; definir transacciones de cupo y prevención de duplicados concurrentes. | Habilitación individual e inscripción que valide condiciones antes de confirmar y notificar. |
| **5. Calificaciones** | RF27–RF29: registro, corrección y consulta. | Fases 1, 3 y 4. | Rango y unicidad de nota aplicados; escritura permitida solo al docente asignado. |
| **6. Reportes** | RF33–RF40: ocho reportes exportables a PDF y Excel. | Fases 2–5; disponer de datos representativos. | Los ocho reportes en ambos formatos con autorización equivalente. |
| **7. Paneles, avisos e integración** | RF30–RF32, integración, evaluación de calidad y entrega. | Fases 1–6 y eventos de inscripción/cambio de horario. | Panel por rol, avisos, trazabilidad, evidencias y entrega reproducible para el entorno acordado. |

### Criterios para avanzar

1. Aclarar las decisiones pendientes que bloquean la fase; no alterar el modelo
   ni el comportamiento aprobado en silencio.
2. Implementar la función en backend y frontend, aplicando reglas y permisos en
   el servidor.
3. Mantener trazabilidad entre requisito, módulo, pantalla y prueba prevista.
4. Revisar criterios de aceptación y documentar resultados reales antes de
   cerrar la fase.

No están fijados calendario, duración de iteraciones, entorno de despliegue ni
asignación individual entre los tres integrantes.

## Desarrollo local — Fase 1

### Windows (equipo nuevo)

La ruta de desarrollo Windows es PowerShell nativo con Docker Desktop usando
WSL 2; no requiere Make ni desarrollar dentro de una distribución Linux. En
una computadora virgen, instalar WinGet/App Installer si falta, instalar Git,
clonar el repositorio y ejecutar `scripts/setup-windows.ps1` como
administrador. El script instala/verifica Git, uv, Bun, Docker Desktop y Visual
Studio Code mediante WinGet; descarga la última versión estable Node.js 24.x
desde el sitio oficial y valida su SHA-256. Instala Python 3.14 administrado
por uv, prepara dependencias y crea `.env` solo si falta. Si habilitar WSL
requiere reinicio, completarlo y volver a ejecutar el script. Después iniciar Docker Desktop,
configurar `INITIAL_ADMIN_PASSWORD`, ejecutar una vez
`scripts/principal-windows.ps1` y levantar con `scripts/dev-windows.ps1`.
Ctrl+C cierra los procesos de aplicación y ejecuta `docker compose down`, que
conserva el volumen PostgreSQL.

Requisitos prácticos: Windows 11 23H2 o posterior de 64 bits recomendado,
virtualización de hardware habilitada y al menos 8 GB de RAM para Docker Desktop/WSL 2. WinGet se
distribuye mediante App Installer. La instalación inicial/clonado requieren
Internet y acceso GitHub de cada integrante. No distribuir `.env`.

Requisitos observados en el entorno: Python 3.14, Node.js 24, Docker Compose y
`psql`. `uv` y Bun se instalan en el perfil del usuario. Makefile requiere GNU
Make y Docker Compose v2.17 o posterior. PostgreSQL corre en Docker y escucha
solo en `127.0.0.1:55432` (5432 y 5433 ya están ocupados).

Para preparar el entorno, configurar `.env`, crear el administrador principal
(una vez por base local) y levantar API, frontend y PostgreSQL juntos:

```sh
make setup
# Configurar INITIAL_ADMIN_PASSWORD en .env antes del siguiente comando.
make principal
make dev
```

`make dev` aplica migraciones pendientes antes de iniciar las aplicaciones. Al
presionar Ctrl+C, termina ambos servidores de aplicación y ejecuta
`docker compose down`, conservando el volumen de datos. La creación de la cuenta
principal nunca se ejecuta automáticamente al iniciar los servidores.

```sh
cp .env.example .env
docker compose up -d db
cd backend
uv sync --all-groups
uv run python -m alembic upgrade head
uv run python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

En otra terminal:

```sh
cd frontend
bun install
bun run dev
```

Primera instalación, después de aplicar migraciones:

```sh
cd backend
uv run python -m app.cli create-principal
```

La configuración local usa `CI=admin`; define una contraseña propia de al
menos 8 caracteres en `INITIAL_ADMIN_PASSWORD` dentro de `.env` antes de
ejecutar el comando. `.env` está excluido de Git y se crea con permisos
restringidos. Nunca guardar contraseñas en el repositorio; en producción,
inyectar estos secretos desde el gestor de secretos del entorno y configurar
`SESSION_COOKIE_SECURE=true` con HTTPS. No reutilizar la clave local fuera del
entorno de desarrollo.

Pruebas previstas del backend:

```sh
cd backend
uv run pytest
uv run ruff check app migrations
```

### Registro de avance

- **Entorno Windows para desarrollo (20-11-2026):** se añadieron scripts
  PowerShell para preparar herramientas/dependencias, crear manualmente el
  administrador principal y levantar los servicios juntos. README y esta guía
  explican instalación en una máquina Windows nueva, WSL 2/Docker Desktop,
  reinicio, `.env` y puertos locales. Falta ejecutar los scripts en Windows
  real; el entorno actual no es Windows.

- **Fase 1 — implementada y verificada localmente (17-11-2026):** API de
  autenticación, sesiones revocables, perfiles y administración de usuarios;
  interfaz de acceso, cambio de contraseña, perfil y administración. La
  configuración inicial del administrador principal usa valores `INITIAL_ADMIN_*`
  en `.env`. Cuenta `admin` creada localmente; la contraseña no se imprimió ni
  se incluyó en el repositorio.
- **Verificaciones ejecutadas:** 8 pruebas backend aprobadas; Ruff aprobó
  `app` y `migrations`; `tsc -b` y compilación Vite aprobados; migración
  `0001_access_sessions` aplicada en PostgreSQL 18 local (Compose saludable,
  puerto `127.0.0.1:55432`). Vite mostró dos avisos de comentarios de pureza
  dentro de Zod; no impidieron la compilación.
- **Pendiente para el uso inicial:** validar la sesión desde la interfaz con
  la contraseña local almacenada en `.env`.
- **Fase 2 — implementación en curso; validación parcial (18-11-2026):** API y
  pantallas administrativas para facultades, carreras, materias, planes,
  unidades, prerrequisitos y asignación a estudiantes. La suite completa aprobó
  18/18 en SQLite y PostgreSQL aislado; la cobertura de T11–T18 sigue parcial y
  faltan los escenarios de `docs/MATRIZ_PRUEBAS.md` y la revisión visual. La
  migración `0008_facultades` se probó en PostgreSQL aislado; la base principal
  permanece en `0007_calificaciones` hasta contar con autorización explícita
  para aplicar el cambio de esquema y la asignación de datos existentes.
- **Fase 3 — implementada (17-11-2026):** periodos, paralelos,
  horarios, feriados por periodo y excepciones por sesión. Según P07 no se
  agregó edición ni eliminación de periodos. Migraciones 0004 y 0005 aplicadas;
-  Ruff, compilación TypeScript/Vite y comparación Alembic aprobados. Las pruebas
  T19–T23 tienen cobertura automatizada parcial; T26 se comprueba por rol. Faltan
  los escenarios pendientes de la matriz.
- **Fase 4 — implementada (17-11-2026):** gestión manual de
  habilitaciones, oferta e inscripción con control transaccional de cupo y
  conflictos; aviso interno al confirmar. Reingreso después de RETIRADA y
  automatización SISTEMA continúan pendientes por regla funcional. Migración
  0006 aplicada; T24/T25/T31/T43 tienen cobertura automatizada parcial.
- **Fase 5 — implementada (17-11-2026):** registro, corrección y consulta de
  notas finales con una nota por inscripción y límites 0–100. Migración 0007
  aplicada; T27–T29 tienen cobertura automatizada parcial. Política de
  cierre académico sigue pendiente; no existe bloqueo por cierre.
- **Fase 6 — implementada (17-11-2026):** ocho informes RF33–RF40,
  exportación PDF/XLSX y filtros aplicados en backend según el rol. T33–T40
  tienen prueba automatizada de descarga PDF/XLSX; falta revisión visual de
  archivos y ampliar escenarios negativos.
- **Fase 7 — implementación en curso (17-11-2026):** panel por rol, actividad
  reciente, consulta y lectura de avisos, más notificaciones por cambios de
  horario/calendario. Una revisión estática excluye avisos de feriado cuando
  la sesión ya tiene excepción. Ruff, compilación TypeScript/Vite y rutas OpenAPI
  verificados. Se documentó el arranque local y se agregó la matriz de trabajo
  `docs/EVALUACION_CALIDAD.md`; T30–T32 tienen cobertura automatizada parcial.
  RNF01–RNF08 y evidencia de despliegue siguen pendientes.
- **Regresión (18-11-2026):** 18 pruebas automatizadas (10 de acceso, 4 de
  currículo y 4 de integración) aprobaron con SQLite; Ruff, formato y
  compilación frontend también aprobaron. La matriz `docs/MATRIZ_PRUEBAS.md`
  registra los huecos. No se pudo confirmar `alembic current/check` contra
  PostgreSQL desde este entorno.
- **Planificación académica — mejora de flujo (18-11-2026):** se confirmó que
  el periodo académico representa el ciclo semestral común a planes MODULARES y
  SEMESTRALES, distinto del semestre curricular dentro del plan. La interfaz
  guía creación del semestre, programación de oferta y habilitaciones; conserva
  el semestre seleccionado entre pantallas y filtra los paralelos por periodo.
  No se añadió entidad para módulo mensual: fechas del paralelo delimitan el
  bloque. `CONTEXTO_COMPLETO_PROGRAMACION_IV.md`, `PENDIENTES_PARA_DECIDIR.md` y
  `CAMBIOS_PARA_INFORME.md` fueron actualizados. `bun run build` aprobó con dos
  avisos existentes de comentarios Zod y el aviso de tamaño del bundle. No se
  ejecutaron pruebas funcionales; la aprobación administrativa de notas sigue
  pendiente y no fue implementada.
- **Arranque local con Make (19-11-2026):** se añadieron `make setup`,
  `make principal` y `make dev`. El último espera PostgreSQL saludable, aplica
  migraciones y administra backend/frontend en conjunto; Ctrl+C detiene esos
  procesos y PostgreSQL sin borrar su volumen. La contraseña de la cuenta
  inicial permanece fuera de Git. Ruff y la compilación de sintaxis Python
  aprobaron; `make -n setup principal dev` revisó los objetivos. No se ejecutó
  el arranque completo ni pruebas funcionales de esta mejora.
- **Planificación de horarios — vista semanal y recursos (23-11-2026):** P08
  incorpora una vista semanal conjunta filtrada por periodo. Se agrega un
  catálogo sencillo de aulas y plantillas para Madrugada, Mañana, Tarde y Noche.
  Al elegir una plantilla, el formulario copia sus horas al paralelo; editar la
  plantilla no cambia horarios guardados. Inactivar recursos los conserva y
  evita nuevas asignaciones. El backend valida cruces de aula por fecha real,
  feriados, excepciones y solapamiento horario. Configuración:
  `/admin/planificacion-config`. El formulario consulta la API al editar y la
  API vuelve a validar al guardar; la comprobación previa no persiste cambios.
  Cobertura ejecutada el 23-11-2026: 26 pruebas backend aprobaron en SQLite;
  Ruff, TypeScript y build Vite también aprobaron. Después de corregir los 500
  observados en la interfaz, se aplicó `0009_planificacion_recursos` en la base
  PostgreSQL local (estaba en `0008_facultades`); la revisión quedó en `0009`,
  y las consultas ORM listaron 4 aulas heredadas y 0 bloques. Falta ejecutar
  la suite completa y concurrencia contra PostgreSQL.
- **Validación, usabilidad y tema visual (22-11-2026):** se reforzaron los
  esquemas de entrada del backend y los formularios del frontend con reglas
  compartidas, mensajes claros y errores HTTP normalizados. Se añadió
  alternancia claro/oscuro con etiqueta de acción e iconos sol/luna, con
  persistencia, y confirmaciones para acciones sensibles. No se cambiaron
  reglas académicas ni permisos. Ruff, 18 pruebas,
  typecheck y build frontend aprobaron; API, frontend y PostgreSQL respondieron
  en local. Detalles en `CAMBIOS_PARA_INFORME.md`.
- **Planificación por carrera, plan y grupo de ingreso (23-11-2026):** se
  añadieron relaciones explícitas de carrera y plan por periodo, grupos de
  ingreso reutilizando la misma versión del plan, asignación de estudiantes al
  grupo y proyección hasta el último semestre curricular. La oferta presenta
  todas las materias del plan con demanda académica; la selección de carreras
  se filtra por facultad. El calendario filtra por facultad, carrera, plan,
  docente y aula y conserva el detalle del paralelo en la misma vista. La
  inscripción exige prerrequisitos aprobados en un periodo
  anterior; una materia reprobada espera a otro periodo. La API previsualiza
  cruces de docente, aula y estudiantes al editar un paralelo. Migración
  `0010_aperturas_plan` aplicada en PostgreSQL local; `alembic check` no detectó
  cambios pendientes. Pasaron 28 pruebas en SQLite y 28 en PostgreSQL temporal,
  Ruff y build TypeScript/Vite. Tras ajustar la sugerencia de demanda y la
  asignación conjunta de plan y grupo, pasaron otra vez 28 pruebas SQLite y
  las 2 pruebas de progresión en PostgreSQL temporal. Falta revisión visual
  autenticada, prueba de concurrencia en PostgreSQL y definir visto bueno de
  notas, tramos modulares exactos y transición de planes anteriores.
- **Integración de `origin/main` (24-11-2026):** se avanzó de `87ec9cb` a
  `07ce28d` conservando los cambios locales. Se resolvieron los cruces en el
  cliente de API, perfil y usuarios; la vista nueva mantiene los datos de
  docentes y estudiantes en solo lectura y permite corregir el teléfono desde
  administración. Se combinaron los campos de `CoursePublic` requeridos por
  reportes y planificación. La dependencia de filtros de reportes se volvió
  asíncrona tras detectar una solicitud que quedaba en espera durante la
  regresión. Pasaron 28 pruebas backend, Ruff, formato y compilación
  TypeScript/Vite. Los cambios siguen sin commit; el stash previo a la
  integración se conserva como respaldo.
- **Currículo — integridad y usabilidad (24-11-2026):** se reforzó la
  publicación de planes (estructura con semestres 1..N y materias, sin vacíos,
  carrera/facultad/materias activas), se bloquearon inconsistencias de
  carreras/facultades y la inactivación de materias usadas por planes VIGENTES,
  y se restringió la asignación a planes INACTIVOS. Se agregaron diagnósticos
  tipados, duplicación de planes con prerrequisitos, generación y renumeración
  de semestres, carga masiva de materias, conteos de uso y filtros en catálogos.
  Migración `0011_curriculum_integrity` creada (índice `materias_plan.materia_id`)
  y aplicada después a PostgreSQL local con autorización del usuario.
  Verificación original del equipo: 34 pruebas backend en SQLite, Ruff y build
  TypeScript/Vite; falta revisión visual autenticada y pruebas de concurrencia.
- **Rediseño de planificación en conversación (24-11-2026):** se aceptó un
  boceto de navegación por semestre con «Oferta y horarios» como espacio
  central. Se registraron en `PENDIENTES_PARA_DECIDIR.md` propuestas para tablas
  ordenables, selección múltiple manual de habilitaciones, filtros académicos,
  capacidad física de aulas separada del cupo del paralelo y turnos modulares
  que simplifiquen horarios repetitivos. Se confirmó para el alcance actual la
  presencialidad, la exigencia de aula antes de abrir inscripciones y el límite
  del cupo según la capacidad del aula. Estas reglas nuevas se documentaron
  en `CONTEXTO_COMPLETO_PROGRAMACION_IV.md` y se implementaron en la migración
  `0013_room_capacity` y las validaciones del servidor. Un
  paralelo puede usar aulas distintas por día; la menor capacidad de sus aulas
  semanales limita su cupo. Reprogramar una sesión a un aula menor que el cupo
  se rechaza. También se rechaza reducir la capacidad de un aula si un paralelo
  con clases futuras allí tiene un cupo mayor; el historial terminado no bloquea.
  Para modalidad MODULAR se confirmó una propuesta de horario habitual de lunes
  a viernes con las horas del turno elegido. El generador inicial y una franja
  predeterminada por turno ya están implementados; la edición de días y aulas
  después de crear el paralelo usa el detalle existente. Personalizar todos los
  días dentro del borrador previo a guardar sigue pendiente de interfaz.
  Para habilitaciones se confirmó selección manual de varias filas, con
  «Seleccionar todos» limitado a la página visible y conteo previo a la acción;
  cada autorización sigue siendo individual. El lote debe ser atómico: si falla
  una selección, ninguna cambia. Los filtros por facultad, carrera, plan y grupo
  y la operación transaccional permanecen pendientes de implementación.
  Se propuso una vista amplia de programación modular por carrera y plan con
  materias sugeridas, turnos, docentes, aulas y fechas generadas. En «Aulas y
  turnos» se confirmó la creación de plantillas modulares nombradas, como
  «Sistema modular 2026», con cantidad de clases y duración diaria editables;
  21 fechas y unas tres horas son valores iniciales, no límites obligatorios.
  Los turnos conservan sus franjas horarias. Desde la fecha inicial se propondrán
  días de lunes a viernes y un fin calculado, incluso si cae en el mes siguiente.
  Los feriados nacionales de Bolivia, departamentales de La Paz e institucionales
  se verificarán y cargarán manualmente en el calendario del periodo existente;
  no hay importación automática. El administrador asigna una plantilla al
  semestre; una plantilla asignada no admite cambios estructurales, y cada
  paralelo modular guarda grupo, turno y objetivo de clases. Para un mismo
  grupo, turno e identificador de paralelo, las materias se programan una
  después de otra; A y B tienen secuencias independientes. La vista previa
  calcula el fin, alerta si no cabe en el semestre y valida cruces antes de
  guardar la secuencia completa de forma transaccional. Un feriado añadido más
  tarde puede reducir las clases efectivas; la oferta muestra la diferencia,
  sin reprogramar automáticamente. Quedan pendientes la política definitiva
  de reprogramación tras cambios de calendario, la edición de todo el horario
  en el borrador y la edición simultánea de secuencias de varias carreras;
  detalles en `PENDIENTES_PARA_DECIDIR.md`.
- **Planificación modular secuencial (24-11-2026):** se implementaron plantillas
  configurables en «Aulas y turnos», selección por semestre y programación por
  grupo/turno desde «Oferta y paralelos». La secuencia crea paralelos con docente,
  aula, cupo, lunes a viernes y fechas efectivas después de feriados manuales.
  La API valida que no se solapen materias del mismo grupo/turno/paralelo y comprueba
  conflictos de docente/aula en fechas reales. Los semestres sin plantilla
  conservan compatibilidad con paralelos modulares anteriores. La migración
  `0012_modular_planning` se aplicó a PostgreSQL local. Verificación: 35 pruebas
  backend en SQLite; la prueba modular también aprobó en PostgreSQL aislado;
  Ruff, formato, TypeScript/Vite y `alembic check` aprobaron. Falta revisión
  visual autenticada y prueba de concurrencia de programaciones simultáneas.
- **Capacidad física de aulas (24-11-2026):** se implementó capacidad positiva
  para aulas nuevas y edición de las existentes sin inventar la capacidad de
  las cuatro aulas locales anteriores (siguen en NULL). El cupo del paralelo
  se contrasta con todas sus aulas semanales y sustitutas; al abrir y al
  inscribir se exige aula y capacidad válida. La reducción de asientos se
  rechaza si hay clases futuras activas con cupo mayor. La oferta estudiantil
  indica cuando el aula no está lista. `0013_room_capacity` se aplicó en
  PostgreSQL local con respaldo en `/tmp/sistemaeducativo-before-0013-20261124.sql`.
  Verificación: 36 pruebas backend en SQLite, pruebas de paralelos y secuencia
  modular en PostgreSQL aislado, Alembic check, Ruff y compilación frontend.
  Cuatro paralelos locales abiertos usan aulas aún sin capacidad y necesitan
  que el administrador registre los asientos reales; la inscripción se rechaza
  mientras tanto. Queda pendiente la revisión visual autenticada.
- **Vista conjunta de oferta y calendario fechado (24-11-2026):** «Oferta y
  paralelos» consulta en una tabla las materias de todos los planes del
  semestre, con facultad, carrera, plan, semestre curricular, demanda,
  paralelos, filtros, ordenación y paginación. La acción de cada fila abre la
  creación del paralelo semestral o el editor de secuencia modular en la misma
  página. Los paralelos se listan en tabla y el calendario muestra una semana
  de clases en fechas reales, omitiendo feriados/cancelaciones y ubicando las
  reprogramaciones en su nueva fecha. El detalle lateral permanece visible
  junto al calendario; los filtros permiten consultar por facultad, carrera,
  plan, docente y aula. Se añadieron rutas administrativas de resumen y
  calendario; no hubo migración. Verificación: 37 pruebas backend en SQLite,
  nueva prueba de integración en PostgreSQL aislado, Ruff y build frontend.
  Falta revisión visual autenticada. La edición conjunta posterior se describe
  abajo.
- **Disponibilidad contextual (24-11-2026):** desde el calendario de «Oferta y
  paralelos» se abre un panel lateral para consultar docentes y aulas activos
  en una fecha y franja, con filtros por turno, texto, recursos libres y asientos
  mínimos. La consulta de API incluye clases efectivas de todos los semestres
  que coinciden en esa fecha, aun cuando correspondan a otras carreras o
  periodos; respeta feriados y reprogramaciones. Si hay un paralelo seleccionado,
  el panel puede asignar un docente, sustituir el aula de una franja semanal
  existente o preparar una nueva franja con aula. La consulta de una fecha es
  orientativa: cada guardado vuelve a validar todas las fechas del paralelo y
  puede rechazar un cruce posterior. No se añadió migración ni se modificaron
  permisos. Verificación: 38 pruebas backend en SQLite, dos casos del flujo en
  PostgreSQL aislado, dos pruebas unitarias Bun para superposición de horas,
  Ruff y compilación frontend. Falta revisión visual autenticada y prueba de
  asignaciones desde la interfaz.
- **Programación modular de varias carreras (24-11-2026):** «Oferta y paralelos»
  ofrece un editor conjunto con planes modulares de distintas facultades y
  carreras en una sola pantalla. En cada plan se eligen grupo de ingreso,
  turno, fecha de inicio, materias y su orden, cupo, docente y aula. La vista
  previa comprueba todas las secuencias y cruces entre ellas; el guardado es
  una sola transacción y no crea paralelos parciales ante error. Se mantienen
  también el editor individual y las reglas existentes de feriados, duración,
  capacidad y no solapamiento del mismo grupo/turno/paralelo. No hubo migración ni
  cambio de permisos. Verificación: 39 pruebas backend en SQLite, prueba del
  lote en PostgreSQL aislado, dos pruebas frontend Bun, Ruff y compilación.
  Falta revisión visual autenticada del editor y prueba manual de sus acciones.
- **Detalle del semestre (25-11-2026):** la lista permite filtrar por estado
  sin modificar datos. La selección de facultad, carrera y plan se agrupa en
  una secuencia visible; la plantilla modular queda en un desplegable y el
  estado de calendario, oferta y habilitaciones se muestra sin duplicar el
  botón de feriados. P07 no autoriza eliminar semestres; la propuesta se
  registró en `PENDIENTES_PARA_DECIDIR.md`. Compilación TypeScript/Vite, dos
  pruebas unitarias Bun y revisión visual autenticada del detalle aprobadas.
- **Tabla de carreras y grupos (25-11-2026):** se quitó el bloque redundante
  de accesos del detalle. Carreras, planes y grupos aparecen en tabla con
  filtros por facultad, carrera y mes de inicio, y orden por carrera,
  facultad, semestre previsto o fecha. La API permite deshacer una apertura
  de grupo solo si no tiene estudiantes ni paralelos; quitar planes y carreras
  conserva sus restricciones previas. Verificación: 40 pruebas backend,
  dos pruebas Bun, compilación frontend y revisión visual autenticada.
- **Enlace contextual a oferta (25-11-2026):** «Planificar» conserva el semestre
  y selecciona el plan de la fila en la oferta y en los filtros de paralelos.
  La compilación frontend aprobó y la oferta del plan de Psicología se revisó
  con sesión administrativa. La separación entre oferta curricular y editor
  modular quedó documentada como propuesta en `PENDIENTES_PARA_DECIDIR.md`.
- **Oferta por grupo (25-11-2026):** el enlace de la tabla conserva el grupo
  de ingreso; Oferta muestra inicialmente su semestre proyectado y puede
  consultar anteriores. Los editores modulares limitan materias a ese
  semestre o anteriores y el backend rechaza programar una materia futura
  para el grupo. La compilación, Ruff y prueba modular aprobaron; se revisó
  visualmente Psicología 2027-2 con seis materias de semestre 1. La auditoría
  detectó que `AperturaPlan` no tiene nombre y que su proyección calculada puede
  verse afectada por periodos solapados; definir la trayectoria estable antes
  de modificar el modelo.
- **Grupo de ingreso y trayectoria estable (25-11-2026):** se confirmó un
  grupo por carrera y semestre académico, vinculado a un plan; sus paralelos
  pueden ser varios. La migración `0014_group_trajectory` agrega un código
  visible y conserva una asignación por cada semestre curricular del grupo.
  Completa periodos futuros disponibles sin solapamiento ni cambio de
  asignaciones previas. La API y PostgreSQL impiden duplicar el grupo de una
  carrera en el mismo semestre, incluso con otra versión del plan. La tabla
  muestra el código y la trayectoria; «Iniciar grupo» pide revisar carrera,
  plan y duración. Verificación: 40 pruebas backend, Ruff y compilación
  TypeScript/Vite aprobados; migración y `alembic check` aprobados en una copia
  temporal de PostgreSQL. La migración se aplicó a la base local: preservó dos
  grupos y creó cuatro espacios de trayectoria. La revisión visual autenticada
  confirmó el código y los periodos proyectados en la tabla y el resumen previo
  a iniciar otro grupo, sin crear datos durante esa revisión.
- **Horario del turno en secuencia modular (25-11-2026):** la base local tenía
  plantilla modular de tres horas, pero ningún bloque horario configurado;
  por eso la programación quedaba bloqueada pese a completar materia, docente,
  aula y cupo. Los editores individual y conjunto explican qué es la franja y
  permiten elegir un horario compatible existente o definir la hora de inicio
  y crear el predeterminado sin abandonar el borrador. El servidor comunica
  con claridad la dependencia y se corrigió la promoción de una franja
  existente cuando otra ya era predeterminada. Verificación: 41 pruebas backend,
  una prueba de promoción en PostgreSQL aislado, Ruff, compilación
  TypeScript/Vite y revisión visual autenticada del aviso y del cálculo de
  hora final. No se creó una franja en la base local: el
  administrador debe elegir la hora de inicio.
- **Acciones de oferta y docente pendiente (25-11-2026):** la tabla de carreras
  expone quitar carrera/plan y deshacer grupo con restricciones visibles;
  «Programar secuencia» abre el editor con la materia seleccionada. Las
  secuencias pueden guardarse sin docente, con aula y cupo, y permanecen con
  inscripción cerrada hasta completar la asignación. La tabla «Oferta
  programada» permite abrir/cerrar inscripciones por fila o en lote atómico,
  consultar detalles en línea y preparar otro paralelo de la misma materia.
  Se aprobaron 42 pruebas backend, dos casos críticos en PostgreSQL temporal,
  Ruff y compilación TypeScript/Vite. La revisión autenticada verificó las
  acciones y el editor sin modificar datos académicos.
- **Diagnóstico de secuencias (25-11-2026):** los editores modulares explican
  junto a «Guardar secuencia (N materias)» qué falta o qué cruce rechaza la
  vista previa; el botón deshabilitado se muestra gris. El error del servidor
  identifica materia, paralelo, aula o docente, fecha y hora del cruce. En la
  interfaz se reprodujo el conflicto de AULA D-01 para Psicología 2027-2 y se
  verificó que AULA D-02 deja habilitado el guardado, sin crear datos. Ruff,
  prueba modular y compilación frontend aprobados. La propuesta de agenda de
  aulas quedó en `PENDIENTES_PARA_DECIDIR.md` sin alterar aún el flujo.
- **Cruce de materias del grupo (25-11-2026):** el error de secuencia indica
  las materias, paralelos y fechas superpuestas del mismo grupo/turno/paralelo. Se
  verificó con prueba modular y Ruff. La disponibilidad anticipada de aulas y
  docentes y el modal de agenda quedaron planificados en
  `PENDIENTES_PARA_DECIDIR.md`; aún no están implementados.
- **Secuencias independientes por paralelo (25-11-2026):** se corrigió la
  restricción que comparaba todas las materias de un grupo/turno entre sí.
  Ahora solo impide solapar materias distintas del mismo grupo, turno e
  identificador de paralelo. A y B pueden seguir órdenes propios; docentes,
  aulas y estudiantes inscritos siguen sujetos a cruces por fecha y hora.
  Los editores calculan «último módulo» solo para el paralelo elegido. La
  prueba modular aprobó en SQLite y PostgreSQL temporal; Ruff y compilación
  TypeScript/Vite aprobaron. No se requirió migración.
- **Plan de disponibilidad y agenda (25-11-2026):** se detalló en
  `PENDIENTES_PARA_DECIDIR.md` la propuesta de proyectar fechas por paralelo,
  consultar recursos para todas las clases del borrador, deshabilitar opciones
  ocupadas con explicación y abrir una agenda de siete días desde cada materia.
  Sigue siendo planificación; no se añadieron pantallas, API ni reglas nuevas.
- **Disponibilidad y agenda implementadas (25-11-2026):** la API administrativa
  consulta clases efectivas de todos los periodos superpuestos en un rango.
  Ambos editores modulares proyectan las fechas por materia antes de asignar
  recursos, señalan choques de secuencia y deshabilitan docentes y aulas
  ocupados o sin capacidad. Cada materia abre una agenda de aula de lunes a
  domingo, 06:00–22:00; el docente puede quedar pendiente. Se mantiene la
  validación transaccional al guardar. Aprobaron la prueba de disponibilidad
  con feriado y reprogramación, las pruebas modulares de backend, cinco
  pruebas frontend y la compilación TypeScript/Vite. La revisión autenticada
  en el navegador confirmó bloqueos de docente y aula, selección de un aula
  libre y vista previa válida; no se guardó un paralelo en esa revisión.
- **Conteo y calendario de oferta (25-11-2026):** «Paralelos activos» agrupa
  las materias del mismo plan o grupo, turno e identificador; en Psicología
  2027-2 muestra dos paralelos A/B y doce materias programadas. La oferta
  programada y el calendario filtran por A/B además de los filtros académicos
  existentes. El calendario presenta una grilla semanal de horas desde 07:00
  hasta 22:00 como mínimo; la agenda de aulas se abre desde la cabecera de
  asignaciones con una materia elegida. Se verificó en navegador el conteo,
  el filtro B (seis materias) y la grilla sin desborde de página. Seis pruebas
  frontend y compilación TypeScript/Vite aprobaron.
- **Arranque Windows corregido (25-11-2026):** el equipo local bloqueó con
  AppLocker los ejecutables `alembic.exe` y `uvicorn.exe` creados por uv
  (`Failed to spawn`, error 4551). Los scripts `dev-windows.ps1` y
  `principal-windows.ps1`, el Makefile y los comandos documentados ahora
  invocan los módulos con `uv run python -m ...`. Verificación real: se
  aplicaron las migraciones pendientes `0009` a `0014` en PostgreSQL local;
  API `/docs` y frontend `/` respondieron 200 con el nuevo arranque.
- **Fichas ampliadas, búsqueda y detalle (26-11-2026):** se implementaron
  dirección y fecha de nacimiento para todas las cuentas, título y especialidad
  para docentes y carrera/plan/grupo de ingreso para estudiantes. La API busca
  por esos campos, devuelve la ficha en la respuesta de usuarios y valida en
  servidor los campos por rol, plan activo, carrera/facultad activas,
  pertenencia del grupo al plan y conservación del historial. La interfaz
  administra los campos en alta/corrección, muestra el detalle y amplía el
  perfil de solo lectura. Migración `0015_user_profile_details` aplicada en
  PostgreSQL local; `alembic check` sin cambios pendientes. Verificación:
  45 pruebas backend, Ruff y compilación TypeScript/Vite aprobados. Falta
  revisión visual autenticada del nuevo flujo.
